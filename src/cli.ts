#!/usr/bin/env node

import { readFile, readdir, writeFile } from "fs/promises";
import { join, extname, basename } from "path";
import { parse as csvParse } from "csv-parse/sync";
import { Command } from "commander";
import { classifyInput, parseRepoUrl } from "./classifier.js";
import { scrapePortfolio } from "./portfolio-scraper.js";
import { parseResume } from "./resume-parser.js";
import { createProvider } from "./browser/factory.js";
import { printResult, printSummary, c, resetResultCounter } from "./printer.js";
import type { ResolverResult } from "./types.js";
import type { ProviderName } from "./browser/factory.js";
import type { BrowserProvider } from "./browser/types.js";

// ─── CLI Setup ──────────────────────────────────────────────────────

const program = new Command();

program
  .name("gitresolve")
  .description("Resolve candidate portfolios, resumes, and URLs into GitHub/GitLab/Bitbucket profiles and repos")
  .version("0.1.0")
  .argument("[url]", "Direct URL to process (portfolio or resume)")
  .option("--type <type>", "Hint the type of URL: 'portfolio' or 'resume'")
  .option("--portfolios", "Process portfolio links from CSV")
  .option("--resumes", "Process resume PDFs from directory")
  .option("--all", "Process both portfolios and resumes")
  .option("--portfolio-csv <path>", "Path to portfolio CSV file", process.env.PORTFOLIO_CSV || "./data/portfolio_links.csv")
  .option("--resumes-dir <path>", "Path to resumes directory", process.env.RESUMES_DIR || "./data/resumes")
  .option("--provider <name>", "Browser provider: puppeteer, browserless, or fetch")
  .option("--json", "Output results as JSON")
  .option("--output <file>", "Write results to a file")
  .option("--browserless-url <url>", "Browserless instance URL (overrides BROWSERLESS_URL env var)");

program.parse();

const opts = program.opts();
const urlArg = program.args[0];

// ─── Determine What to Run ──────────────────────────────────────────

const runAll = !urlArg && (opts.all || (!opts.portfolios && !opts.resumes));
const runPortfolios = !urlArg && (opts.portfolios || runAll);
const runResumes = !urlArg && (opts.resumes || runAll);

