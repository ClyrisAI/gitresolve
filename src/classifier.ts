import type { GitProvider, ParsedRepo, InputType, ExtractedGitLink, GitLinkType } from "./types.js";
import { GIT_HOSTS } from "./types.js";

// ─── Repo URL Parser (your existing logic) ──────────────────────────

export function parseRepoUrl(repoUrl: string): {
  valid: boolean;
  data?: ParsedRepo;
  error?: string;
} {
  try {
    const url = new URL(repoUrl);
    const host = url.hostname.toLowerCase();

    let provider: GitProvider | null = null;

    if (host === "github.com") provider = "github";
    else if (host === "gitlab.com") provider = "gitlab";
    else if (host === "bitbucket.org") provider = "bitbucket";
    else {
      return { valid: false, error: "Unsupported provider" };
    }

    let parts = url.pathname
      .replace(/\.git$/, "")
      .replace(/\/+$/, "")
      .split("/")
      .filter(Boolean);

    if (parts.length < 2) {
      return { valid: false, error: "Invalid repo path" };
    }

    if (provider === "github" && GITHUB_RESERVED_PATHS.has(parts[0])) return { valid: false, error: "Reserved path" };
    if (provider === "gitlab" && GITLAB_RESERVED_PATHS.has(parts[0])) return { valid: false, error: "Reserved path" };
    if (provider === "bitbucket" && BITBUCKET_RESERVED_PATHS.has(parts[0])) return { valid: false, error: "Reserved path" };

    let owner: string;
    let repo: string;
    let fullPath: string;
    let suffixParts: string[] = [];

    if (provider === "github" || provider === "bitbucket") {
      owner = parts[0];
      repo = parts[1];
      fullPath = `${owner}/${repo}`;
      suffixParts = parts.slice(2);
    } else if (provider === "gitlab") {
      const stopIndex = parts.findIndex(
        (p) => p === "-" || p === "tree" || p === "blob"
      );
      const repoParts =
        stopIndex === -1 ? parts : parts.slice(0, stopIndex);

      if (repoParts.length < 2) {
        return { valid: false, error: "Invalid GitLab repo path" };
      }

      owner = repoParts[0];
      repo = repoParts[repoParts.length - 1];
      fullPath = repoParts.join("/");
      suffixParts = stopIndex === -1 ? [] : parts.slice(stopIndex);
    }

    let contribution: { type: "pull_request" | "issue"; number: string } | undefined;
    
    if (provider === "github") {
      if (suffixParts[0] === "pull" && suffixParts[1] && /^\d+$/.test(suffixParts[1])) {
        contribution = { type: "pull_request", number: suffixParts[1] };
      } else if (suffixParts[0] === "issues" && suffixParts[1] && /^\d+$/.test(suffixParts[1])) {
        contribution = { type: "issue", number: suffixParts[1] };
      }
    } else if (provider === "gitlab") {
      const typePart = suffixParts[0] === "-" ? suffixParts[1] : suffixParts[0];
      const numPart = suffixParts[0] === "-" ? suffixParts[2] : suffixParts[1];
      if (typePart === "merge_requests" && numPart && /^\d+$/.test(numPart)) {
        contribution = { type: "pull_request", number: numPart };
      } else if (typePart === "issues" && numPart && /^\d+$/.test(numPart)) {
        contribution = { type: "issue", number: numPart };
      }
    } else if (provider === "bitbucket") {
      if (suffixParts[0] === "pull-requests" && suffixParts[1] && /^\d+$/.test(suffixParts[1])) {
        contribution = { type: "pull_request", number: suffixParts[1] };
      } else if (suffixParts[0] === "issues" && suffixParts[1] && /^\d+$/.test(suffixParts[1])) {
        contribution = { type: "issue", number: suffixParts[1] };
      }
    }

    return {
      valid: true,
      data: {
        provider: provider!,
        host,
        owner: owner!,
        repo: repo!,
        fullPath: fullPath!,
        normalized: `https://${host}/${fullPath!}`,
        contribution,
      },
    };
  } catch {
    return { valid: false, error: "Invalid URL" };
  }
}

// ─── Input Classifier ───────────────────────────────────────────────

export function classifyInput(input: string): InputType {
  const trimmed = input.trim();

  // Check if it's a file path (resume)
  if (/\.(pdf|docx?|rtf)$/i.test(trimmed)) return "resume_file";

  // Try to parse as URL
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "unknown";
  }

  const host = url.hostname.toLowerCase();

  // LinkedIn — flag and skip
  if (host.includes("linkedin.com")) return "linkedin";

  // Check if it's a valid repo URL
  const repoResult = parseRepoUrl(trimmed);
  if (repoResult.valid) return "repo_url";

  // If it's a known git provider but not a valid repo, assume it's a profile
  if (host === "github.com" || host === "www.github.com" || host === "gitlab.com" || host === "www.gitlab.com" || host === "bitbucket.org" || host === "www.bitbucket.org") {
    const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (parts.length === 0) return "unknown";
    return "git_profile";
  }

  // Everything else with a valid URL → assume portfolio
  return "portfolio";
}

