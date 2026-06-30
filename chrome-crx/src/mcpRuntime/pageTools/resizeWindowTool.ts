import { tabGroupManager } from '../tabState';
import type { ToolDefinition, ToolResult } from '../pageToolsSupport/types';
import type { ResizeWindowToolInput } from './types';

export const resizeWindowTool: ToolDefinition<ResizeWindowToolInput> = {
  name: 'resize_window',
  description:
    "Resize the current browser window to specified dimensions. Useful for testing responsive designs or setting up specific screen sizes. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
  parameters: {
    width: { type: 'number', description: 'Target window width in pixels' },
    height: { type: 'number', description: 'Target window height in pixels' },
    tabId: {
      type: 'number',
      description:
        "Tab ID to get the window for. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
    }
  },
  execute: async (input, context): Promise<ToolResult> => {
    try {
      const { width, height, tabId } = input;
      if (!width || !height) throw new Error('Both width and height parameters are required');
      if (!tabId) throw new Error('tabId parameter is required');
      if (!context?.tabId) throw new Error('No active tab found');
      if ('number' !== typeof width || 'number' !== typeof height)
        throw new Error('Width and height must be numbers');
      if (width <= 0 || height <= 0) throw new Error('Width and height must be positive numbers');
      if (width > 7680 || height > 4320)
        throw new Error('Dimensions exceed 8K resolution limit. Maximum dimensions are 7680x4320');

      const effectiveTabId = await tabGroupManager.getEffectiveTabId(tabId, context.tabId);
      const tab = await chrome.tabs.get(effectiveTabId);
      if (!tab.windowId) throw new Error('Tab does not have an associated window');

      await chrome.windows.update(tab.windowId, {
        width: Math.floor(width),
        height: Math.floor(height)
      });

      return {
        output: `Successfully resized window containing tab ${effectiveTabId} to ${Math.floor(width)}x${Math.floor(height)} pixels`
      };
    } catch (err) {
      return {
        error: `Failed to resize window: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'resize_window',
    description:
      "Resize the current browser window to specified dimensions. Useful for testing responsive designs or setting up specific screen sizes. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
    input_schema: {
      type: 'object',
      properties: {
        width: { type: 'number', description: 'Target window width in pixels' },
        height: { type: 'number', description: 'Target window height in pixels' },
        tabId: {
          type: 'number',
          description:
            "Tab ID to get the window for. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
        }
      },
      required: ['width', 'height', 'tabId']
    }
  })
};
