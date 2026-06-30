import type { ToolDefinition } from '../pageTools';
import type { HistoryArgs } from './types';

export const superduckHistoryTool: ToolDefinition<HistoryArgs> = {
  name: 'superduck_history',
  description:
    "SuperDuck CLI: search the user's Chrome browsing history. Returns url, title, and dateVisited for each entry. Supports text search, result limit, and date range filtering.",
  parameters: {
    query: {
      type: 'string',
      description: 'Search text to filter history entries (default: empty string matches all)'
    },
    limit: {
      type: 'number',
      description: 'Maximum number of results to return (default 100, max 500)'
    },
    from: {
      type: 'string',
      description:
        'Start date filter (ISO 8601 string, e.g. "2025-01-01" or "2025-01-01T00:00:00Z")'
    },
    to: {
      type: 'string',
      description: 'End date filter (ISO 8601 string)'
    }
  },
  execute: async (args) => {
    try {
      const query = typeof args?.query === 'string' ? args.query : '';
      const limit = Math.min(Math.max(1, args?.limit ?? 100), 500);

      const searchParams: chrome.history.HistoryQuery = {
        text: query,
        maxResults: limit,
        startTime: 0
      };

      if (args?.from) {
        const t = Date.parse(args.from);
        if (Number.isNaN(t)) return { error: `Invalid "from" date: ${args.from}` };
        searchParams.startTime = t;
      }

      if (args?.to) {
        const t = Date.parse(args.to);
        if (Number.isNaN(t)) return { error: `Invalid "to" date: ${args.to}` };
        searchParams.endTime = t;
      }

      const items = await chrome.history.search(searchParams);

      const results = items.flatMap((item) => {
        if (typeof item.url !== 'string') return [];
        if (typeof item.lastVisitTime !== 'number' || !Number.isFinite(item.lastVisitTime))
          return [];
        return [
          {
            url: item.url,
            ...(item.title ? { title: item.title } : {}),
            dateVisited: new Date(item.lastVisitTime).toISOString()
          }
        ];
      });

      return {
        output: JSON.stringify(
          { message: `Found ${results.length} history entries`, history: results },
          null,
          2
        )
      };
    } catch (err) {
      return {
        error: `superduck_history failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'superduck_history',
    description:
      "SuperDuck CLI: search the user's Chrome browsing history. Returns url, title, dateVisited.",
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search text to filter history entries'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default 100, max 500)'
        },
        from: {
          type: 'string',
          description: 'Start date filter (ISO 8601)'
        },
        to: {
          type: 'string',
          description: 'End date filter (ISO 8601)'
        }
      },
      required: []
    }
  })
};
