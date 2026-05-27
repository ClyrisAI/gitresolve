import { basename } from "path";
import type { ResolverResult, AggregatedResult } from "./types.js";

// ─── ANSI Colors ────────────────────────────────────────────────────

export const c = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  red:     "\x1b[31m",
  cyan:    "\x1b[36m",
  magenta: "\x1b[35m",
  white:   "\x1b[37m",
  blue:    "\x1b[34m",
};

// ─── Pretty Printing ───────────────────────────────────────────────

let resultCounter = 0;

/** Reset the result counter (useful between runs in testing) */
export function resetResultCounter(): void {
  resultCounter = 0;
}

export function printResult(result: ResolverResult): void {
  resultCounter++;

  const confColor = result.confidence === "high" ? c.green :
    result.confidence === "medium" ? c.yellow :
      result.confidence === "low" ? c.red : c.dim;

  const confIcon = result.confidence === "high" ? "✅" :
    result.confidence === "medium" ? "🟡" :
      result.confidence === "low" ? "🟠" : "❌";

  // Box header
  console.log("");
  console.log(`${c.cyan}┌${"─".repeat(72)}┐${c.reset}`);
  console.log(`${c.cyan}│${c.reset} ${c.bold}#${resultCounter}  ${basename(result.source)}${c.reset}`);
  console.log(`${c.cyan}│${c.reset}  Type: ${c.dim}${result.sourceType}${c.reset}    Confidence: ${confColor}${confIcon} ${result.confidence.toUpperCase()}${c.reset}`);
  console.log(`${c.cyan}├${"─".repeat(72)}┤${c.reset}`);

  // ── Owner Profile ──
  if (result.ownerProfile) {
    const badge = `[${result.ownerProfile.provider.toUpperCase()}]`;
    console.log(`${c.cyan}│${c.reset}  ${c.green}${c.bold}👤 OWNER: ${result.ownerProfile.username}${c.reset}  ${c.dim}${badge}${c.reset}`);
    console.log(`${c.cyan}│${c.reset}  ${c.dim}   ${result.ownerProfile.url}${c.reset}`);
  } else {
    console.log(`${c.cyan}│${c.reset}  ${c.red}👤 OWNER: NOT FOUND${c.reset}`);
  }

  // ── Owned Repos ──
  if (result.ownedRepos.length > 0) {
    console.log(`${c.cyan}│${c.reset}`);
    console.log(`${c.cyan}│${c.reset}  ${c.green}📦 Owned repos (${result.ownedRepos.length}):${c.reset}`);
    for (const repo of result.ownedRepos) {
      const repoName = repo.repo || repo.url.split("/").pop() || "?";
      console.log(`${c.cyan}│${c.reset}    ${c.green}✓${c.reset} ${repo.username}/${c.bold}${repoName}${c.reset}`);
      console.log(`${c.cyan}│${c.reset}      ${c.dim}${repo.url}${c.reset}`);
    }
  }

  // ── External Repos (contributions / references) ──
  if (result.externalRepos.length > 0) {
    console.log(`${c.cyan}│${c.reset}`);
    console.log(`${c.cyan}│${c.reset}  ${c.blue}🔗 External repos / contributions (${result.externalRepos.length}):${c.reset}`);
    for (const repo of result.externalRepos) {
      const repoName = repo.repo || repo.url.split("/").pop() || "?";
      console.log(`${c.cyan}│${c.reset}    ${c.dim}→${c.reset} ${repo.username}/${c.dim}${repoName}${c.reset}`);
      console.log(`${c.cyan}│${c.reset}      ${c.dim}${repo.url}${c.reset}`);
    }
  }

  // ── Warnings ──
  if (result.warnings.length > 0) {
    console.log(`${c.cyan}│${c.reset}`);
    for (const w of result.warnings) {
      console.log(`${c.cyan}│${c.reset}  ${c.yellow}⚠ ${w}${c.reset}`);
    }
  }

  if (result.error) {
    console.log(`${c.cyan}│${c.reset}  ${c.red}🚨 ${result.error}${c.reset}`);
  }

  console.log(`${c.cyan}└${"─".repeat(72)}┘${c.reset}`);
}

export function printSummary(results: AggregatedResult[]): void {
  const total = results.length;
  const resolved = results.filter((r) => r.ownerProfile !== null).length;
  const high = results.filter((r) => r.confidence === "high").length;
  const medium = results.filter((r) => r.confidence === "medium").length;
  const low = results.filter((r) => r.confidence === "low").length;
  const none = results.filter((r) => r.confidence === "none").length;
  const totalOwned = results.reduce((sum, r) => sum + r.ownedRepos.length, 0);
  const totalExternal = results.reduce((sum, r) => sum + r.externalRepos.length, 0);

  console.log("");
  console.log(`${c.magenta}╔${"═".repeat(72)}╗${c.reset}`);
  console.log(`${c.magenta}║${c.reset} ${c.bold}📊 AGGREGATED SUMMARY${c.reset}`);
  console.log(`${c.magenta}╠${"═".repeat(72)}╣${c.reset}`);
  console.log(`${c.magenta}║${c.reset}  Candidates:  ${c.bold}${total}${c.reset} total, ${c.green}${resolved} resolved${c.reset}, ${c.red}${total - resolved} unresolved${c.reset}`);
  console.log(`${c.magenta}║${c.reset}  Confidence:  ✅ ${high} high   🟡 ${medium} medium   🟠 ${low} low   ❌ ${none} none`);
  console.log(`${c.magenta}║${c.reset}  Repos found: ${c.green}${totalOwned} owned${c.reset}, ${c.blue}${totalExternal} external${c.reset}`);
  console.log(`${c.magenta}╚${"═".repeat(72)}╝${c.reset}`);

  // Resolved candidates table
  const resolvedList = results
    .filter((r) => r.ownerProfile)
    .map((r) => ({
      sources: r.sources.map(s => basename(s)).join(", "),
      provider: r.ownerProfile!.provider,
      username: r.ownerProfile!.username,
      owned: r.ownedRepos.length,
      external: r.externalRepos.length,
      confidence: r.confidence,
    }));

  if (resolvedList.length > 0) {
    console.log(`\n${c.bold}📋 Resolved candidates:${c.reset}`);
    console.table(resolvedList);
  }

  const unresolved = results.filter((r) => !r.ownerProfile);
  if (unresolved.length > 0) {
    console.log(`\n${c.bold}📋 Unresolved (needs manual review):${c.reset}`);
    for (const r of unresolved) {
      let msg = "";
      if (r.warnings.length > 0) {
        msg = r.warnings.join("; ");
      }
      if (r.allLinks.length === 0 && !msg.includes("No git links found")) {
        msg = msg ? `${msg}; No git links found` : "No git links found";
      } else if (!msg) {
        msg = "No owner profile resolved";
      }
      console.log(`  ${c.red}✗${c.reset} ${r.sources.map(s => basename(s)).join(", ")}: ${c.dim}${msg}${c.reset}`);
    }
  }
}
