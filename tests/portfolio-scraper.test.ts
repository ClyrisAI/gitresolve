import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scrapePortfolio, extractLinksFromHtml } from "../src/portfolio-scraper.js";
import type { BrowserProvider } from "../src/browser/types.js";

// ─── Mock BrowserProvider factory ───────────────────────────────────

function createMockProvider(overrides: Partial<BrowserProvider> = {}): BrowserProvider {
  return {
    name: "mock",
    getPageContent: vi.fn().mockResolvedValue("<html></html>"),
    isAvailable: vi.fn().mockResolvedValue(true),
    cleanup: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// extractLinksFromHtml
// ═══════════════════════════════════════════════════════════════════════

describe("extractLinksFromHtml", () => {
  it("extracts href attributes with git URLs", () => {
    const html = `
      <a href="https://github.com/johndoe/project">My Project</a>
      <a href="https://gitlab.com/johndoe/api">API</a>
    `;
    const links = extractLinksFromHtml(html, "https://example.com");
    expect(links).toContain("https://github.com/johndoe/project");
    expect(links).toContain("https://gitlab.com/johndoe/api");
  });

  it("extracts non-git href links too", () => {
    const html = `<a href="https://example.com/about">About</a>`;
    const links = extractLinksFromHtml(html, "https://example.com");
    expect(links).toContain("https://example.com/about");
  });

  it("resolves relative URLs against baseUrl", () => {
    const html = `<a href="/projects">Projects</a>`;
    const links = extractLinksFromHtml(html, "https://mysite.com");
    expect(links).toContain("https://mysite.com/projects");
  });

  it("resolves relative paths without leading slash", () => {
    const html = `<a href="contact.html">Contact</a>`;
    const links = extractLinksFromHtml(html, "https://mysite.com/pages/");
    expect(links.some((l) => l.includes("contact.html"))).toBe(true);
  });

  it("skips mailto: links", () => {
    const html = `<a href="mailto:test@example.com">Email</a>`;
    const links = extractLinksFromHtml(html, "https://example.com");
    expect(links).toContain("mailto:test@example.com");
  });

  it("skips anchor-only links (#)", () => {
    const html = `<a href="#section1">Jump</a>`;
    const links = extractLinksFromHtml(html, "https://example.com");
    expect(links).toContain("#section1");
  });

  it("extracts git URLs from plain text (not just href)", () => {
    const html = `
      <p>Check my GitHub: github.com/johndoe</p>
    `;
    const links = extractLinksFromHtml(html, "https://example.com");
    expect(links).toContain("https://github.com/johndoe");
  });

  it("deduplicates links", () => {
    const html = `
      <a href="https://github.com/johndoe">Link 1</a>
      <a href="https://github.com/johndoe">Link 2</a>
      <p>github.com/johndoe</p>
    `;
    const links = extractLinksFromHtml(html, "https://example.com");
    const githubLinks = links.filter((l) => l.includes("github.com/johndoe"));
    expect(githubLinks.length).toBe(1);
  });

  it("handles HTML with no links", () => {
    const html = `<p>Just some text, no links here.</p>`;
    const links = extractLinksFromHtml(html, "https://example.com");
    expect(links).toEqual([]);
  });

  it("handles mixed git and non-git links", () => {
    const html = `
      <a href="https://github.com/johndoe/app">GitHub</a>
      <a href="https://twitter.com/johndoe">Twitter</a>
      <a href="https://bitbucket.org/team/project">Bitbucket</a>
    `;
    const links = extractLinksFromHtml(html, "https://example.com");
    expect(links).toContain("https://github.com/johndoe/app");
    expect(links).toContain("https://twitter.com/johndoe");
    expect(links).toContain("https://bitbucket.org/team/project");
  });

  it("handles single-quoted href attributes", () => {
    const html = `<a href='https://github.com/user/repo'>Link</a>`;
    const links = extractLinksFromHtml(html, "https://example.com");
    expect(links).toContain("https://github.com/user/repo");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// scrapePortfolio
// ═══════════════════════════════════════════════════════════════════════

describe("scrapePortfolio", () => {
  it("extracts git links from HTML and resolves ownership", async () => {
    const html = `
      <html>
        <body>
          <a href="https://github.com/johndoe">My GitHub</a>
          <a href="https://github.com/johndoe/portfolio">Portfolio Repo</a>
          <a href="https://github.com/johndoe/api-server">API</a>
        </body>
      </html>
    `;
    const provider = createMockProvider({
      getPageContent: vi.fn().mockResolvedValue(html),
    });

    const result = await scrapePortfolio("https://johndoe.dev", provider);

    expect(result.source).toBe("https://johndoe.dev");
    expect(result.sourceType).toBe("portfolio");
    expect(result.confidence).toBe("high");
    expect(result.ownerProfile).not.toBeNull();
    expect(result.ownerProfile!.username).toBe("johndoe");
    expect(result.ownedRepos.length).toBeGreaterThanOrEqual(2);
    expect(result.allLinks.length).toBeGreaterThanOrEqual(3);
    expect(result.error).toBeUndefined();
  });

  it("handles HTML with no git links", async () => {
    const html = `
      <html><body>
        <a href="https://twitter.com/johndoe">Twitter</a>
        <p>No git links here</p>
      </body></html>
    `;
    const provider = createMockProvider({
      getPageContent: vi.fn().mockResolvedValue(html),
    });

    const result = await scrapePortfolio("https://johndoe.dev", provider);

    expect(result.confidence).toBe("none");
    expect(result.ownerProfile).toBeNull();
    expect(result.allLinks).toHaveLength(0);
    expect(result.ownedRepos).toHaveLength(0);
  });

  it("handles provider errors gracefully", async () => {
    const provider = createMockProvider({
      getPageContent: vi.fn().mockRejectedValue(new Error("Connection refused")),
    });

    const result = await scrapePortfolio("https://broken-site.com", provider);

    expect(result.error).toBe("Connection refused");
    expect(result.confidence).toBe("none");
    expect(result.ownerProfile).toBeNull();
  });

  it("handles non-Error throw gracefully", async () => {
    const provider = createMockProvider({
      getPageContent: vi.fn().mockRejectedValue("string error"),
    });

    const result = await scrapePortfolio("https://broken-site.com", provider);

    expect(result.error).toBe("Unknown error scraping portfolio");
  });

  it("includes provider name in warnings", async () => {
    const html = `<html><body></body></html>`;
    const provider = createMockProvider({
      name: "puppeteer",
      getPageContent: vi.fn().mockResolvedValue(html),
    });

    const result = await scrapePortfolio("https://site.com", provider);

    expect(result.warnings.some((w) => w.includes("puppeteer"))).toBe(true);
  });

  it("categorizes owned vs external repos correctly", async () => {
    const html = `
      <html><body>
        <a href="https://github.com/alice">My GitHub</a>
        <a href="https://github.com/alice/my-app">My App</a>
        <a href="https://github.com/facebook/react">React (external)</a>
      </body></html>
    `;
    const provider = createMockProvider({
      getPageContent: vi.fn().mockResolvedValue(html),
    });

    const result = await scrapePortfolio("https://alice.dev", provider);

    expect(result.ownerProfile!.username).toBe("alice");
    expect(result.ownedRepos).toHaveLength(1);
    expect(result.ownedRepos[0].repo).toBe("my-app");
    expect(result.externalRepos).toHaveLength(1);
    expect(result.externalRepos[0].repo).toBe("react");
  });

  it("passes the URL to the provider", async () => {
    const getPageContent = vi.fn().mockResolvedValue("<html></html>");
    const provider = createMockProvider({ getPageContent });

    await scrapePortfolio("https://mysite.com", provider);

    expect(getPageContent).toHaveBeenCalledWith("https://mysite.com");
  });

  it("handles text-only git URLs (not in href)", async () => {
    const html = `
      <html><body>
        <p>My GitHub profile: github.com/johndoe</p>
        <p>Check out github.com/johndoe/project too</p>
      </body></html>
    `;
    const provider = createMockProvider({
      getPageContent: vi.fn().mockResolvedValue(html),
    });

    const result = await scrapePortfolio("https://portfolio.com", provider);

    expect(result.allLinks.length).toBeGreaterThanOrEqual(2);
  });

  it("filters out reserved GitHub paths from link results", async () => {
    const html = `
      <html><body>
        <a href="https://github.com/features">Features</a>
        <a href="https://github.com/johndoe">Profile</a>
      </body></html>
    `;
    const provider = createMockProvider({
      getPageContent: vi.fn().mockResolvedValue(html),
    });

    const result = await scrapePortfolio("https://site.com", provider);

    // /features is reserved and should be filtered out by parseGitLink
    expect(result.allLinks.every((l) => l.username !== "features")).toBe(true);
    expect(result.allLinks.some((l) => l.username === "johndoe")).toBe(true);
  });
});