// ─── Main ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Set browserless URL if provided via CLI flag
  if (opts.browserlessUrl) {
    process.env.BROWSERLESS_URL = opts.browserlessUrl;
  }

  // Create browser provider
  const providerName = opts.provider as ProviderName | undefined;
  let provider: BrowserProvider | null = null;

  const urlTypeHint = opts.type;
  const urlClassifiedType = urlArg ? classifyInput(urlArg) : undefined;
  const isUrlPortfolio = urlArg && urlTypeHint !== "resume" && (urlTypeHint === "portfolio" || urlClassifiedType === "portfolio");

  if (runPortfolios || isUrlPortfolio) {
    provider = await createProvider(providerName);
  }

  // Handle cleanup on exit
  const cleanup = async (): Promise<void> => {
    if (provider) {
      await provider.cleanup();
    }
  };

  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(130);
  });

  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(143);
  });

  try {
    if (!opts.json) {
      console.log(`\n${c.bold}${c.cyan}🔍 ClyrisAI GitResolve${urlArg ? ' (Single URL)' : ''}${c.reset}`);
      console.log(`${c.dim}${"─".repeat(40)}${c.reset}`);
    }

    resetResultCounter();
    const allResults: ResolverResult[] = [];

    // ── Process Single URL ──
    if (urlArg) {
      if (!opts.json) {
        console.log(`\n${c.bold}🌐 Processing URL${c.reset} ${c.dim}(${urlArg})${c.reset}`);
      }

      let inputType = urlClassifiedType!;
      
      if (urlTypeHint === "resume" || inputType === "resume_file") {
        if (!opts.json) console.log(`${c.dim}   Treating as Resume PDF${c.reset}`);
        try {
          const { tmpdir } = await import("os");
          
          const res = await fetch(urlArg);
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
          const arrayBuffer = await res.arrayBuffer();
          
          const tmpPath = join(tmpdir(), `gitresolve-resume-${Date.now()}.pdf`);
          await writeFile(tmpPath, Buffer.from(arrayBuffer));
          
          const result = await parseResume(tmpPath);
          result.source = urlArg;
          result.sourceType = "resume_url";
          allResults.push(result);
          if (!opts.json) printResult(result);
        } catch (err) {
          if (!opts.json) console.error(`${c.red}   ❌ Error fetching/parsing resume: ${err}${c.reset}`);
        }
      } else {
        if (urlTypeHint === "portfolio") {
          inputType = "portfolio";
        }
        
        if (inputType === "portfolio") {
          const result = await scrapePortfolio(urlArg, provider!);
          allResults.push(result);
          if (!opts.json) printResult(result);
        } else if (inputType === "github_profile") {
          const username = urlArg.replace(/\/+$/, "").split("/").pop()!;
          allResults.push({
            source: urlArg,
            sourceType: "github_profile",
            ownerProfile: { url: urlArg, provider: "github", type: "profile", username },
            confidence: "high",
            ownedRepos: [],
            externalRepos: [],
            allLinks: [{ url: urlArg, provider: "github", type: "profile", username }],
            warnings: ["Already a GitHub profile URL — no scraping needed"],
          });
          if (!opts.json) printResult(allResults[allResults.length - 1]);
        } else if (inputType === "repo_url") {
          const parsed = parseRepoUrl(urlArg);
          if (parsed.valid && parsed.data) {
            const d = parsed.data;
            const repoLink = { url: urlArg, provider: d.provider, type: "repo" as const, username: d.owner, repo: d.repo };
            allResults.push({
              source: urlArg,
              sourceType: "repo_url",
              ownerProfile: {
                url: `https://${d.host}/${d.owner}`,
                provider: d.provider,
                type: "profile",
                username: d.owner,
              },
              confidence: "high",
              ownedRepos: [repoLink],
              externalRepos: [],
              allLinks: [repoLink],
              warnings: [`Already a ${d.provider} repo URL — extracted owner profile`],
            });
          }
          if (!opts.json) printResult(allResults[allResults.length - 1]);
        } else {
          allResults.push({
            source: urlArg,
            sourceType: inputType,
            ownerProfile: null,
            confidence: "none",
            ownedRepos: [],
            externalRepos: [],
            allLinks: [],
            warnings: [`Input classified as '${inputType}' — cannot resolve`],
          });
          if (!opts.json) printResult(allResults[allResults.length - 1]);
        }
      }
    }

    // ── Process Portfolio Links ──
    if (runPortfolios) {
      const csvPath = opts.portfolioCsv;

      if (!opts.json) {
        console.log(`\n${c.bold}📂 Portfolio Links${c.reset} ${c.dim}(from ${csvPath})${c.reset}`);
      }

      try {
        const csvContent = await readFile(csvPath, "utf-8");
        const records = csvParse(csvContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        }) as Array<Record<string, string>>;

        const urls = records
          .map((r) => r.url || r.URL || r.link || r.Link || Object.values(r)[0])
          .filter(Boolean);

        if (!opts.json) {
          console.log(`${c.dim}   Found ${urls.length} URL(s)${c.reset}`);
        }

        for (const url of urls) {
          const inputType = classifyInput(url);

          if (inputType === "portfolio") {
            const result = await scrapePortfolio(url, provider!);
            allResults.push(result);
            if (!opts.json) printResult(result);
          } else if (inputType === "github_profile") {
            const username = url.replace(/\/+$/, "").split("/").pop()!;
            allResults.push({
              source: url,
              sourceType: "github_profile",
              ownerProfile: { url, provider: "github", type: "profile", username },
              confidence: "high",
              ownedRepos: [],
              externalRepos: [],
              allLinks: [{ url, provider: "github", type: "profile", username }],
              warnings: ["Already a GitHub profile URL — no scraping needed"],
            });
            if (!opts.json) printResult(allResults[allResults.length - 1]);
          } else if (inputType === "repo_url") {
            const parsed = parseRepoUrl(url);
            if (parsed.valid && parsed.data) {
              const d = parsed.data;
              const repoLink = { url, provider: d.provider, type: "repo" as const, username: d.owner, repo: d.repo };
              allResults.push({
                source: url,
                sourceType: "repo_url",
                ownerProfile: {
                  url: `https://${d.host}/${d.owner}`,
                  provider: d.provider,
                  type: "profile",
                  username: d.owner,
                },
                confidence: "high",
                ownedRepos: [repoLink],
                externalRepos: [],
                allLinks: [repoLink],
                warnings: [`Already a ${d.provider} repo URL — extracted owner profile`],
              });
            }
            if (!opts.json) printResult(allResults[allResults.length - 1]);
          } else {
            allResults.push({
              source: url,
              sourceType: inputType,
              ownerProfile: null,
              confidence: "none",
              ownedRepos: [],
              externalRepos: [],
              allLinks: [],
              warnings: [`Input classified as '${inputType}' — cannot resolve`],
            });
            if (!opts.json) printResult(allResults[allResults.length - 1]);
          }
        }
      } catch (err) {
        if (!opts.json) {
          console.error(`${c.red}   ❌ Error reading portfolio CSV: ${err}${c.reset}`);
        }
      }
    }

    // ── Process Resumes ──
    if (runResumes) {
      const resumesDir = opts.resumesDir;

      if (!opts.json) {
        console.log(`\n${c.bold}📂 Resumes${c.reset} ${c.dim}(from ${resumesDir}/)${c.reset}`);
      }

      try {
        const files = await readdir(resumesDir);
        const pdfFiles = files.filter((f) => extname(f).toLowerCase() === ".pdf");

        if (!opts.json) {
          console.log(`${c.dim}   Found ${pdfFiles.length} PDF(s)${c.reset}`);
        }

        for (const file of pdfFiles) {
          const filePath = join(resumesDir, file);
          const result = await parseResume(filePath);
          allResults.push(result);
          if (!opts.json) printResult(result);
        }
      } catch (err) {
        if (!opts.json) {
          console.error(`${c.red}   ❌ Error reading resumes directory: ${err}${c.reset}`);
        }
      }
    }

    // ── Output ──
    if (opts.json) {
      const jsonOutput = JSON.stringify(allResults, null, 2);
      if (opts.output) {
        await writeFile(opts.output, jsonOutput, "utf-8");
      } else {
        console.log(jsonOutput);
      }
    } else if (opts.output) {
      const jsonOutput = JSON.stringify(allResults, null, 2);
      await writeFile(opts.output, jsonOutput, "utf-8");
      console.log(`\n${c.dim}Results written to ${opts.output}${c.reset}`);
    }

    if (!opts.json && allResults.length > 0) {
      printSummary(allResults);
    } else if (!opts.json && allResults.length === 0) {
      console.log(`\n${c.yellow}⚠️  No inputs processed. Use --portfolios, --resumes, or --all${c.reset}`);
    }
  } finally {
    await cleanup();
  }
}

main().catch(console.error);
