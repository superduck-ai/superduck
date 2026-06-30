import { PermissionTools } from '../domainPermissions';
import { tabGroupManager } from '../tabState';
import { checkDomainCategoryForNavigation } from '../navigationIsolation';
import type { ToolDefinition, ToolResult } from '../pageToolsSupport/types';
import type { TabsCreateToolInput } from './types';
import { normalizeHttpUrlForNavigation } from './navigateTool';

export const tabsCreateTool: ToolDefinition<TabsCreateToolInput> = {
  name: 'tabs_create',
  description:
    'Creates a new background tab in the current tab group, optionally opening a URL immediately. Use this when the user asks for a new tab or when the workflow should keep the current page open while opening another page, such as search results, detail pages, or comparison pages.',
  parameters: {
    url: {
      type: 'string',
      description:
        'Optional URL to open in the new background tab. Can be provided with or without protocol (defaults to https://). Omit to create a blank new tab.'
    },
    tabId: {
      type: 'number',
      description:
        "Tab ID whose current group should receive the new tab. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
    }
  },
  execute: async (input, context): Promise<ToolResult> => {
    try {
      if (!context?.tabId) throw new Error('No active tab found');
      const { url, tabId } = input || {};

      const effectiveTabId = await tabGroupManager.getEffectiveTabId(tabId, context.tabId);
      const currentTab = await chrome.tabs.get(effectiveTabId);
      const targetUrl = url ? normalizeHttpUrlForNavigation(url) : 'chrome://newtab';

      if (url) {
        const categoryResult = await checkDomainCategoryForNavigation(targetUrl, 'tabs_create');
        if (categoryResult) return categoryResult;

        const toolUseId = context?.toolUseId;
        const permissionResult = await context.permissionManager.checkPermission(
          targetUrl,
          toolUseId
        );
        if (!permissionResult.allowed) {
          return permissionResult.needsPrompt
            ? {
                type: 'permission_required',
                tool: PermissionTools.NAVIGATE,
                url: targetUrl,
                toolUseId
              }
            : { error: 'Navigation to this domain is not allowed' };
        }
      }

      const newTab = await chrome.tabs.create({
        url: targetUrl,
        active: false,
        openerTabId: effectiveTabId
      });
      if (!newTab.id) throw new Error('Failed to create tab - no tab ID returned');

      const mainTabId = await tabGroupManager.getMainTabId(effectiveTabId);
      if (mainTabId) {
        await tabGroupManager.addTabToGroup(mainTabId, newTab.id, { origin: 'agent' });
      } else if (currentTab.groupId && currentTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        await chrome.tabs.group({ tabIds: newTab.id, groupId: currentTab.groupId });
      }

      const validTabs = await tabGroupManager.getValidTabsWithMetadata(effectiveTabId);
      return {
        output: url
          ? `Opened ${targetUrl} in new tab. Tab ID: ${newTab.id}`
          : `Created new tab. Tab ID: ${newTab.id}`,
        tabContext: {
          currentTabId: context.tabId,
          executedOnTabId: newTab.id,
          availableTabs: validTabs,
          tabCount: validTabs.length
        }
      };
    } catch (err) {
      return {
        error: `Failed to create tab: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'tabs_create',
    description:
      'Creates a new background tab in the current tab group, optionally opening a URL immediately. Use this when the user asks for a new tab or when the workflow should keep the current page open while opening another page, such as search results, detail pages, or comparison pages.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'Optional URL to open in the new background tab. Can be provided with or without protocol (defaults to https://). Omit to create a blank new tab.'
        },
        tabId: {
          type: 'number',
          description:
            "Tab ID whose current group should receive the new tab. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
        }
      },
      required: []
    }
  })
};