// ─── Git Link Parser (GitHub / GitLab / Bitbucket) ──────────────────
// Takes a raw URL and if it's from a supported git host, classifies it

// Known GitHub "system" paths that are NOT users
const GITHUB_RESERVED_PATHS = new Set([
  "features", "explore", "marketplace", "pricing", "sponsors",
  "topics", "trending", "collections", "events", "about",
  "security", "login", "signup", "settings", "notifications",
  "new", "organizations", "enterprise", "team", "customer-stories",
  "readme", "codespaces", "copilot", "issues", "pulls",
  "discussions", "actions", "projects", "packages", "stars",
  "orgs", "apps", "site", "solutions", "resources", "contact",
  "github", "_private", "get-started", "search-github", "articles",
  "site-policy", "trust-center", "partners", "accelerator", 
  "premium-support", "mcp", "why-github", "assets", "images", 
  "avatars", "search", "users", "blog", "support", "status"
]);

const GITLAB_RESERVED_PATHS = new Set([
  "explore", "help", "admin", "dashboard", "users", "groups",
  "projects", "snippets", "-",
]);

const BITBUCKET_RESERVED_PATHS = new Set([
  "product", "pricing", "account", "dashboard", "support",
]);

export function parseGitLink(rawUrl: string): ExtractedGitLink | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const provider = GIT_HOSTS[host];
  if (!provider) return null;

  const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const firstPart = parts[0].toLowerCase();

  // Skip static assets
  const lastPart = parts[parts.length - 1].toLowerCase();
  if (lastPart.endsWith(".png") || lastPart.endsWith(".xml") || lastPart.endsWith(".json") || lastPart.endsWith(".ico") || lastPart.endsWith(".txt") || lastPart.endsWith(".svg") || lastPart.endsWith(".woff") || lastPart.endsWith(".woff2") || lastPart.endsWith(".ttf") || lastPart.endsWith(".css") || lastPart.endsWith(".js") || lastPart.endsWith(".map")) {
    return null;
  }

  // Skip reserved paths per provider
  if (provider === "github" && GITHUB_RESERVED_PATHS.has(firstPart)) return null;
  if (provider === "gitlab" && GITLAB_RESERVED_PATHS.has(firstPart)) return null;
  if (provider === "bitbucket" && BITBUCKET_RESERVED_PATHS.has(firstPart)) return null;

  // gist.github.com
  if (host === "gist.github.com" || firstPart === "gist") {
    return {
      url: rawUrl,
      provider: "github",
      type: "gist",
      username: parts.length >= 2 ? parts[1] : parts[0],
    };
  }

  const username = parts[0];

  // Validate with parseRepoUrl for repo links
  if (parts.length >= 2) {
    const repoName = parts[1];

    // Skip if second part is a profile tab (GitHub-specific)
    if (provider === "github") {
      const profileTabs = new Set(["repositories", "stars", "followers", "following"]);
      if (profileTabs.has(repoName.toLowerCase())) {
        return { url: rawUrl, provider, type: "profile", username };
      }
    }

    // GitLab special markers — everything after "-" is not a repo
    if (provider === "gitlab" && repoName === "-") {
      return { url: rawUrl, provider, type: "profile", username };
    }

    const parsed = parseRepoUrl(rawUrl);
    if (parsed.valid) {
      if (parsed.data!.contribution) {
        return {
          url: rawUrl, // Preserve raw URL for exact PR/Issue matching
          provider,
          type: parsed.data!.contribution.type,
          username: parsed.data!.owner,
          repo: parsed.data!.repo,
          number: parsed.data!.contribution.number,
        };
      }
      return {
        url: parsed.data!.normalized,
        provider,
        type: "repo",
        username: parsed.data!.owner,
        repo: parsed.data!.repo,
      };
    }

    // If parseRepoUrl didn't validate, still try as repo
    return {
      url: rawUrl,
      provider,
      type: "repo",
      username,
      repo: repoName,
    };
  }

  // Single path segment — profile
  if (parts.length === 1) {
    return { url: rawUrl, provider, type: "profile", username };
  }

  return { url: rawUrl, provider, type: "other", username };
}

// ─── Git URL Regex (for extracting from text) ───────────────────────
// Matches GitHub, GitLab, and Bitbucket URLs — with or without https://

const GIT_URL_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)\/[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)?\/?/g;

export function extractGitUrlsFromText(text: string): string[] {
  const matches = text.match(GIT_URL_REGEX) || [];
  // Normalize: ensure https:// prefix, clean trailing slashes
  const cleaned = matches.map((u) => {
    let url = u.replace(/\/+$/, "");
    if (!url.startsWith("http")) {
      url = `https://${url}`;
    }
    return url;
  });
  return [...new Set(cleaned)];
}

// ─── Helper: Check if a URL is from a supported git provider ───────

export function isGitProviderUrl(link: string): boolean {
  try {
    const u = new URL(link);
    return u.hostname.toLowerCase() in GIT_HOSTS;
  } catch {
    return false;
  }
}
