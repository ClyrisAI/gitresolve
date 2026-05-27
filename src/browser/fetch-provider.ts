import type { BrowserProvider, BrowserProviderOptions } from './types.js';

/**
 * Simplest provider — uses native fetch to download HTML.
 * No JavaScript rendering, but works everywhere without extra dependencies.
 * Handles ~60% of static portfolio sites.
 */
export class FetchProvider implements BrowserProvider {
  readonly name = 'fetch';

  async getPageContent(url: string, options?: BrowserProviderOptions): Promise<string> {
    const timeout = options?.timeout ?? 15000;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ClyrisBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      throw new Error(`Fetch failed with ${response.status}: ${response.statusText}`);
    }

    return response.text();
  }

  async isAvailable(): Promise<boolean> {
    // Fetch is always available (built into Node 18+)
    return true;
  }

  async cleanup(): Promise<void> {
    // Nothing to clean up
  }
}
