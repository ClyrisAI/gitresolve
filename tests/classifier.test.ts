import { describe, it, expect } from "vitest";
import {
  classifyInput,
  parseRepoUrl,
  parseGitLink,
  extractGitUrlsFromText,
  isGitProviderUrl,
} from "../src/classifier.js";

// ═══════════════════════════════════════════════════════════════════════
// classifyInput
// ═══════════════════════════════════════════════════════════════════════

describe("classifyInput", () => {
  // ── GitHub Profiles ────────────────────────────────────────────────
  describe("GitHub profiles", () => {
    it("classifies github.com/username as git_profile", () => {
      expect(classifyInput("https://github.com/octocat")).toBe("git_profile");
    });

    it("classifies with trailing slash", () => {
      expect(classifyInput("https://github.com/octocat/")).toBe("git_profile");
    });

    it("classifies with query params (tab=repositories)", () => {
      expect(classifyInput("https://github.com/octocat?tab=repositories")).toBe(
        "git_profile"
      );
    });

    it("classifies www.github.com profile", () => {
      expect(classifyInput("https://www.github.com/octocat")).toBe(
        "git_profile"
      );
    });
  });

  // ── Repo URLs ─────────────────────────────────────────────────────
  describe("repo URLs", () => {
    it("classifies GitHub repo", () => {
      expect(classifyInput("https://github.com/user/repo")).toBe("repo_url");
    });

    it("classifies GitHub repo with .git suffix", () => {
      expect(classifyInput("https://github.com/user/repo.git")).toBe("repo_url");
    });

    it("classifies GitHub repo with trailing slash", () => {
      expect(classifyInput("https://github.com/user/repo/")).toBe("repo_url");
    });

    it("classifies GitLab repo", () => {
      expect(classifyInput("https://gitlab.com/user/repo")).toBe("repo_url");
    });

    it("classifies Bitbucket repo", () => {
      expect(classifyInput("https://bitbucket.org/user/repo")).toBe("repo_url");
    });

    it("classifies repo with deep path (tree/branch)", () => {
      expect(
        classifyInput("https://github.com/user/repo/tree/main/src")
      ).toBe("repo_url");
    });
  });

  // ── Portfolio URLs ────────────────────────────────────────────────
  describe("portfolio URLs", () => {
    it("classifies generic website as portfolio", () => {
      expect(classifyInput("https://myportfolio.com")).toBe("portfolio");
    });

    it("classifies a personal website as portfolio", () => {
      expect(classifyInput("https://johndoe.dev/projects")).toBe("portfolio");
    });

    it("classifies non-git hosting URL as portfolio", () => {
      expect(classifyInput("https://vercel.app/my-site")).toBe("portfolio");
    });
  });

  // ── Resume Files ──────────────────────────────────────────────────
  describe("resume files", () => {
    it("classifies .pdf as resume_file", () => {
      expect(classifyInput("resume.pdf")).toBe("resume_file");
    });

    it("classifies .docx as resume_file", () => {
      expect(classifyInput("john_doe_resume.docx")).toBe("resume_file");
    });

    it("classifies .doc as resume_file", () => {
      expect(classifyInput("cv.doc")).toBe("resume_file");
    });

    it("classifies .rtf as resume_file", () => {
      expect(classifyInput("my_resume.rtf")).toBe("resume_file");
    });

    it("is case-insensitive for file extensions", () => {
      expect(classifyInput("Resume.PDF")).toBe("resume_file");
    });

    it("handles paths with directories", () => {
      expect(classifyInput("/path/to/resume.pdf")).toBe("resume_file");
    });
  });

  // ── LinkedIn ──────────────────────────────────────────────────────
  describe("LinkedIn", () => {
    it("classifies linkedin.com/in/user as linkedin", () => {
      expect(classifyInput("https://linkedin.com/in/johndoe")).toBe("linkedin");
    });

    it("classifies www.linkedin.com as linkedin", () => {
      expect(classifyInput("https://www.linkedin.com/in/johndoe")).toBe(
        "linkedin"
      );
    });
  });

  // ── Unknown / Edge Cases ──────────────────────────────────────────
  describe("unknown / edge cases", () => {
    it("returns unknown for empty string", () => {
      expect(classifyInput("")).toBe("unknown");
    });

    it("returns unknown for random string", () => {
      expect(classifyInput("hello world")).toBe("unknown");
    });

    it("returns unknown for just github.com (no username)", () => {
      expect(classifyInput("https://github.com")).toBe("unknown");
    });

    it("returns unknown for github.com with trailing slash only", () => {
      expect(classifyInput("https://github.com/")).toBe("unknown");
    });

    it("handles whitespace around input", () => {
      expect(classifyInput("  https://github.com/octocat  ")).toBe(
        "git_profile"
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// parseRepoUrl
// ═══════════════════════════════════════════════════════════════════════

describe("parseRepoUrl", () => {
  describe("valid GitHub repos", () => {
    it("parses basic GitHub repo", () => {
      const result = parseRepoUrl("https://github.com/facebook/react");
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        provider: "github",
        host: "github.com",
        owner: "facebook",
        repo: "react",
        fullPath: "facebook/react",
        normalized: "https://github.com/facebook/react",
      });
    });

    it("strips .git suffix", () => {
      const result = parseRepoUrl("https://github.com/user/repo.git");
      expect(result.valid).toBe(true);
      expect(result.data!.repo).toBe("repo");
      expect(result.data!.fullPath).toBe("user/repo");
    });

    it("strips trailing slash", () => {
      const result = parseRepoUrl("https://github.com/user/repo/");
      expect(result.valid).toBe(true);
      expect(result.data!.repo).toBe("repo");
    });

    it("handles deep paths (tree/branch)", () => {
      const result = parseRepoUrl(
        "https://github.com/user/repo/tree/main/src"
      );
      expect(result.valid).toBe(true);
      expect(result.data!.owner).toBe("user");
      expect(result.data!.repo).toBe("repo");
    });
  });

  describe("valid GitLab repos", () => {
    it("parses basic GitLab repo", () => {
      const result = parseRepoUrl("https://gitlab.com/group/project");
      expect(result.valid).toBe(true);
      expect(result.data!.provider).toBe("gitlab");
      expect(result.data!.owner).toBe("group");
      expect(result.data!.repo).toBe("project");
    });

    it("handles GitLab subgroups", () => {
      const result = parseRepoUrl(
        "https://gitlab.com/group/subgroup/project"
      );
      expect(result.valid).toBe(true);
      expect(result.data!.owner).toBe("group");
      expect(result.data!.repo).toBe("project");
      expect(result.data!.fullPath).toBe("group/subgroup/project");
    });

    it("handles GitLab paths with - marker", () => {
      const result = parseRepoUrl(
        "https://gitlab.com/group/project/-/tree/main"
      );
      expect(result.valid).toBe(true);
      expect(result.data!.owner).toBe("group");
      expect(result.data!.repo).toBe("project");
    });
  });

  describe("valid Bitbucket repos", () => {
    it("parses basic Bitbucket repo", () => {
      const result = parseRepoUrl("https://bitbucket.org/team/project");
      expect(result.valid).toBe(true);
      expect(result.data!.provider).toBe("bitbucket");
      expect(result.data!.owner).toBe("team");
      expect(result.data!.repo).toBe("project");
    });
  });

  describe("invalid URLs", () => {
    it("returns invalid for unsupported provider", () => {
      const result = parseRepoUrl("https://example.com/user/repo");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Unsupported provider");
    });

    it("returns invalid for missing repo path", () => {
      const result = parseRepoUrl("https://github.com/user");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid repo path");
    });

    it("returns invalid for just the host", () => {
      const result = parseRepoUrl("https://github.com");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid repo path");
    });

    it("returns invalid for malformed URL", () => {
      const result = parseRepoUrl("not-a-url");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid URL");
    });

    it("returns invalid for empty string", () => {
      const result = parseRepoUrl("");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid URL");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// parseGitLink
// ═══════════════════════════════════════════════════════════════════════

describe("parseGitLink", () => {
  describe("GitHub profiles", () => {
    it("parses single path segment as profile", () => {
      const result = parseGitLink("https://github.com/octocat");
      expect(result).toEqual({
        url: "https://github.com/octocat",
        provider: "github",
        type: "profile",
        username: "octocat",
      });
    });

    it("parses profile with trailing slash", () => {
      const result = parseGitLink("https://github.com/octocat/");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("profile");
      expect(result!.username).toBe("octocat");
    });
  });

  describe("GitHub repos", () => {
    it("parses two-segment path as repo", () => {
      const result = parseGitLink("https://github.com/user/repo");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("repo");
      expect(result!.username).toBe("user");
      expect(result!.repo).toBe("repo");
    });

    it("parses repo with .git suffix", () => {
      const result = parseGitLink("https://github.com/user/repo.git");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("repo");
      expect(result!.repo).toBe("repo");
    });
  });

  describe("GitHub profile tabs", () => {
    it("treats /user/repositories as profile", () => {
      const result = parseGitLink("https://github.com/octocat/repositories");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("profile");
      expect(result!.username).toBe("octocat");
    });

    it("treats /user/stars as profile", () => {
      const result = parseGitLink("https://github.com/octocat/stars");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("profile");
    });

    it("treats /user/followers as profile", () => {
      const result = parseGitLink("https://github.com/octocat/followers");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("profile");
    });

    it("treats /user/following as profile", () => {
      const result = parseGitLink("https://github.com/octocat/following");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("profile");
    });
  });

  describe("reserved paths", () => {
    it("returns null for /features", () => {
      expect(parseGitLink("https://github.com/features")).toBeNull();
    });

    it("returns null for /explore", () => {
      expect(parseGitLink("https://github.com/explore")).toBeNull();
    });

    it("returns null for /marketplace", () => {
      expect(parseGitLink("https://github.com/marketplace")).toBeNull();
    });

    it("returns null for /pricing", () => {
      expect(parseGitLink("https://github.com/pricing")).toBeNull();
    });

    it("returns null for /login", () => {
      expect(parseGitLink("https://github.com/login")).toBeNull();
    });

    it("returns null for /signup", () => {
      expect(parseGitLink("https://github.com/signup")).toBeNull();
    });

    it("returns null for GitLab reserved /explore", () => {
      expect(parseGitLink("https://gitlab.com/explore")).toBeNull();
    });

    it("returns null for GitLab reserved /help", () => {
      expect(parseGitLink("https://gitlab.com/help")).toBeNull();
    });

    it("returns null for Bitbucket reserved /product", () => {
      expect(parseGitLink("https://bitbucket.org/product")).toBeNull();
    });

    it("is case-insensitive for reserved path checks", () => {
      expect(parseGitLink("https://github.com/Features")).toBeNull();
      expect(parseGitLink("https://github.com/EXPLORE")).toBeNull();
    });
  });

  describe("gists", () => {
    it("detects github.com/gist/... as gist", () => {
      const result = parseGitLink("https://github.com/gist/abc123");
      // gist path starts with 'gist', which is not in GITHUB_RESERVED_PATHS
      // but is detected by the gist check (firstPart === "gist")
      expect(result).not.toBeNull();
      expect(result!.type).toBe("gist");
    });
  });

  describe("GitLab links", () => {
    it("parses GitLab profile", () => {
      const result = parseGitLink("https://gitlab.com/johndoe");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("gitlab");
      expect(result!.type).toBe("profile");
      expect(result!.username).toBe("johndoe");
    });

    it("parses GitLab repo", () => {
      const result = parseGitLink("https://gitlab.com/group/project");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("repo");
      expect(result!.username).toBe("group");
      expect(result!.repo).toBe("project");
    });

    it("treats GitLab /user/- as profile", () => {
      const result = parseGitLink("https://gitlab.com/johndoe/-");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("profile");
      expect(result!.username).toBe("johndoe");
    });
  });

  describe("Bitbucket links", () => {
    it("parses Bitbucket profile", () => {
      const result = parseGitLink("https://bitbucket.org/teamname");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("bitbucket");
      expect(result!.type).toBe("profile");
    });

    it("parses Bitbucket repo", () => {
      const result = parseGitLink("https://bitbucket.org/team/project");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("repo");
    });
  });

  describe("non-git-host URLs and invalid inputs", () => {
    it("returns null for non-git URLs", () => {
      expect(parseGitLink("https://example.com/user/repo")).toBeNull();
    });

    it("returns null for invalid URLs", () => {
      expect(parseGitLink("not-a-url")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseGitLink("")).toBeNull();
    });

    it("returns null for just the host with no path", () => {
      expect(parseGitLink("https://github.com")).toBeNull();
      expect(parseGitLink("https://github.com/")).toBeNull();
    });
  });

  describe("www prefix handling", () => {
    it("handles www.github.com", () => {
      const result = parseGitLink("https://www.github.com/octocat");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("github");
      expect(result!.type).toBe("profile");
    });

    it("handles www.gitlab.com", () => {
      const result = parseGitLink("https://www.gitlab.com/johndoe");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("gitlab");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// extractGitUrlsFromText
// ═══════════════════════════════════════════════════════════════════════

describe("extractGitUrlsFromText", () => {
  it("extracts a single GitHub URL from text", () => {
    const text = "Check out my work at https://github.com/johndoe/project";
    const result = extractGitUrlsFromText(text);
    expect(result).toContain("https://github.com/johndoe/project");
  });

  it("extracts multiple URLs from text", () => {
    const text = `
      My GitHub: https://github.com/johndoe
      Project 1: https://github.com/johndoe/app
      GitLab: https://gitlab.com/johndoe/api
    `;
    const result = extractGitUrlsFromText(text);
    expect(result).toHaveLength(3);
    expect(result).toContain("https://github.com/johndoe");
    expect(result).toContain("https://github.com/johndoe/app");
    expect(result).toContain("https://gitlab.com/johndoe/api");
  });

  it("handles URLs without https://", () => {
    const text = "My profile: github.com/johndoe";
    const result = extractGitUrlsFromText(text);
    expect(result).toContain("https://github.com/johndoe");
  });

  it("normalizes by adding https:// prefix", () => {
    const text = "github.com/user/repo";
    const result = extractGitUrlsFromText(text);
    expect(result[0]).toMatch(/^https:\/\//);
  });

  it("removes trailing slashes", () => {
    const text = "https://github.com/user/repo/";
    const result = extractGitUrlsFromText(text);
    expect(result[0]).toBe("https://github.com/user/repo");
  });

  it("deduplicates identical URLs", () => {
    const text = `
      https://github.com/user/repo
      https://github.com/user/repo
    `;
    const result = extractGitUrlsFromText(text);
    expect(result).toHaveLength(1);
  });

  it("extracts Bitbucket URLs", () => {
    const text = "Repo: https://bitbucket.org/team/project";
    const result = extractGitUrlsFromText(text);
    expect(result).toContain("https://bitbucket.org/team/project");
  });

  it("returns empty array when no git URLs found", () => {
    const text = "No git URLs here, just normal text with https://example.com";
    const result = extractGitUrlsFromText(text);
    expect(result).toEqual([]);
  });

  it("handles www prefix in URLs", () => {
    const text = "https://www.github.com/user/repo";
    const result = extractGitUrlsFromText(text);
    expect(result).toContain("https://www.github.com/user/repo");
  });

  it("handles http:// URLs", () => {
    const text = "http://github.com/user/repo";
    const result = extractGitUrlsFromText(text);
    expect(result).toContain("http://github.com/user/repo");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// isGitProviderUrl
// ═══════════════════════════════════════════════════════════════════════

describe("isGitProviderUrl", () => {
  it("returns true for github.com", () => {
    expect(isGitProviderUrl("https://github.com/user/repo")).toBe(true);
  });

  it("returns true for gitlab.com", () => {
    expect(isGitProviderUrl("https://gitlab.com/user/repo")).toBe(true);
  });

  it("returns true for bitbucket.org", () => {
    expect(isGitProviderUrl("https://bitbucket.org/team/project")).toBe(true);
  });

  it("returns true for www.github.com", () => {
    expect(isGitProviderUrl("https://www.github.com/user")).toBe(true);
  });

  it("returns false for non-git hosts", () => {
    expect(isGitProviderUrl("https://example.com")).toBe(false);
  });

  it("returns false for invalid URLs", () => {
    expect(isGitProviderUrl("not-a-url")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isGitProviderUrl("")).toBe(false);
  });

  it("returns false for LinkedIn URLs", () => {
    expect(isGitProviderUrl("https://linkedin.com/in/user")).toBe(false);
  });
});
