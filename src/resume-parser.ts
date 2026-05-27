import { readFile } from "fs/promises";
import type { ResolverResult } from "./types.js";
import { GIT_HOSTS } from "./types.js";
import { parseGitLink, extractGitUrlsFromText } from "./classifier.js";
import { resolveOwnerAndCategorize } from "./disambiguator.js";

// ─── Resume Parser ──────────────────────────────────────────────────

export async function parseResume(filePath: string): Promise<ResolverResult> {
  const result: ResolverResult = {
    source: filePath,
    sourceType: "resume_file",
    ownerProfile: null,
    confidence: "none",
    ownedRepos: [],
    externalRepos: [],
    allLinks: [],
    warnings: [],
  };

  try {
    const pdfBuffer = await readFile(filePath);
    const allGitUrls: string[] = [];

    // ── Method 1: Text extraction with unpdf ──
    try {
      const { getDocumentProxy, extractText } = await import("unpdf");
      const copy1 = new Uint8Array(pdfBuffer);
      const pdf = await getDocumentProxy(copy1);
      const { text } = await extractText(pdf, { mergePages: true });

      const textUrls = extractGitUrlsFromText(text);
      allGitUrls.push(...textUrls);

      if (textUrls.length > 0) {
        result.warnings.push(`Found ${textUrls.length} git URL(s) in text content`);
      }
    } catch (textErr) {
      result.warnings.push(
        `Text extraction failed: ${textErr instanceof Error ? textErr.message : "unknown"}`
      );
    }

    // ── Method 2: Hyperlink annotation extraction ──
    try {
      const { getDocumentProxy } = await import("unpdf");
      const copy2 = new Uint8Array(pdfBuffer);
      const pdf = await getDocumentProxy(copy2);

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const annotations = await page.getAnnotations();
        for (const ann of annotations) {
          if (ann.subtype === "Link" && typeof ann.url === "string") {
            try {
              const host = new URL(ann.url).hostname.toLowerCase();
              if (host in GIT_HOSTS) {
                allGitUrls.push(ann.url);
              }
            } catch { /* not a valid URL */ }
          }
        }
      }
    } catch (annErr) {
      result.warnings.push(
        `Annotation extraction failed: ${annErr instanceof Error ? annErr.message : "unknown"}`
      );
    }

    // Dedupe and parse
    const unique = [...new Set(allGitUrls.map((u) => u.replace(/\/+$/, "")))];
    for (const gitUrl of unique) {
      const parsed = parseGitLink(gitUrl);
      if (parsed) {
        result.allLinks.push(parsed);
      }
    }

    // Resolve owner and categorize repos
    const resolution = resolveOwnerAndCategorize(result.allLinks, "resume");
    result.ownerProfile = resolution.ownerProfile;
    result.confidence = resolution.confidence;
    result.ownedRepos = resolution.ownedRepos;
    result.externalRepos = resolution.externalRepos;
    result.warnings.push(...resolution.warnings);

  } catch (err) {
    result.error = err instanceof Error ? err.message : "Unknown error parsing resume";
  }

  return result;
}
