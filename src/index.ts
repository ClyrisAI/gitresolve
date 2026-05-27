// ─── @clyrisai/gitresolve — Public API ──────────────────────────────
//
// This is the programmatic entry point for library consumers.
// CLI users should use `npx @clyrisai/gitresolve` instead.

// ── Types ──
export type {
  InputType,
  GitProvider,
  ParsedRepo,
  GitLinkType,
  ExtractedGitLink,
  ResolverResult,
} from "./types.js";

export { GIT_HOSTS } from "./types.js";

// ── Classifier ──
export {
  classifyInput,
  parseRepoUrl,
  parseGitLink,
  extractGitUrlsFromText,
  isGitProviderUrl,
} from "./classifier.js";

// ── Portfolio Scraper ──
export { scrapePortfolio, extractLinksFromHtml } from "./portfolio-scraper.js";

// ── Resume Parser ──
export { parseResume } from "./resume-parser.js";

// ── Disambiguator ──
export {
  resolveOwnerAndCategorize,
  dedupeProfilesByUsername,
} from "./disambiguator.js";

// ── Browser Providers ──
export type { BrowserProvider, BrowserProviderOptions } from "./browser/types.js";
export { createProvider } from "./browser/factory.js";
export type { ProviderName } from "./browser/factory.js";
export { FetchProvider } from "./browser/fetch-provider.js";
export { BrowserlessProvider } from "./browser/browserless-provider.js";
export { PuppeteerProvider } from "./browser/puppeteer-provider.js";
