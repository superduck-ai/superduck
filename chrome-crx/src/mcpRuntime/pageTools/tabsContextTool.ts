import { tabGroupManager } from '../tabState';
import { formatTabsContext } from '../pageToolsSupport/helpers';
import type { ToolDefinition, ToolResult } from '../pageToolsSupport/types';
import type { EmptyToolInput } from './types';

export const MCP_NATIVE_SESSION = 'mcp-native-session';

export const tabsContextTool: ToolDefinition<EmptyToolInput> = {
  name: 'tabs_context',
  description: 'Get context information about all tabs in the current tab group',
  parameters: {},
  execute: async (_input, context): Promise<ToolResult> => {
    try {
      if (!context?.tabId) throw new Error('No active tab found');

      const isMcpNative = context.sessionId === MCP_NATIVE_SESSION;
      const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);
      const tabContext = {
        currentTabId: context.tabId,
        availableTabs: validTabs,
        tabCount: validTabs.length
      };

      let tabGroupId: number | undefined;
      if (isMcpNative) {
        tabGroupId = await (async (currentTabId: number) => {
          try {
            const tab = await chrome.tabs.get(currentTabId);
            if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) return tab.groupId;
          } catch {
            // ignore
          }
        })(context.tabId);
      }

      const output = formatTabsContext(validTabs, tabGroupId);
      return void 0 !== tabGroupId
        ? { output, tabContext: { ...tabContext, tabGroupId } }
        : { output, tabContext };
    } catch (err) {
      return {
        error: `Failed to query tabs: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'tabs_context',
    description: 'Get context information about all tabs in the current tab group',
    input_schema: { type: 'object', properties: {}, required: [] }
  })
};
