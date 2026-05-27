# @clyrisai/gitresolve

Resolve candidate portfolios, resumes, and URLs into GitHub/GitLab/Bitbucket profiles and repos.

> **🚀 Enterprise ATS Integrations (Lever, Greenhouse, Ashby)**
> Are you processing massive CSV dumps from your ATS with custom columns? If you need native zero-configuration mapping for your ATS platform, please **[Open an Issue](https://github.com/ClyrisAI/gitresolve/issues)** and let us know! We are prioritizing specific integrations based on user demand.

## Install

GitResolve can be run instantly via `npx`, or installed globally for permanent CLI use.

**Option 1: Zero-Install (On-Demand)**
```bash
npx @clyrisai/gitresolve --help
```

**Option 2: Global Install (Recommended for frequent use)**
Install globally to use the `gitresolve` command anywhere. You can also install the `puppeteer` peer dependency at the same time to permanently enable JavaScript SPA rendering:

```bash
# Basic global install (fastest)
npm install -g @clyrisai/gitresolve

# Global install WITH JavaScript rendering support
npm install -g @clyrisai/gitresolve puppeteer
```

## Usage

```
gitresolve [url] [options]

Arguments:
  [url]                     Direct URL to process (portfolio or resume)

Options:

  General:
    --output-dir <dir>        Write results to a directory organized by candidate (keeps terminal clean)
    --json                    Output raw JSON to stdout
    -V, --version             Output version number
    -h, --help                Display help

  Single URL:
    --type <type>             Hint the type of URL: 'portfolio' or 'resume'

  Batch Processing:
    --all                     Process both portfolios and resumes
    --portfolios              Process portfolio links from CSV
    --resumes                 Process resume PDFs from directory
    --portfolio-csv <path>    Path to portfolio CSV file (default: ./portfolio_links.csv)
    --resumes-dir <path>      Path to resumes directory (default: ./resumes)

  Browser Options:
    --provider <name>         Provider (auto-uses puppeteer if found, else fetch. Force with 'puppeteer', 'browserless', 'fetch')
    --browserless-url <url>   Browserless instance URL
```

## Examples

### Single Input (Standard Usage)
Process a direct URL to a candidate's portfolio, GitHub profile, or resume PDF.

```bash
# Process a standard portfolio website or profile link
gitresolve https://janedoe.dev

# Process a remote resume PDF
gitresolve https://example.com/resume.pdf

# ⚠️ For SPAs requiring JavaScript rendering (requires global puppeteer install):
gitresolve https://janedoe.dev
```

*(Tip: If a resume URL doesn't end in `.pdf`, you can force it to be treated as a resume by adding `--type resume`)*

### Batch Processing (Multiple Inputs)
Process a list of candidates from a CSV and a directory of local resumes.

**1. Setup Your Data:**
- Create a `data/resumes/` folder in your project root and drop in some PDFs.
- Create a `data/portfolio_links.csv` file with a `url` column containing portfolio links.
*(Note: This data remains strictly on your machine and is `.gitignore`'d for privacy).*

**2. Run the Batch CLI:**
```bash
# Process both portfolios and resumes
gitresolve --all

# Process and silently save the aggregated candidates to a directory
gitresolve --all --output-dir results/
```

### Saving Analysis (Candidate Aggregation)
When you process multiple sources (e.g., a portfolio link and a resume PDF) that resolve to the same GitHub candidate, GitResolve will **automatically merge them** into a single, unified profile.

```bash
# Saves aggregated JSON files to the results/ directory (e.g., results/resolved/janedoe.json)
gitresolve --all --output-dir results/

# Skip the terminal UI entirely and dump the merged JSON array to stdout (great for piping)
gitresolve --all --json
```

**Example Aggregated Output (`results/resolved/janedoe.json`):**
```json
{
  "candidateUsername": "janedoe",
  "sources": [
    "https://janedoe.dev",
    "./data/resumes/janedoe.pdf"
  ],
  "sourceTypes": [
    "portfolio",
    "resume_file"
  ],
  "ownerProfile": { 
    "url": "https://github.com/janedoe", 
    "provider": "github", 
    "type": "profile", 
    "username": "janedoe" 
  },
  "confidence": "high",
  "ownedRepos": [],
  "externalRepos": [],
  "allLinks": [],
  "warnings": []
}
```

## How it works

1. **Classifies input** to determine if it's a resume file, portfolio site, or direct git URL
2. **Scrapes portfolios** using fetch, Puppeteer (for JS-rendered SPAs), or Browserless
3. **Parses PDF resumes** by extracting raw text and deeply buried hyperlink annotations
4. **Extracts and sanitizes** GitHub, GitLab, and Bitbucket URLs
5. **Disambiguates owners** to separate the candidate's actual profile from referenced external repos

Each processed input returns a structured result:

```json
{
  "source": "https://janedoe.dev",
  "sourceType": "portfolio",
  "ownerProfile": { 
    "url": "https://github.com/janedoe", 
    "provider": "github", 
    "type": "profile", 
    "username": "janedoe" 
  },
  "confidence": "high",
  "ownedRepos": [],
  "externalRepos": [],
  "allLinks": [],
  "warnings": []
}
```

## Browser Provider Configuration

GitResolve supports three browser providers for fetching portfolio page content. It auto-detects the best available one:

| Provider | Requires | JavaScript Rendering | Best For |
|---|---|---|---|
| **puppeteer** | `npm install puppeteer` | ✅ Full | SPAs, JS-heavy sites |
| **browserless** | Docker container | ✅ Full | Server environments, CI/CD |
| **fetch** | Nothing | ❌ None | Static sites, fallback |

### Browserless Setup
```bash
# Start a Browserless Docker container
docker run -d --name browserless -p 3000:3000 ghcr.io/browserless/chromium

# Use it
gitresolve --portfolios --browserless-url http://localhost:3000
```

## Programmatic API

If you are building an app that needs to extract GitHub profiles on the fly, you can import `@clyrisai/gitresolve` directly into your Node.js/Bun backend.

```bash
npm install @clyrisai/gitresolve
```

```typescript
import { classifyInput, scrapePortfolio, parseResume, createProvider } from '@clyrisai/gitresolve';

// 1. Setup a browser provider
const provider = await createProvider('puppeteer' | 'browserless' | 'fetch');

try {
  // --- Example A: Classify and scrape a portfolio URL ---
  const result = await scrapePortfolio('https://janedoe.dev', provider);
  console.log("Candidate Profile:", result.ownerProfile);
  console.log("Confidence Score:", result.confidence);

  // --- Example B: Parse a resume PDF ---
  const resumeResult = await parseResume('./resumes/candidate1.pdf');
  console.log("Found links in resume:", resumeResult.allLinks.length);

} finally {
  await provider.cleanup();
}
```

## Requirements

- Node.js >= 18.0.0
- [Puppeteer](https://pptr.dev) (Optional, auto-used for SPAs if installed as a peer dependency)

## License

MIT © ClyrisAI
