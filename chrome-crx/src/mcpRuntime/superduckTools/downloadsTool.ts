import type { ToolDefinition } from '../pageTools';
import { DEFAULT_BROWSER_SESSION_ID } from '../sessionScope';
import type { DownloadsArgs } from './types';

export const superduckDownloadsTool: ToolDefinition<DownloadsArgs> = {
  name: 'superduck_downloads',
  description:
    'SuperDuck CLI: query recent Chrome downloads. Returns filename, url, status, fileSize, startTime for each download. Optionally filter by filename text or state (in_progress, complete, interrupted).',
  tabAccess: 'read',
  parameters: {
    query: {
      type: 'string',
      description: 'Filter downloads by filename substring (case-insensitive)'
    },
    limit: {
      type: 'number',
      description: 'Maximum number of results to return (default 20, max 100)'
    },
    state: {
      type: 'string',
      description: 'Filter by download state: "in_progress", "complete", or "interrupted"'
    }
  },
  execute: async (args, context) => {
    try {
      if (context?.browserSessionScope.sessionId !== DEFAULT_BROWSER_SESSION_ID) {
        return {
          error:
            'superduck_downloads is unavailable for scoped browser sessions because Chrome downloads are global browser downloads.'
        };
      }
      const limit = Math.min(Math.max(1, args?.limit ?? 20), 100);
      const searchQuery: chrome.downloads.DownloadQuery = {
        limit,
        orderBy: ['-startTime']
      };

      if (args?.query) {
        searchQuery.filenameRegex = args.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }

      const validStates = ['in_progress', 'complete', 'interrupted'] as const;
      if (args?.state && validStates.includes(args.state as (typeof validStates)[number])) {
        searchQuery.state = args.state as chrome.downloads.DownloadQuery['state'];
      }

      const items = await chrome.downloads.search(searchQuery);
      const results = items.map((item) => ({
        id: item.id,
        filename: item.filename,
        url: item.finalUrl || item.url,
        state: item.state,
        fileSize: item.fileSize,
        totalBytes: item.totalBytes,
        bytesReceived: item.bytesReceived,
        startTime: item.startTime,
        endTime: item.endTime || undefined,
        mime: item.mime || undefined,
        danger: item.danger !== 'safe' ? item.danger : undefined,
        error: item.error || undefined
      }));

      return {
        output: JSON.stringify(
          { message: `Found ${results.length} download(s)`, downloads: results },
          null,
          2
        )
      };
    } catch (err) {
      return {
        error: `superduck_downloads failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'superduck_downloads',
    description:
      'SuperDuck CLI: query recent Chrome downloads. Returns filename, url, status, fileSize, startTime.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Filter downloads by filename substring'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default 20, max 100)'
        },
        state: {
          type: 'string',
          enum: ['in_progress', 'complete', 'interrupted'],
          description: 'Filter by download state'
        }
      },
      required: []
    }
  })
};
