import type { BrowserProvider } from './types.js';

export type ProviderName = 'puppeteer' | 'browserless' | 'fetch';

/**
 * Creates a BrowserProvider instance using automatic detection or explicit selection.
 *
 * Resolution order:
 * 1. If `preferred` is specified, use that provider (error if unavailable)
 * 2. Check BROWSER_PROVIDER env var
 * 3. Fallback chain: puppeteer → browserless → fetch
 */
export async function createProvider(preferred?: ProviderName): Promise<BrowserProvider> {
  // If explicitly requested, try that one
  if (preferred) {
    const provider = await instantiateProvider(preferred);
    if (await provider.isAvailable()) return provider;
    throw new Error(`Requested provider '${preferred}' is not available`);
  }

  // Check BROWSER_PROVIDER env var
  const envProvider = process.env.BROWSER_PROVIDER as ProviderName | undefined;
  if (envProvider) {
    return createProvider(envProvider);
  }

  // Fallback chain: puppeteer → browserless → fetch
  const chain: ProviderName[] = ['puppeteer', 'browserless', 'fetch'];
  for (const name of chain) {
    try {
      const provider = await instantiateProvider(name);
      if (await provider.isAvailable()) return provider;
    } catch {
      /* try next */
    }
  }

  // Fetch is always available, so this shouldn't happen
  const { FetchProvider } = await import('./fetch-provider.js');
  return new FetchProvider();
}

async function instantiateProvider(name: ProviderName): Promise<BrowserProvider> {
  switch (name) {
    case 'puppeteer': {
      const { PuppeteerProvider } = await import('./puppeteer-provider.js');
      return new PuppeteerProvider();
    }
    case 'browserless': {
      const { BrowserlessProvider } = await import('./browserless-provider.js');
      return new BrowserlessProvider();
    }
    case 'fetch': {
      const { FetchProvider } = await import('./fetch-provider.js');
      return new FetchProvider();
    }
  }
}
