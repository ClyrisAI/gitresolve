import type { BrowserProvider, BrowserProviderOptions } from './types.js';

/**
 * Provider that uses a Browserless REST API for full JS-rendered page content.
 * Requires a running Browserless instance (e.g., Docker container).
 * Configured via BROWSERLESS_URL env var or constructor parameter.
 */
export class BrowserlessProvider implements BrowserProvider {
  readonly name = 'browserless';
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.BROWSERLESS_URL ?? 'http://localhost:3000';
  }

  async getPageContent(url: string, options?: BrowserProviderOptions): Promise<string> {
    const timeout = options?.timeout ?? 30000;
    const waitUntil = options?.waitUntil ?? 'networkidle2';
    const endpoint = `${this.baseUrl}/content`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        gotoOptions: {
          waitUntil,
          timeout,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Browserless /content returned ${response.status}: ${response.statusText} ${body}`
      );
    }

    return response.text();
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/json/version`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async cleanup(): Promise<void> {
    // Browserless is stateless REST — nothing to clean up
  }
}
