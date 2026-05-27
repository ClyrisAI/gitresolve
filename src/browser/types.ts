export interface BrowserProviderOptions {
  /** Navigation timeout in milliseconds */
  timeout?: number;
  /** When to consider navigation complete */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
}

/**
 * Abstraction over different browser/HTTP engines for fetching page content.
 * Implementations: PuppeteerProvider, BrowserlessProvider, FetchProvider.
 */
export interface BrowserProvider {
  /** Human-readable provider name */
  readonly name: string;
  /** Fetch the fully rendered HTML content of a page */
  getPageContent(url: string, options?: BrowserProviderOptions): Promise<string>;
  /** Check if this provider is currently usable */
  isAvailable(): Promise<boolean>;
  /** Release any resources (close browser, etc.) */
  cleanup(): Promise<void>;
}
