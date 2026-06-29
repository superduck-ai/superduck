import { PermissionTools } from '../domainPermissions';
import { tabGroupManager } from '../tabState';
import { checkDomainCategoryForNavigation } from '../navigationIsolation';
import type { ToolDefinition, ToolResult } from '../pageToolsSupport/types';
import type { NavigateToolInput } from './types';

export function normalizeHttpUrlForNavigation(url: string): string {
  let normalizedUrl = url;
  if (!normalizedUrl.match(/^https?:\/\//)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  try {
    const parsedUrl = new URL(normalizedUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('Unsupported protocol');
    }
    return parsedUrl.href;
  } catch {
    throw new Error(
      `Invalid URL: "${url}". Ensure the URL has a valid format (e.g., "https://example.com" or "example.com"). Only http:// and https:// schemes are supported.`
    );
  }
}

export const navigateTool: ToolDefinition<NavigateToolInput> = {
  name: 'navigate',
  description:
    "Navigate to a URL in an existing tab, open a URL in a new background tab in the same tab group, or go forward/back in browser history. Use newTab:true when the current page should remain open, such as opening search results, detail pages, or comparison pages. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
  parameters: {
    url: {
      type: 'string',
      description:
        'The URL to navigate to. Can be provided with or without protocol (defaults to https://). Use "forward" to go forward in history or "back" to go back in history.'
    },
    tabId: {
      type: 'number',
      description:
        "Tab ID to navigate. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
    },
    newTab: {
      type: 'boolean',
      description:
        'When true, open the URL in a new background tab in the same tab group instead of replacing the current tab. Use this for search result pages or detail pages when the original page should stay open. Not supported with "back" or "forward".'
    }
  },
  execute: async (input, context): Promise<ToolResult> => {
    try {
      const { url, tabId, newTab } = input;
      if (!url) throw new Error('URL parameter is required');
      if (!context?.tabId) throw new Error('No active tab found');

      const effectiveTabId = await tabGroupManager.getEffectiveTabId(tabId, context.tabId);
      const isHistoryNavigation = ['back', 'forward'].includes(url.toLowerCase());
      if (newTab && isHistoryNavigation) {
        throw new Error('newTab is not supported with back/forward navigation');
      }

      if (url && !isHistoryNavigation) {
        const categoryResult = await checkDomainCategoryForNavigation(url, 'navigate');
        if (categoryResult) return categoryResult;
      }

      const tab = await chrome.tabs.get(effectiveTabId);
      if (!tab.id) throw new Error('Active tab has no ID');

      if ('back' === url.toLowerCase()) {
        await chrome.tabs.goBack(tab.id);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const updatedTab = await chrome.tabs.get(tab.id);
        const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);
        return {
          output: `Navigated back to ${updatedTab.url}`,
          tabContext: {
            currentTabId: context.tabId,
            executedOnTabId: effectiveTabId,
            availableTabs: validTabs,
            tabCount: validTabs.length
          }
        };
      }

      if ('forward' === url.toLowerCase()) {
        await chrome.tabs.goForward(tab.id);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const updatedTab = await chrome.tabs.get(tab.id);
        const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);
        return {
          output: `Navigated forward to ${updatedTab.url}`,
          tabContext: {
            currentTabId: context.tabId,
            executedOnTabId: effectiveTabId,
            availableTabs: validTabs,
            tabCount: validTabs.length
          }
        };
      }

      const normalizedUrl = normalizeHttpUrlForNavigation(url);

      const toolUseId = context?.toolUseId;
      const permissionResult = await context.permissionManager.checkPermission(
        normalizedUrl,
        toolUseId
      );
      if (!permissionResult.allowed) {
        return permissionResult.needsPrompt
          ? {
              type: 'permission_required',
              tool: PermissionTools.NAVIGATE,
              url: normalizedUrl,
              toolUseId
            }
          : { error: 'Navigation to this domain is not allowed' };
      }

      if (newTab) {
        const createdTab = await chrome.tabs.create({
          url: normalizedUrl,
          active: false,
          openerTabId: effectiveTabId
        });
        if (!createdTab.id) throw new Error('Failed to create tab - no tab ID returned');
        const mainTabId = await tabGroupManager.getMainTabId(effectiveTabId);
        if (mainTabId) {
          await tabGroupManager.addTabToGroup(mainTabId, createdTab.id, { origin: 'agent' });
        } else if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
          await chrome.tabs.group({ tabIds: createdTab.id, groupId: tab.groupId });
        }
        const validTabs = await tabGroupManager.getValidTabsWithMetadata(effectiveTabId);
        return {
          output: `Opened ${normalizedUrl} in new tab. Tab ID: ${createdTab.id}`,
          tabContext: {
            currentTabId: context.tabId,
            executedOnTabId: createdTab.id,
            availableTabs: validTabs,
            tabCount: validTabs.length
          }
        };
      }

      await chrome.tabs.update(effectiveTabId, { url: normalizedUrl });
      await new Promise((resolve) => setTimeout(resolve, 100));

      const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);
      return {
        output: `Navigated to ${normalizedUrl}`,
        tabContext: {
          currentTabId: context.tabId,
          executedOnTabId: effectiveTabId,
          availableTabs: validTabs,
          tabCount: validTabs.length
        }
      };
    } catch (err) {
      return {
        error: `Failed to navigate: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'navigate',
    description:
      "Navigate to a URL in an existing tab, open a URL in a new background tab in the same tab group, or go forward/back in browser history. Use newTab:true when the current page should remain open, such as opening search results, detail pages, or comparison pages. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'The URL to navigate to. Can be provided with or without protocol (defaults to https://). Use "forward" to go forward in history or "back" to go back in history.'
        },
        tabId: {
          type: 'number',
          description:
            "Tab ID to navigate. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
        },
        newTab: {
          type: 'boolean',
          description:
            'When true, open the URL in a new background tab in the same tab group instead of replacing the current tab. Use this for search result pages or detail pages when the original page should stay open. Not supported with "back" or "forward".'
        }
      },
      required: ['url', 'tabId']
    }
  })
};
