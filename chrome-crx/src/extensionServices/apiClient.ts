import { getConfig } from './core';
import { fetchEventSource, type FetchEventSourceOptions } from './eventSource';
import { getAccessToken } from './oauth';

export const apiClient = new (class {
  baseURL: string;

  constructor() {
    this.baseURL = getConfig().apiBaseUrl;
  }

  async fetch(
    path: string,
    options: RequestInit & { headers?: Record<string, string> } = {}
  ): Promise<any> {
    const token = await getAccessToken();
    if (!token) throw new Error('No valid OAuth token available');

    const url = `${this.baseURL}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'anthropic-client-platform': 'claude_browser_extension',
      ...(options.headers as Record<string, string>)
    };
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (response.status === 204) return null;
    if (contentType?.includes('application/json')) return response.json();
    if (contentType) return response.blob();
    return null;
  }

  async fetchEventSource(path: string, options: FetchEventSourceOptions): Promise<() => void> {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('No valid OAuth token available for SSE stream');
    }

    const url = `${this.baseURL}${path}`;
    const controller = new AbortController();
    await fetchEventSource(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-client-platform': 'claude_browser_extension',
        ...options.headers
      },
      signal: options.signal || controller.signal
    });
    return () => controller.abort();
  }
})();
