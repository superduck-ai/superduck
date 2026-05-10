import { getAccessToken } from '../../extensionServices';

export function extractDomain(url: string): string {
  if (!url.startsWith('http')) url = `https://${url}`;
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function normalizeDomain(url: string): string {
  return url
    .toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .replace(/\/.*$/, '');
}

export async function verifyDomainUnchanged(
  tabId: number,
  url: string,
  operation: string
): Promise<{ error: string } | null> {
  if (!url) return null;
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url) return { error: 'Unable to verify current URL for security check' };
  const originalDomain = extractDomain(url);
  const currentDomain = extractDomain(tab.url);
  if (originalDomain !== currentDomain)
    return {
      error: `Security check failed: Domain changed from ${originalDomain} to ${currentDomain} during ${operation}`
    };
  return null;
}

interface DomainCategoryCacheEntry {
  category: string | undefined;
  timestamp: number;
}

export class DomainCategoryCache {
  static cache = new Map<string, DomainCategoryCacheEntry>();
  static CACHE_TTL_MS = 300000;
  static pendingRequests = new Map<string, Promise<string | undefined>>();

  static async getCategory(url: string): Promise<string | undefined> {
    const domain = normalizeDomain(extractDomain(url));
    const cached = this.cache.get(domain);
    if (cached) {
      if (!(Date.now() - cached.timestamp > this.CACHE_TTL_MS)) return cached.category;
      this.cache.delete(domain);
    }
    const pending = this.pendingRequests.get(domain);
    if (pending) return pending;
    const request = this.fetchCategoryFromAPI(domain);
    this.pendingRequests.set(domain, request);
    try {
      return await request;
    } finally {
      this.pendingRequests.delete(domain);
    }
  }

  static async fetchCategoryFromAPI(domain: string): Promise<string | undefined> {
    const token = await getAccessToken();
    if (token)
      try {
        const url = new URL('/api/web/domain_info/browser_extension', 'https://api.anthropic.com');
        url.searchParams.append('domain', domain);
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });
        if (!response.ok) return;
        const data = await response.json();
        const category = this.getEffectiveCategory(data);
        return (this.cache.set(domain, { category, timestamp: Date.now() }), category);
      } catch (err) {
        return;
      }
  }

  static getEffectiveCategory(data: any): string {
    return 'block' === data.org_policy ? 'category_org_blocked' : data.category;
  }

  static clearCache(): void {
    this.cache.clear();
  }

  static evictFromCache(domain: string): void {
    const normalized = normalizeDomain(domain);
    this.cache.delete(normalized);
  }

  static getCacheSize(): number {
    return this.cache.size;
  }
}

export const domainCategoryCache = {
  getCategory: (url: string) => DomainCategoryCache.getCategory(url)
};

export const categoryChecker = {
  getCategory: (url: string) => DomainCategoryCache.getCategory(url)
};
