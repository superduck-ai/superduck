import { PermissionTools } from '../domainPermissions';
import { tabGroupManager } from '../tabState';
import { cdpDebugger } from '../cdp';
import type { ConsoleMessage } from '../cdp';
import type { ToolDefinition, ToolResult } from '../pageToolsSupport/types';
import type { ReadConsoleMessagesToolInput } from './types';

export const readConsoleMessagesTool: ToolDefinition<ReadConsoleMessagesToolInput> = {
  name: 'read_console_messages',
  description:
    "Read browser console messages (console.log, console.error, console.warn, etc.) from a specific tab. Useful for debugging JavaScript errors, viewing application logs, or understanding what's happening in the browser console. Returns console messages from the current domain only. If you don't have a valid tab ID, use tabs_context first to get available tabs. IMPORTANT: Always provide a pattern to filter messages - without a pattern, you may get too many irrelevant messages.",
  tabAccess: 'read',
  parameters: {
    tabId: {
      type: 'number',
      description:
        "Tab ID to read console messages from. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID.",
      required: true
    },
    onlyErrors: {
      type: 'boolean',
      description:
        'If true, only return error and exception messages. Default is false (return all message types).',
      required: false
    },
    clear: {
      type: 'boolean',
      description:
        'If true, clear the console messages after reading to avoid duplicates on subsequent calls. Default is false.',
      required: false
    },
    pattern: {
      type: 'string',
      description:
        "Regex pattern to filter console messages. Only messages matching this pattern will be returned (e.g., 'error|warning' to find errors and warnings, 'MyApp' to filter app-specific logs). You should always provide a pattern to avoid getting too many irrelevant messages.",
      required: false
    }
  },
  execute: async (input, context): Promise<ToolResult> => {
    try {
      const { tabId, onlyErrors = false, clear = false, pattern, limit = 100 } = input;
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
            tool: PermissionTools.READ_CONSOLE_MESSAGES,
            url: tabUrl,
            toolUseId
          };
        }
        return { error: 'Permission denied for reading console messages on this domain' };
      }

      try {
        await cdpDebugger.enableConsoleTracking(trackedTabId);
      } catch (err) {
        // Tracking enable failed — surface the error so the model knows
        // "no messages" is because tracking couldn't start, not because
        // the page is silent. Per Addy Osmani: "failures are verbose."
        return {
          error: `Could not enable console tracking: ${err instanceof Error ? err.message : String(err)}. Try refreshing the page and calling this tool again.`
        };
      }

      const messages = cdpDebugger.getConsoleMessages(trackedTabId, onlyErrors, pattern);
      if (clear) cdpDebugger.clearConsoleMessages(trackedTabId);

      if (0 === messages.length) {
        const validTabs = await tabGroupManager.getValidTabsWithMetadataForContext(
          context.tabId,
          context
        );
        return {
          output: `No console ${onlyErrors ? 'errors or exceptions' : 'messages'} found for this tab.\n\nNote: Console tracking starts when this tool is first called. If the page loaded before calling this tool, you may need to refresh the page to capture console messages from page load.`,
          tabContext: {
            currentTabId: context.tabId,
            executedOnTabId: effectiveTabId,
            availableTabs: validTabs,
            tabCount: validTabs.length
          }
        };
      }

      const limitedMessages = messages.slice(0, limit);
      const hasMore = messages.length > limit;

      const formatted = limitedMessages
        .map((msg: ConsoleMessage, idx: number) => {
          const time = new Date(msg.timestamp).toLocaleTimeString();
          const location =
            msg.url && void 0 !== msg.lineNumber
              ? ` (${msg.url}:${msg.lineNumber}${void 0 !== msg.columnNumber ? `:${msg.columnNumber}` : ''})`
              : '';
          let line = `[${idx + 1}] [${time}] [${msg.type.toUpperCase()}]${location}\n${msg.text}`;
          if (msg.stackTrace) line += `\nStack trace:\n${msg.stackTrace}`;
          return line;
        })
        .join('\n\n');

      const msgType = onlyErrors ? 'error/exception messages' : 'console messages';
      const truncationNote = hasMore ? ` (showing first ${limit} of ${messages.length})` : '';
      const header = `Found ${messages.length} ${msgType}${truncationNote}:`;
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
        error: `Failed to read console messages: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'read_console_messages',
    description:
      "Read browser console messages (console.log, console.error, console.warn, etc.) from a specific tab. Useful for debugging JavaScript errors, viewing application logs, or understanding what's happening in the browser console. Returns console messages from the current domain only. If you don't have a valid tab ID, use tabs_context first to get available tabs. IMPORTANT: Always provide a pattern to filter messages - without a pattern, you may get too many irrelevant messages.",
    input_schema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description:
            "Tab ID to read console messages from. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
        },
        onlyErrors: {
          type: 'boolean',
          description:
            'If true, only return error and exception messages. Default is false (return all message types).'
        },
        clear: {
          type: 'boolean',
          description:
            'If true, clear the console messages after reading to avoid duplicates on subsequent calls. Default is false.'
        },
        pattern: {
          type: 'string',
          description:
            "Regex pattern to filter console messages. Only messages matching this pattern will be returned (e.g., 'error|warning' to find errors and warnings, 'MyApp' to filter app-specific logs). You should always provide a pattern to avoid getting too many irrelevant messages."
        },
        limit: {
          type: 'number',
          description:
            'Maximum number of messages to return. Defaults to 100. Increase only if you need more results.'
        }
      },
      required: ['tabId']
    }
  })
};
