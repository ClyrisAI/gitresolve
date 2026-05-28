import type { ResolverResult } from "./types.js";
import type { BrowserProvider } from "./browser/types.js";
import { parseGitLink, extractGitUrlsFromText, isGitProviderUrl } from "./classifier.js";
import { resolveOwnerAndCategorize } from "./disambiguator.js";

// ─── Portfolio Scraper ──────────────────────────────────────────────

/**
 * Scrape a portfolio website for git provider links and resolve ownership.
 * Uses the injected BrowserProvider for fetching page content.
 */
export async function scrapePortfolio(
  url: string,
  provider: BrowserProvider,
  knownOwnerProfile?: import("./types.js").ExtractedGitLink
): Promise<ResolverResult> {
  const result: ResolverResult = {
    source: url,
    sourceType: "portfolio",
    ownerProfile: null,
    confidence: "none",
    ownedRepos: [],
    contributions: [],
    externalRepos: [],
    allLinks: [],
    warnings: [],
  };

  try {
    const html = await provider.getPageContent(url);
    if (provider.name === 'fetch') {
      result.warnings.push(`Used fetch provider (SPA rendering layer like Puppeteer/Browserless is missing)`);
    } else {
      result.warnings.push(`Used ${provider.name} provider for page content`);
    }

    // Extract all links from the HTML
    const allLinks = extractLinksFromHtml(html, url);

    // Filter for git provider links and parse them
    const gitUrls = allLinks.filter(isGitProviderUrl);
    for (const gitUrl of gitUrls) {
      const parsed = parseGitLink(gitUrl);
      if (parsed) {
        result.allLinks.push(parsed);
      }
    }

    // Resolve owner and categorize repos
    const resolution = resolveOwnerAndCategorize(result.allLinks, "portfolio", knownOwnerProfile);
    result.ownerProfile = resolution.ownerProfile;
    result.confidence = resolution.confidence;
    result.ownedRepos = resolution.ownedRepos;
    result.contributions = resolution.contributions;
    result.externalRepos = resolution.externalRepos;
    result.warnings.push(...resolution.warnings);

  } catch (err) {
    result.error = err instanceof Error ? err.message : "Unknown error scraping portfolio";
  }

  return result;
}

// ─── Shared HTML → Links Extraction ─────────────────────────────────

/**
 * Extract all href links and git URLs from raw HTML.
 * Resolves relative URLs against the base URL.
 */
export function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  const links: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html)) !== null) {
    let href = match[1];
    if (href.startsWith("/") || (!href.startsWith("http") && !href.startsWith("#") && !href.startsWith("mailto:"))) {
      try {
        href = new URL(href, baseUrl).toString();
      } catch { continue; }
    }
    links.push(href);
  }

  const textGitUrls = extractGitUrlsFromText(html);
  links.push(...textGitUrls);

  return [...new Set(links)];
}
