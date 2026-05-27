import type { BrowserProvider, BrowserProviderOptions } from './types.js';

/**
 * Provider that uses Puppeteer for full headless browser rendering.
 * Puppeteer is lazy-loaded to avoid crashes when it's not installed.
 * Manages browser lifecycle — one browser instance reused across calls.
 */
export class PuppeteerProvider implements BrowserProvider {
  readonly name = 'puppeteer';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private browser: any = null;

  async getPageContent(url: string, options?: BrowserProviderOptions): Promise<string> {
    const timeout = options?.timeout ?? 30000;
    const waitUntil = options?.waitUntil ?? 'networkidle2';

    const browser = await this.ensureBrowser();
    const page = await browser.newPage();

    try {
      await page.goto(url, { waitUntil, timeout });
      const content: string = await page.content();
      return content;
    } finally {
      await page.close().catch(() => {});
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // @ts-ignore - Optional peer dependency
      await import('puppeteer');
      return true;
    } catch {
      return false;
    }
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Ignore close errors
      }
      this.browser = null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async ensureBrowser(): Promise<any> {
    if (!this.browser) {
      // @ts-ignore - Optional peer dependency
      const puppeteer = await import('puppeteer');
      this.browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browser;
  }
}
