import type { ExtractedGitLink } from "./types.js";

// ─── Owner Resolution & Repo Categorization ─────────────────────────
//
// NO popular orgs list. Instead, we cross-reference profile links with
// repo links to determine who the candidate actually is.
//
// OWNERSHIP LOGIC:
//
// 1. SINGLE PROFILE LINK
//    Only one github.com/username found → that's the owner. HIGH.
//
// 2. MULTIPLE PROFILE LINKS (common on portfolios with team/collab links)
//    Cross-reference each profile's username against repo links:
//    - Count how many repos belong to each profile username
//    - Profile with the most matching repos = the owner
//    - If clear majority → HIGH
//    - If close/tied → MEDIUM + flag
//    - If no repos match any profile → pick first, LOW + flag
//
// 3. NO PROFILE LINKS, ONLY REPOS
//    Group repos by username:
//    - If one username owns majority → infer as owner, MEDIUM
//    - If tied → LOW
//
// 4. NOTHING → NONE
//
// After owner is determined, repos are categorized:
//   - ownedRepos:    repo.username === owner (case-insensitive)
//   - externalRepos: repo.username !== owner (contributions, PRs, references)

interface OwnerResolution {
  ownerProfile: ExtractedGitLink | null;
  confidence: "high" | "medium" | "low" | "none";
  ownedRepos: ExtractedGitLink[];
  externalRepos: ExtractedGitLink[];
  warnings: string[];
}

export function resolveOwnerAndCategorize(
  links: ExtractedGitLink[],
  sourceContext?: string
): OwnerResolution {
  const warnings: string[] = [];

  if (links.length === 0) {
    return {
      ownerProfile: null,
      confidence: "none",
      ownedRepos: [],
      externalRepos: [],
      warnings: ["No git links found"],
    };
  }

  const profileLinks = links.filter((l) => l.type === "profile");
  const repoLinks = links.filter((l) => l.type === "repo");

  let ownerUsername: string | null = null;
  let ownerProfile: ExtractedGitLink | null = null;
  let confidence: "high" | "medium" | "low" | "none" = "none";

  // ═══════════════════════════════════════════════════════════════════
  // CASE 1: Exactly one unique profile username → owner
  // ═══════════════════════════════════════════════════════════════════

  // Dedupe profiles by username (case-insensitive)
  const uniqueProfiles = dedupeProfilesByUsername(profileLinks);

  if (uniqueProfiles.length === 1) {
    ownerProfile = uniqueProfiles[0];
    ownerUsername = ownerProfile.username;
    confidence = "high";
  }

  // ═══════════════════════════════════════════════════════════════════
  // CASE 2: Multiple distinct profile usernames → cross-reference
  // ═══════════════════════════════════════════════════════════════════

  else if (uniqueProfiles.length > 1) {
    const profileUsernames = uniqueProfiles.map((p) => p.username.toLowerCase());
    warnings.push(
      `Multiple profile links found: ${uniqueProfiles.map((p) => p.username).join(", ")}`
    );

    if (repoLinks.length > 0) {
      // Count how many repos each profile username owns
      const profileRepoScores = new Map<string, number>();
      for (const profile of uniqueProfiles) {
        const lower = profile.username.toLowerCase();
        const count = repoLinks.filter(
          (r) => r.username.toLowerCase() === lower
        ).length;
        profileRepoScores.set(lower, count);
      }

      // Sort by score descending
      const scored = [...profileRepoScores.entries()].sort((a, b) => b[1] - a[1]);
      const topScore = scored[0][1];
      const topUsername = scored[0][0];

      if (topScore > 0) {
        // At least one profile has matching repos
        const secondScore = scored.length > 1 ? scored[1][1] : 0;

        ownerProfile = uniqueProfiles.find(
          (p) => p.username.toLowerCase() === topUsername
        )!;
        ownerUsername = ownerProfile.username;

        if (topScore > secondScore) {
          confidence = "high";
          warnings.push(
            `Owner determined by repo cross-reference: ${scored.map(([u, c]) => `${u}(${c} repos)`).join(", ")}`
          );
        } else {
          // Tied — could go either way
          confidence = "medium";
          warnings.push(
            `⚠ Tied repo ownership between profiles: ${scored.map(([u, c]) => `${u}(${c} repos)`).join(", ")}. Picked ${topUsername}.`
          );
        }
      } else {
        // No repos match ANY profile — weird situation
        // Pick the first profile but flag it
        ownerProfile = uniqueProfiles[0];
        ownerUsername = ownerProfile.username;
        confidence = "low";
        warnings.push(
          "None of the profile links match any repo owner — picking first profile"
        );
      }
    } else {
      // Multiple profiles but NO repos at all — can't cross-reference
      // Pick first, flag low confidence
      ownerProfile = uniqueProfiles[0];
      ownerUsername = ownerProfile.username;
      confidence = "low";
      warnings.push(
        "Multiple profiles found but no repos to cross-reference — picking first"
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // CASE 3: No profile links — infer owner from repo usernames
  // ═══════════════════════════════════════════════════════════════════

  else if (profileLinks.length === 0 && repoLinks.length > 0) {
    // Group repos by username
    const usernameCounts = new Map<string, { count: number; link: ExtractedGitLink }>();
    for (const link of repoLinks) {
      const lower = link.username.toLowerCase();
      const existing = usernameCounts.get(lower);
      if (existing) {
        existing.count++;
      } else {
        usernameCounts.set(lower, { count: 1, link });
      }
    }

    const sorted = [...usernameCounts.entries()].sort((a, b) => b[1].count - a[1].count);
    const topUser = sorted[0];
    const topLink = topUser[1].link;

    // Build a synthetic profile link from the inferred owner
    const host = topLink.provider === "github" ? "github.com"
               : topLink.provider === "gitlab" ? "gitlab.com"
               : "bitbucket.org";

    ownerProfile = {
      url: `https://${host}/${topLink.username}`,
      provider: topLink.provider,
      type: "profile",
      username: topLink.username,
    };
    ownerUsername = topLink.username;

    if (sorted.length === 1) {
      confidence = "medium";
      warnings.push("No profile link found — all repos belong to same user, inferred as owner");
    } else {
      const secondUser = sorted[1];
      if (topUser[1].count > secondUser[1].count) {
        confidence = "medium";
        warnings.push(
          `No profile link found — inferred from repo majority: ${sorted.map(([u, d]) => `${u}(${d.count})`).join(", ")}`
        );
      } else {
        confidence = "low";
        warnings.push(
          `No profile link found — tied repo ownership: ${sorted.map(([u, d]) => `${u}(${d.count})`).join(", ")}. Picked ${topUser[0]}.`
        );
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Categorize repos: owned vs external
  // ═══════════════════════════════════════════════════════════════════

  const ownedRepos: ExtractedGitLink[] = [];
  const externalRepos: ExtractedGitLink[] = [];

  for (const link of repoLinks) {
    if (ownerUsername && link.username.toLowerCase() === ownerUsername.toLowerCase()) {
      ownedRepos.push(link);
    } else {
      externalRepos.push(link);
    }
  }

  return {
    ownerProfile,
    confidence,
    ownedRepos,
    externalRepos,
    warnings,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Dedupes profile links by username (case-insensitive).
 * Keeps the first occurrence of each unique username.
 */
export function dedupeProfilesByUsername(profiles: ExtractedGitLink[]): ExtractedGitLink[] {
  const seen = new Set<string>();
  const result: ExtractedGitLink[] = [];
  for (const profile of profiles) {
    const lower = profile.username.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(profile);
    }
  }
  return result;
}
