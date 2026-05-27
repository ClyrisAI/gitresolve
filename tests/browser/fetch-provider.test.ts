import { describe, it, expect, vi, beforeEach } from "vitest";
import { FetchProvider } from "../../src/browser/fetch-provider.js";

describe("FetchProvider", () => {
  let provider: FetchProvider;

  beforeEach(() => {
    provider = new FetchProvider();
    global.fetch = vi.fn();
  });

  it("has the correct name", () => {
    expect(provider.name).toBe("fetch");
  });

  it("is always available", async () => {
    await expect(provider.isAvailable()).resolves.toBe(true);
  });

  it("fetches page content successfully", async () => {
    const mockHtml = "<html><body>Hello World</body></html>";
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => mockHtml,
    } as Response);

    const content = await provider.getPageContent("https://example.com");

    expect(content).toBe(mockHtml);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "Mozilla/5.0 (compatible; ClyrisBot/1.0)",
        }),
      })
    );
  });

  it("throws an error if response is not ok", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);

    await expect(provider.getPageContent("https://example.com")).rejects.toThrow(
      "Fetch failed with 404: Not Found"
    );
  });

  it("cleanup does nothing but resolves", async () => {
    await expect(provider.cleanup()).resolves.toBeUndefined();
  });
});
