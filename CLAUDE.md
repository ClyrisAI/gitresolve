# @clyrisai/gitresolve — Development Guide

## What This Is

An npm package (`@clyrisai/gitresolve`) for **ClyrisAI** (clyrisai.com) — resolves messy candidate submissions (portfolios, resumes, random links) into usable GitHub/GitLab/Bitbucket profile and repo URLs.

## Architecture

```
src/
├── index.ts              # Public API barrel export
├── cli.ts                # CLI entry point (commander-based)
├── types.ts              # All shared types and constants
├── classifier.ts         # Input classification + git URL parsing
├── portfolio-scraper.ts  # Scrape portfolio sites (uses BrowserProvider)
├── resume-parser.ts      # Parse PDFs for git links (unpdf)
├── disambiguator.ts      # Owner resolution + repo categorization
├── printer.ts            # ANSI-colored CLI output formatting
└── browser/
    ├── types.ts           # BrowserProvider interface
    ├── fetch-provider.ts  # Native fetch (no JS rendering)
    ├── puppeteer-provider.ts  # Puppeteer (optional peer dep)
    ├── browserless-provider.ts # Browserless REST API
    ├── factory.ts         # Provider auto-detection + creation
    └── index.ts           # Barrel export
```

### Data Flow

```
Raw Input → Classifier → Resolver → Disambiguator → Normalized Git URL
                          ↓
              BrowserProvider (portfolio / profile / repo page)
              unpdf (resume)
```

- **Classifier** (`classifier.ts`): Determines input type (`repo_url`, `git_profile`, `portfolio`, `resume_file`, `resume_url`, `linkedin`, `unknown`). Contains `parseRepoUrl` (validates repo URLs with reserved path filtering) and `parseGitLink` (extracts typed links from scraped HTML including PRs/Issues). Uses `RESERVED_PATHS` sets per provider to reject non-repo URLs.
- **Portfolio Scraper** (`portfolio-scraper.ts`): Uses a `BrowserProvider` to get page HTML → extract git links. Handles profile pages, repo pages, and portfolio sites uniformly.
- **Resume Parser** (`resume-parser.ts`): PDF text + hyperlink annotation extraction via `unpdf`
- **Disambiguator** (`disambiguator.ts`): When multiple git links found, determines which belongs to the candidate. Categorizes into owned repos, contributions (PRs/Issues), and external references. Deduplicates by URL.
- **CLI** (`cli.ts`): Commander-based CLI orchestrator. All input types (portfolio, git_profile, repo_url) flow through `scrapePortfolio` — repo URLs are no longer short-circuited.
- **Printer** (`printer.ts`): Pretty ANSI output for CLI with distinct sections for owned, contributions, and external
- **Browser Providers** (`browser/`): Abstraction for fetching page content (Puppeteer, Browserless, fetch)

### Input Classification Flow

The classifier determines what to do with a URL:

1. `parseRepoUrl` is called first — if the URL is a valid repo (passes reserved path checks), it's `repo_url`
2. If not a repo but on a known git host (github.com, gitlab.com, bitbucket.org), it's `git_profile`
3. Otherwise it's a `portfolio` (any other URL gets scraped)

All three types flow into `scrapePortfolio` — there is no special "already a repo" gate. The scraper processes the page normally and the disambiguator categorizes what it finds.

### Owner Resolution

For `git_profile` and `repo_url` inputs, the owner is pre-determined from the URL before scraping:
- Profile URLs: username extracted from path (handles `/users/<name>/` routing on GitLab)
- Repo URLs: owner extracted via `parseRepoUrl`
- This `knownOwnerProfile` is passed to the disambiguator which skips its heuristic owner detection

### Link Categorization

The disambiguator splits extracted links into three buckets:
- **Owned repos**: `username` matches the resolved owner (case-insensitive)
- **Contributions**: PR and Issue links (detected by `parseRepoUrl` suffix parsing)
- **External references**: Everything else

## Tech Stack

