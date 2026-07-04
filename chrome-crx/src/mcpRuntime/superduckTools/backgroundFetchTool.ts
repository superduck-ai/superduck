import type { ToolDefinition } from '../pageTools';
import type { BackgroundFetchArgs } from './types';
import { eTLDPlus1, resolveActiveTab } from './helpers';

export const superduckBackgroundFetchTool: ToolDefinition<BackgroundFetchArgs> = {
  name: 'superduck_background_fetch',
  description:
    "SuperDuck CLI: fetch a URL from the extension background, automatically including the user's Chrome cookies for the target origin. Default: same eTLD+1 as source tab; pass allowCrossOrigin=true to bypass.",
  tabAccess: 'read',
  parameters: {
    url: { type: 'string', description: 'URL to fetch' },
    method: { type: 'string', description: 'HTTP method (default GET)' },
    headers: { type: 'object', description: 'Header map' },
    body: { type: 'string', description: 'Request body (string)' },
    sourceTabId: {
      type: 'number',
      description: 'Tab whose origin defines the same-domain policy. Default: active tab.'
    },
    allowCrossOrigin: { type: 'boolean', description: 'Allow target origin != source eTLD+1' }
  },
  execute: async (args, context) => {
    try {
      const url = String(args?.url || '');
      if (!url) return { error: 'url is required' };
      let target: URL;
      try {
        target = new URL(url);
      } catch {
        return { error: `invalid url: ${url}` };
      }

      const sourceTab = await resolveActiveTab(args?.sourceTabId, context);
      let sourceETld = '';
      if (sourceTab.url) {
        try {
          sourceETld = eTLDPlus1(new URL(sourceTab.url).hostname);
        } catch {
          /* ignore */
        }
      }
      const targetETld = eTLDPlus1(target.hostname);
      const sameDomain = sourceETld && sourceETld === targetETld;
      if (!sameDomain && !args?.allowCrossOrigin) {
        return {
          error: `cross-origin blocked: target ${targetETld} != source ${sourceETld || '(unknown)'}. Pass --allow-cross-origin to override.`
        };
      }

      const init: RequestInit = {
        method: String(args?.method || 'GET'),
        credentials: 'include',
        headers: args?.headers || undefined,
        body: args?.body !== undefined ? String(args.body) : undefined
      };

      const res = await fetch(url, init);
      const contentType = res.headers.get('content-type') || '';
      const MAX = 900 * 1024;
      let body: string;
      if (contentType.startsWith('image/') || contentType.includes('octet-stream')) {
        const buf = await res.arrayBuffer();
        body = `[binary ${buf.byteLength} bytes, content-type=${contentType}, omitted]`;
      } else {
        const text = await res.text();
        body =
          text.length > MAX
            ? text.slice(0, MAX) + `\n…[truncated ${text.length - MAX} bytes]`
            : text;
      }
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      return {
        output: JSON.stringify({
          status: res.status,
          statusText: res.statusText,
          url: res.url,
          contentType,
          headers,
          body,
          sourceETld,
          targetETld,
          sameDomain
        })
      };
    } catch (err) {
      return {
        error: `superduck_background_fetch failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'superduck_background_fetch',
    description: "SuperDuck CLI: fetch using user's Chrome cookies",
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        method: { type: 'string' },
        headers: { type: 'object' },
        body: { type: 'string' },
        sourceTabId: { type: 'number' },
        allowCrossOrigin: { type: 'boolean' }
      },
      required: ['url']
    }
  })
};
