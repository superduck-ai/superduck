import { getConfig } from './core';
import { fetchEventSource, type FetchEventSourceOptions } from './eventSource';
import { getAccessToken } from './oauth';

export const apiClient = new (class {
  baseURL: string;

  constructor() {
    this.baseURL = getConfig().apiBaseUrl;
  }

  private async getAuthorizedResponse(
    path: string,
    options: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {}
  ): Promise<Response> {
    const token = await getAccessToken();
    if (!token) throw new Error('No valid OAuth token available');

    const url = `${this.baseURL}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'anthropic-client-platform': 'claude_browser_extension',
      ...(options.headers ?? {})
    };
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    return response;
  }

  async fetch(
    path: string,
    options: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {}
  ): Promise<Blob | null> {
    const response = await this.getAuthorizedResponse(path, options);

    const contentType = response.headers.get('content-type');
    if (response.status === 204) return null;
    if (contentType) return response.blob();
    return null;
  }

  async fetchJson<TResponse>(
    path: string,
    parse: (value: unknown) => TResponse,
    options: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {}
  ): Promise<TResponse> {
    const response = await this.getAuthorizedResponse(path, options);
    if (response.status === 204) {
      throw new Error('Expected JSON response but received 204 No Content');
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      throw new Error(`Expected JSON response but received ${contentType ?? 'unknown content type'}`);
    }

    const responseBody: unknown = await response.json();
    return parse(responseBody);
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