- **Runtime**: Bun (dev) / Node.js 18+ (consumers)
- **Build**: TypeScript 5.7+ with Node16 module resolution
- **PDF parsing**: `unpdf` (lightweight pdfjs wrapper)
- **CLI**: `commander`
- **Testing**: `vitest`
- **Browser**: Puppeteer (optional peer dep), Browserless (Docker), native fetch (fallback)

## Development

```bash
# Install dependencies
bun install

# Run in dev mode
bun run dev                # --all (default)
bun run dev:portfolios     # --portfolios only
bun run dev:resumes        # --resumes only

# Type check
bun run typecheck

# Build for publishing
bun run build

# Run tests
bun run test
bun run test:watch
bun run test:coverage
```

## Browser Provider Setup

```bash
# Option 1: Install Puppeteer
bun add puppeteer

# Option 2: Browserless Docker
docker run -d --name browserless -p 3000:3000 ghcr.io/browserless/chromium

# Option 3: Fetch (always available, no JS rendering)
BROWSER_PROVIDER=fetch bun run dev:portfolios
```

## Input Files

- `portfolio_links.csv` — CSV with a `url` column containing portfolio website URLs
- `resumes/` — Directory of PDF resume files

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BROWSERLESS_URL` | `http://localhost:3000` | Browserless instance URL |
| `BROWSER_PROVIDER` | (auto-detect) | Force provider: `puppeteer`, `browserless`, `fetch` |
| `PORTFOLIO_CSV` | `./portfolio_links.csv` | Default portfolio CSV path |
| `RESUMES_DIR` | `./resumes` | Default resumes directory path |

## Key Design Decisions

1. **BrowserProvider abstraction**: Portfolio scraping accepts a provider interface, enabling Puppeteer (npx users), Browserless (Docker/CI), or fetch (universal fallback) without changing scraping logic.
2. **Puppeteer as optional peer dep**: Not bundled — consumers install it only if they need JS rendering. The package works without it via fetch fallback.
3. **Node16 module resolution**: All imports use `.js` extensions for compatibility with both Bun and Node.js ESM.
4. **Owner disambiguation**: Portfolio sites often link to popular library repos. The disambiguator cross-references profile links with repo owners to find the actual candidate.
5. **Two-pronged PDF parsing**: Resumes may have GitHub as clickable hyperlinks (PDF annotations) or as plain text — we extract both and merge.
6. **Never throw from resolvers**: All resolver functions return errors in result objects instead of throwing.
7. **No repo URL gate**: Repo URLs are scraped like any other page — no synthetic "already a repo" shortcut. The scraper discovers links from the rendered page.
8. **Provider-agnostic profiles**: `git_profile` type works uniformly across GitHub, GitLab, and Bitbucket. Provider is auto-detected from hostname.
9. **Reserved path rejection in parseRepoUrl**: Instead of hacking around provider-specific routing (like `/users/name/projects`), `parseRepoUrl` rejects URLs where the first path segment is a known reserved path. This causes them to fall through to `git_profile` classification naturally.
10. **Contributions as a first-class bucket**: PR/Issue links are detected by suffix parsing in `parseRepoUrl` and categorized separately from owned and external repos.

## Coding Conventions

- TypeScript strict mode, ESM modules
- Explicit type annotations on exports
- `type` imports for type-only imports
- `.js` extensions on all relative imports
- `const` over `let`, never `var`
- Template literals over concatenation
- Descriptive variable names
- try/catch around external calls with meaningful error messages
- Git usernames and repo names are treated as case-insensitive

## Publishing

```bash
bun run build
npm publish --access public
```

## Known Limitations

- LinkedIn → GitHub mapping is **not implemented** (legal/technical dead end)
- Client-side rendered SPAs without Puppeteer/Browserless will fail to extract links
- Resume DOCX parsing not yet implemented (only PDF)
- No repo quality heuristics yet (fork detection, commit frequency)
- GitLab dynamic page rendering may occasionally miss repos on first load (Puppeteer race condition)
