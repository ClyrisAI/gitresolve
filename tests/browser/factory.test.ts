import { describe, it, expect, vi, beforeEach } from "vitest";
import { createProvider } from "../../src/browser/factory.js";

describe("Factory createProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BROWSER_PROVIDER;
  });

  it("returns a valid provider (browserless or fetch)", async () => {
    const provider = await createProvider();
    expect(["browserless", "fetch","puppeteer"]).toContain(provider.name);
  });
});
