import { PermissionTools } from '../domainPermissions';
import { tabGroupManager } from '../tabState';
import { cdpDebugger } from '../cdp';
import type { NetworkRequest } from '../cdp';
import type { ToolDefinition, ToolResult } from '../pageToolsSupport/types';
import type { ReadNetworkRequestsToolInput } from './types';

export const readNetworkRequestsTool: ToolDefinition<ReadNetworkRequestsToolInput> = {
  name: 'read_network_requests',
  description:
    "Read HTTP network requests (XHR, Fetch, documents, images, etc.) from a specific tab. Useful for debugging API calls, monitoring network activity, or understanding what requests a page is making. Returns all network requests made by the current page, including cross-origin requests. Requests are automatically cleared when the page navigates to a different domain. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
  tabAccess: 'read',
  parameters: {
    tabId: {
      type: 'number',
      description:
        "Tab ID to read network requests from. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID.",
      required: true
    },
    urlPattern: {
      type: 'string',
      description:
        "Optional URL pattern to filter requests. Only requests whose URL contains this string will be returned (e.g., '/api/' to filter API calls, 'example.com' to filter by domain).",
      required: false
    },
    clear: {
      type: 'boolean',
      description:
        'If true, clear the network requests after reading to avoid duplicates on subsequent calls. Default is false.',
      required: false
    },
    limit: {
      type: 'number',
      description:
        'Maximum number of requests to return. Defaults to 100. Increase only if you need more results.',
      required: false
    }
  },
  execute: async (input, context): Promise<ToolResult> => {
    try {
      const { tabId, urlPattern, clear = false, limit = 100 } = input;
      if (!context?.tabId) throw new Error('No active tab found');

      const effectiveTabId = await context.resolveTabId(tabId);
      const tab = await chrome.tabs.get(effectiveTabId);
      if (!tab.id) throw new Error('Active tab has no ID');
      const trackedTabId = tab.id;
      const tabUrl = tab.url;
      if (!tabUrl) throw new Error('No URL available for active tab');

      const toolUseId = context?.toolUseId;
      const permissionResult = await context.permissionManager.checkPermission(tabUrl, toolUseId);
      if (!permissionResult.allowed) {
        if (permissionResult.needsPrompt) {
          return {
            type: 'permission_required',
            tool: PermissionTools.READ_NETWORK_REQUESTS,
            url: tabUrl,
            toolUseId
          };
        }
        return { error: 'Permission denied for reading network requests on this domain' };
      }

      try {
        await cdpDebugger.enableNetworkTracking(trackedTabId);
      } catch (err) {
        return {
          error: `Could not enable network tracking: ${err instanceof Error ? err.message : String(err)}. Try refreshing the page and calling this tool again.`
        };
      }

      const requests = cdpDebugger.getNetworkRequests(trackedTabId, urlPattern);
      if (clear) cdpDebugger.clearNetworkRequests(trackedTabId);

      if (0 === requests.length) {
        let requestType = 'network requests';
        if (urlPattern) requestType = `requests matching "${urlPattern}"`;
        return {
          output: `No ${requestType} found for this tab.\n\nNote: Network tracking starts when this tool is first called. If the page loaded before calling this tool, you may need to refresh the page or perform actions that trigger network requests.`,
          tabContext: {
            currentTabId: context.tabId,
            executedOnTabId: effectiveTabId,
            availableTabs: await tabGroupManager.getValidTabsWithMetadataForContext(
              context.tabId,
              context
            ),
            tabCount: (
              await tabGroupManager.getValidTabsWithMetadataForContext(context.tabId, context)
            ).length
          }
        };
      }

      const limitedRequests = requests.slice(0, limit);
      const hasMore = requests.length > limit;

      const formatted = limitedRequests
        .map((req: NetworkRequest, idx: number) => {
          const status = req.status || 'pending';
          return `${idx + 1}. url: ${req.url}\n   method: ${req.method}\n   statusCode: ${status}`;
        })
        .join('\n\n');

      const filters: string[] = [];
      if (urlPattern) filters.push(`URL pattern: "${urlPattern}"`);
      const filterNote = filters.length > 0 ? ` (filtered by ${filters.join(', ')})` : '';
      const truncationNote = hasMore ? ` (showing first ${limit} of ${requests.length})` : '';
      const header = `Found ${requests.length} network request${1 === requests.length ? '' : 's'}${filterNote}${truncationNote}:`;
      const validTabs = await tabGroupManager.getValidTabsWithMetadataForContext(
        context.tabId,
        context
      );

      return {
        output: `${header}\n\n${formatted}`,
        tabContext: {
          currentTabId: context.tabId,
          executedOnTabId: effectiveTabId,
          availableTabs: validTabs,
          tabCount: validTabs.length
        }
      };
    } catch (err) {
      return {
        error: `Failed to read network requests: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'read_network_requests',
    description:
      "Read HTTP network requests (XHR, Fetch, documents, images, etc.) from a specific tab. Useful for debugging API calls, monitoring network activity, or understanding what requests a page is making. Returns all network requests made by the current page, including cross-origin requests. Requests are automatically cleared when the page navigates to a different domain. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
    input_schema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description:
            "Tab ID to read network requests from. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
        },
        urlPattern: {
          type: 'string',
          description:
            "Optional URL pattern to filter requests. Only requests whose URL contains this string will be returned (e.g., '/api/' to filter API calls, 'example.com' to filter by domain)."
        },
        clear: {
          type: 'boolean',
          description:
            'If true, clear the network requests after reading to avoid duplicates on subsequent calls. Default is false.'
        },
        limit: {
          type: 'number',
          description:
            'Maximum number of requests to return. Defaults to 100. Increase only if you need more results.'
        }
      },
      required: ['tabId']
    }
  })
};
