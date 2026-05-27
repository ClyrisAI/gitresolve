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
              BrowserProvider (portfolio)
              unpdf (resume)
```

- **Classifier** (`classifier.ts`): Determines input type (repo, profile, portfolio, resume, linkedin, unknown)
- **Portfolio Scraper** (`portfolio-scraper.ts`): Uses a `BrowserProvider` to get page HTML → extract git links
- **Resume Parser** (`resume-parser.ts`): PDF text + hyperlink annotation extraction via `unpdf`
- **Disambiguator** (`disambiguator.ts`): When multiple git links found, determines which belongs to the candidate
- **CLI** (`cli.ts`): Commander-based CLI orchestrator
- **Printer** (`printer.ts`): Pretty ANSI output for CLI
- **Browser Providers** (`browser/`): Abstraction for fetching page content (Puppeteer, Browserless, fetch)

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

## Coding Conventions

- TypeScript strict mode, ESM modules
- Explicit type annotations on exports
- `type` imports for type-only imports
- `.js` extensions on all relative imports
- `const` over `let`, never `var`
- Template literals over concatenation
- Descriptive variable names
- try/catch around external calls with meaningful error messages

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
