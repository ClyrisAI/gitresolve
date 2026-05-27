// ─── Input Classification ───────────────────────────────────────────

export type InputType =
  | "repo_url"
  | "github_profile"
  | "portfolio"
  | "resume_file"
  | "resume_url"
  | "linkedin"
  | "unknown";

// ─── Git Provider Types (from your existing codebase) ───────────────

export type GitProvider = "github" | "gitlab" | "bitbucket";

export interface ParsedRepo {
  provider: GitProvider;
  host: string;
  owner: string;
  repo: string;
  fullPath: string;
  normalized: string;
}

// ─── Resolver Output ────────────────────────────────────────────────

export type GitLinkType = "profile" | "repo" | "gist" | "other";

export interface ExtractedGitLink {
  url: string;
  provider: GitProvider;
  type: GitLinkType;
  username: string;           // extracted username/owner
  repo?: string;              // repo name if type === "repo"
}

/**
 * The final resolved result for a single candidate source.
 *
 * Key distinction:
 * - ownerProfile: the candidate's actual git profile
 * - ownedRepos:   repos where owner matches the candidate's username
 * - externalRepos: repos referenced but owned by others (contributions, PRs, libs)
 *
 * Downstream can decide:
 * - Use ownedRepos directly for evaluation
 * - Fetch the owner's GitHub profile repos and cross-reference
 * - Treat externalRepos as "contributions" signal
 */
export interface ResolverResult {
  source: string;                   // original input (URL or filename)
  sourceType: InputType;

  // ── Owner resolution ──
  ownerProfile: ExtractedGitLink | null;   // best guess at candidate's git profile
  confidence: "high" | "medium" | "low" | "none";

  // ── Categorized repos ──
  ownedRepos: ExtractedGitLink[];          // repos where username === owner
  externalRepos: ExtractedGitLink[];       // repos owned by someone else (contributions, references)

  // ── Raw data ──
  allLinks: ExtractedGitLink[];            // everything found, unfiltered

  // ── Diagnostics ──
  warnings: string[];
  error?: string;
}

// ─── Provider Hosts ─────────────────────────────────────────────────

export const GIT_HOSTS: Record<string, GitProvider> = {
  "github.com": "github",
  "www.github.com": "github",
  "gitlab.com": "gitlab",
  "www.gitlab.com": "gitlab",
  "bitbucket.org": "bitbucket",
  "www.bitbucket.org": "bitbucket",
};
