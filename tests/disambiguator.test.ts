import { describe, it, expect } from "vitest";
import { resolveOwnerAndCategorize } from "../src/disambiguator.js";
import type { ExtractedGitLink, GitProvider, GitLinkType } from "../src/types.js";

// ─── Helper to build ExtractedGitLink objects concisely ─────────────

function makeProfile(
  username: string,
  provider: GitProvider = "github"
): ExtractedGitLink {
  const host =
    provider === "github"
      ? "github.com"
      : provider === "gitlab"
        ? "gitlab.com"
        : "bitbucket.org";
  return {
    url: `https://${host}/${username}`,
    provider,
    type: "profile",
    username,
  };
}

function makeRepo(
  username: string,
  repo: string,
  provider: GitProvider = "github"
): ExtractedGitLink {
  const host =
    provider === "github"
      ? "github.com"
      : provider === "gitlab"
        ? "gitlab.com"
        : "bitbucket.org";
  return {
    url: `https://${host}/${username}/${repo}`,
    provider,
    type: "repo",
    username,
    repo,
  };
}

function makeGist(username: string): ExtractedGitLink {
  return {
    url: `https://gist.github.com/${username}/abc123`,
    provider: "github",
    type: "gist",
    username,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// resolveOwnerAndCategorize
// ═══════════════════════════════════════════════════════════════════════

describe("resolveOwnerAndCategorize", () => {
  // ── CASE 0: Empty links ───────────────────────────────────────────
  describe("empty links", () => {
    it("returns none confidence with null owner", () => {
      const result = resolveOwnerAndCategorize([]);
      expect(result.confidence).toBe("none");
      expect(result.ownerProfile).toBeNull();
      expect(result.ownedRepos).toEqual([]);
      expect(result.externalRepos).toEqual([]);
      expect(result.warnings).toContain("No git links found");
    });
  });

  // ── CASE 1: Single profile link ───────────────────────────────────
  describe("single profile link", () => {
    it("returns high confidence with that profile as owner", () => {
      const links = [makeProfile("johndoe")];
      const result = resolveOwnerAndCategorize(links);
      expect(result.confidence).toBe("high");
      expect(result.ownerProfile).not.toBeNull();
      expect(result.ownerProfile!.username).toBe("johndoe");
    });

    it("single profile + matching repos → high confidence, repos categorized as owned", () => {
      const links = [
        makeProfile("johndoe"),
        makeRepo("johndoe", "project-a"),
        makeRepo("johndoe", "project-b"),
      ];
      const result = resolveOwnerAndCategorize(links);
      expect(result.confidence).toBe("high");
      expect(result.ownerProfile!.username).toBe("johndoe");
      expect(result.ownedRepos).toHaveLength(2);
      expect(result.externalRepos).toHaveLength(0);
    });

    it("single profile + non-matching repos → high confidence, repos categorized as external", () => {
      const links = [
        makeProfile("johndoe"),
        makeRepo("facebook", "react"),
        makeRepo("google", "chrome"),
      ];
      const result = resolveOwnerAndCategorize(links);
      expect(result.confidence).toBe("high");
      expect(result.ownerProfile!.username).toBe("johndoe");
      expect(result.ownedRepos).toHaveLength(0);
      expect(result.externalRepos).toHaveLength(2);
    });

    it("single profile + mix of owned and external repos", () => {
      const links = [
        makeProfile("johndoe"),
        makeRepo("johndoe", "my-app"),
        makeRepo("facebook", "react"),
      ];
      const result = resolveOwnerAndCategorize(links);
      expect(result.confidence).toBe("high");
      expect(result.ownedRepos).toHaveLength(1);
      expect(result.ownedRepos[0].repo).toBe("my-app");
      expect(result.externalRepos).toHaveLength(1);
      expect(result.externalRepos[0].repo).toBe("react");
    });
  });

  // ── CASE 1b: Duplicate profiles (same username) ──────────────────
  describe("duplicate profiles with same username", () => {
    it("deduplicates profiles by username (case-insensitive) → treated as single profile", () => {
      const links = [
        makeProfile("JohnDoe"),
        makeProfile("johndoe"),
        makeRepo("johndoe", "app"),
      ];
      const result = resolveOwnerAndCategorize(links);
      expect(result.confidence).toBe("high");
      expect(result.ownerProfile!.username.toLowerCase()).toBe("johndoe");
      expect(result.ownedRepos).toHaveLength(1);
    });
  });

  // ── CASE 2: Multiple profile links ────────────────────────────────
  describe("multiple distinct profiles", () => {
    it("one profile has more matching repos → high confidence, picks it", () => {
      const links = [
        makeProfile("alice"),
        makeProfile("bob"),
        makeRepo("alice", "project-1"),
        makeRepo("alice", "project-2"),
        makeRepo("bob", "project-3"),
      ];
      const result = resolveOwnerAndCategorize(links);
      expect(result.confidence).toBe("high");
      expect(result.ownerProfile!.username).toBe("alice");
      expect(result.ownedRepos).toHaveLength(2);
      expect(result.externalRepos).toHaveLength(1);
    });

    it("tied repo counts → medium confidence", () => {
      const links = [
        makeProfile("alice"),
        makeProfile("bob"),
        makeRepo("alice", "project-1"),
        makeRepo("bob", "project-2"),
      ];
      const result = resolveOwnerAndCategorize(links);
      expect(result.confidence).toBe("medium");
      // Should pick one (the first in sorted order)
      expect(result.ownerProfile).not.toBeNull();
    });

    it("no repos at all → low confidence, picks first", () => {
      const links = [makeProfile("alice"), makeProfile("bob")];
      const result = resolveOwnerAndCategorize(links);
      expect(result.confidence).toBe("low");
      expect(result.ownerProfile!.username).toBe("alice");
      expect(result.warnings.some((w) => w.includes("no repos to cross-reference"))).toBe(true);
    });

    it("repos match none of the profiles → low confidence", () => {
      const links = [
        makeProfile("alice"),
        makeProfile("bob"),
        makeRepo("charlie", "project-1"),
      ];
      const result = resolveOwnerAndCategorize(links);
      expect(result.confidence).toBe("low");
      expect(result.ownerProfile!.username).toBe("alice"); // picks first
      expect(result.warnings.some((w) => w.includes("None of the profile links match"))).toBe(true);
    });

    it("includes warnings about multiple profiles", () => {
      const links = [
        makeProfile("alice"),
        makeProfile("bob"),
        makeRepo("alice", "app"),
      ];
      const result = resolveOwnerAndCategorize(links);
      expect(result.warnings.some((w) => w.includes("Multiple profile links found"))).toBe(true);
    });
  });

  // ── CASE 3: No profile links, only repos ──────────────────────────
  describe("no profiles, only repos", () => {
    it("single username dominates → medium confidence, infers profile", () => {
      const links = [
        makeRepo("johndoe", "app-1"),
        makeRepo("johndoe", "app-2"),
        makeRepo("facebook", "react"),
      ];
      const result = resolveOwnerAndCategorize(links);
      expect(result.confidence).toBe("medium");
      expect(result.ownerProfile).not.toBeNull();
      expect(result.ownerProfile!.username).toBe("johndoe");
      expect(result.ownerProfile!.type).toBe("profile");
      // Synthetic profile URL should be constructed
      expect(result.ownerProfile!.url).toBe("https://github.com/johndoe");
      expect(result.ownedRepos).toHaveLength(2);
      expect(result.externalRepos).toHaveLength(1);
    });

    it("all repos from one user → medium confidence", () => {
      const links = [
        makeRepo("johndoe", "app-1"),
        makeRepo("johndoe", "app-2"),
      ];
      const result = resolveOwnerAndCategorize(links);
      expect(result.confidence).toBe("medium");
      expect(result.ownerProfile!.username).toBe("johndoe");
      expect(result.warnings.some((w) => w.includes("all repos belong to same user"))).toBe(true);
    });

    it("tied usernames → low confidence", () => {
      const links = [
        makeRepo("alice", "project-1"),
        makeRepo("bob", "project-2"),
      ];
      const result = resolveOwnerAndCategorize(links);
      expect(result.confidence).toBe("low");
      expect(result.ownerProfile).not.toBeNull();
      expect(result.warnings.some((w) => w.includes("tied repo ownership"))).toBe(true);
    });

    it("infers synthetic profile URL correctly for GitLab repos", () => {
      const links = [makeRepo("johndoe", "project", "gitlab")];
      const result = resolveOwnerAndCategorize(links);
      expect(result.ownerProfile!.url).toBe("https://gitlab.com/johndoe");
      expect(result.ownerProfile!.provider).toBe("gitlab");
    });

    it("infers synthetic profile URL correctly for Bitbucket repos", () => {
      const links = [makeRepo("team", "project", "bitbucket")];
      const result = resolveOwnerAndCategorize(links);
      expect(result.ownerProfile!.url).toBe("https://bitbucket.org/team");
      expect(result.ownerProfile!.provider).toBe("bitbucket");
    });
  });

  // ── Case-insensitive matching ─────────────────────────────────────
  describe("case-insensitive username matching", () => {
    it("matches repos to profile regardless of case", () => {
      const links = [
        makeProfile("JohnDoe"),
        makeRepo("johndoe", "my-app"),
        makeRepo("JOHNDOE", "other-app"),
      ];
      const result = resolveOwnerAndCategorize(links);
      expect(result.confidence).toBe("high");
      expect(result.ownedRepos).toHaveLength(2);
      expect(result.externalRepos).toHaveLength(0);
    });

    it("case-insensitive matching in repo-only scenario", () => {
      const links = [
        makeRepo("JohnDoe", "app-1"),
        makeRepo("johndoe", "app-2"),
        makeRepo("JOHNDOE", "app-3"),
      ];
      const result = resolveOwnerAndCategorize(links);
      expect(result.confidence).toBe("medium");
      expect(result.ownedRepos).toHaveLength(3);
    });
  });

  // ── Gists and other link types ────────────────────────────────────
  describe("non-repo/profile link types", () => {
    it("gists are not counted as profiles or repos", () => {
      // Gists have type "gist" — they're filtered out by profileLinks/repoLinks
      const links = [makeGist("johndoe")];
      const result = resolveOwnerAndCategorize(links);
      // No profiles, no repos → should be none
      expect(result.confidence).toBe("none");
      expect(result.ownerProfile).toBeNull();
    });

    it("gists alongside profiles and repos don't affect resolution", () => {
      const links = [
        makeProfile("johndoe"),
        makeRepo("johndoe", "app"),
        makeGist("johndoe"),
      ];
      const result = resolveOwnerAndCategorize(links);
      expect(result.confidence).toBe("high");
      expect(result.ownedRepos).toHaveLength(1);
      // Gist not in ownedRepos or externalRepos
      expect(result.ownedRepos.every((r) => r.type === "repo")).toBe(true);
    });
  });

  // ── Source context parameter ──────────────────────────────────────
  describe("sourceContext parameter", () => {
    it("accepts sourceContext without changing behavior", () => {
      const links = [makeProfile("johndoe")];
      const result = resolveOwnerAndCategorize(links, "portfolio");
      expect(result.confidence).toBe("high");
      expect(result.ownerProfile!.username).toBe("johndoe");
    });
  });

  // ── Mixed provider repos ──────────────────────────────────────────
  describe("mixed providers", () => {
    it("handles repos across GitHub and GitLab for the same user", () => {
      const links = [
        makeProfile("johndoe", "github"),
        makeRepo("johndoe", "app", "github"),
        makeRepo("johndoe", "api", "gitlab"),
      ];
      const result = resolveOwnerAndCategorize(links);
      expect(result.confidence).toBe("high");
      // Both repos should be owned since username matches
      expect(result.ownedRepos).toHaveLength(2);
    });
  });
});
