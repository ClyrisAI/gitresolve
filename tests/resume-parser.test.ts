import { describe, it, expect, vi } from "vitest";
import { parseResume } from "../src/resume-parser.js";
import { resolveOwnerAndCategorize } from "../src/disambiguator.js";

// Mock dependencies
vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));

vi.mock("unpdf", () => ({
  getDocumentProxy: vi.fn().mockResolvedValue({
    numPages: 1,
    getPage: vi.fn().mockResolvedValue({
      getAnnotations: vi.fn().mockResolvedValue([
        { subtype: "Link", url: "https://github.com/mockuser" }
      ]),
    }),
  }),
  extractText: vi.fn().mockResolvedValue({
    text: "Here is a text link: https://github.com/mockuser/repo",
  }),
}));

// We only partially mock classifier and disambiguator if we want to isolate,
// but since they are pure functions, we can let them run or mock them.
// Let's mock disambiguator to return predictable results for the parser test.
vi.mock("../src/disambiguator.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/disambiguator.js")>();
  return {
    ...actual,
    resolveOwnerAndCategorize: vi.fn().mockReturnValue({
      ownerProfile: { url: "https://github.com/mockuser", provider: "github", type: "profile", username: "mockuser" },
      confidence: "high",
      ownedRepos: [],
      externalRepos: [],
      warnings: [],
    }),
  };
});

describe("Resume Parser", () => {
  it("extracts git links from text and annotations", async () => {
    const result = await parseResume("mock_resume.pdf");

    expect(result.source).toBe("mock_resume.pdf");
    expect(result.sourceType).toBe("resume_file");
    
    // The links should have been extracted and passed to disambiguator
    expect(resolveOwnerAndCategorize).toHaveBeenCalled();
    
    // The returned result should reflect the disambiguator's output
    expect(result.ownerProfile?.username).toBe("mockuser");
    expect(result.confidence).toBe("high");
  });
});
