import { PermissionTools, checkUrlSecurity } from '../domainPermissions';
import { tabGroupManager } from '../tabState';
import { cdpDebugger } from '../cdp';
import type { CdpRuntimeEvaluateResult } from '../cdp';
import {
  createPolicyCheckedChildTab,
  filterPolicyAllowedTabs,
  moveSearchNavigationToNewTab
} from '../navigationIsolation';
import type { NavigationPolicyContext } from '../navigationIsolation';
import { wrapUserCode } from '../pageToolsSupport/wrapUserCode';
import type { ToolDefinition, ToolResult } from '../pageToolsSupport/types';
import type { JavaScriptToolInput } from './types';

export const javascriptTool: ToolDefinition<JavaScriptToolInput> = {
  name: 'javascript_tool',
  description:
    "Execute JavaScript code in the context of the current page. The code runs in the page's context and can interact with the DOM, window object, and page variables. Returns the result of the last expression or any thrown errors. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
  tabAccess: 'write',
  parameters: {
    action: { type: 'string', description: "Must be set to 'javascript_exec'" },
    text: {
      type: 'string',
      description:
        "The JavaScript code to execute. The code will be evaluated in the page context. The result of the last expression will be returned automatically. Do NOT use 'return' statements - just write the expression you want to evaluate (e.g., 'window.myData.value' not 'return window.myData.value'). You can access and modify the DOM, call page functions, and interact with page variables."
    },
    tabId: {
      type: 'number',
      description:
        "Tab ID to execute the code in. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
    }
  },
  execute: async (input, context): Promise<ToolResult> => {
    try {
      const { action, text: code, tabId } = input;
      if ('javascript_exec' !== action)
        throw new Error("'javascript_exec' is the only supported action");
      if (!code) throw new Error('Code parameter is required');
      if (!context?.tabId) throw new Error('No active tab found');

      const effectiveTabId = await context.resolveTabId(tabId);
      const tabUrl = (await chrome.tabs.get(effectiveTabId)).url;
      if (!tabUrl) throw new Error('No URL available for active tab');

      const toolUseId = context?.toolUseId;
      const permissionResult = await context.permissionManager.checkPermission(tabUrl, toolUseId);
      if (!permissionResult.allowed) {
        if (permissionResult.needsPrompt) {
          return {
            type: 'permission_required',
            tool: PermissionTools.EXECUTE_JAVASCRIPT,
            url: tabUrl,
            toolUseId,
            actionData: { text: code }
          };
        }
        return { error: 'Permission denied for JavaScript execution on this domain' };
      }

      const securityCheck = await checkUrlSecurity(effectiveTabId, tabUrl, 'JavaScript execution');
      if (securityCheck) return securityCheck;

      const wrappedCode = wrapUserCode(code);
      const browserScope = context.browserSessionScope;
      const navigationPolicy: NavigationPolicyContext = {
        permissionManager: context.permissionManager,
        toolUseId,
        toolName: 'javascript_tool',
        sessionId: browserScope?.sessionId
      };
      tabGroupManager.rememberChildTabNavigationPolicy(effectiveTabId, navigationPolicy);

      cdpDebugger.clearWindowOpenEvents(effectiveTabId);
      try {
        await cdpDebugger.enablePageEvents(effectiveTabId);
      } catch {
        // Page.windowOpen capture is best effort; JavaScript execution still runs without it.
      }

      const evalResult = await tabGroupManager.withPreservedActiveTab(effectiveTabId, async () => {
        return await cdpDebugger.sendCommand<CdpRuntimeEvaluateResult>(
          effectiveTabId,
          'Runtime.evaluate',
          {
            expression: wrappedCode,
            returnByValue: true,
            awaitPromise: true,
            timeout: 10000
          }
        );
      });

      const openedTabIds = await filterPolicyAllowedTabs(
        await tabGroupManager.adoptChildTabsFromOpener(effectiveTabId, {
          sessionId: browserScope?.sessionId
        }),
        navigationPolicy
      );
      if (openedTabIds.length === 0) {
        const events = cdpDebugger.consumeWindowOpenEvents(effectiveTabId);
        const seenUrls = new Set<string>();
        for (const event of events) {
          try {
            const url = new URL(event.url, tabUrl);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
            if (seenUrls.has(url.href)) continue;
            seenUrls.add(url.href);
            const tabId = await createPolicyCheckedChildTab(
              effectiveTabId,
              url.href,
              navigationPolicy
            );
            if (typeof tabId === 'number') openedTabIds.push(tabId);
          } catch {
            // Ignore malformed or unsupported window.open targets.
          }
        }
      } else {
        cdpDebugger.consumeWindowOpenEvents(effectiveTabId);
      }
      const searchTabIds = await moveSearchNavigationToNewTab({
        openerTabId: effectiveTabId,
        previousUrl: tabUrl,
        timeoutMs: 2500,
        policy: navigationPolicy
      });
      for (const tabId of searchTabIds) {
        if (!openedTabIds.includes(tabId)) openedTabIds.push(tabId);
      }

      let output = '';
      let isError = false;
      let errorMessage = '';

      const sanitizeValue = (value: unknown, depth: number = 0): unknown => {
        if (depth > 5) return '[TRUNCATED: Max depth exceeded]';
        const sensitivePatterns = [
          /password/i,
          /token/i,
          /secret/i,
          /api[_-]?key/i,
          /auth/i,
          /credential/i,
          /private[_-]?key/i,
          /access[_-]?key/i,
          /bearer/i,
          /oauth/i,
          /session/i
        ];
        if ('string' === typeof value) {
          if (value.includes('=') && (value.includes(';') || value.includes('&')))
            return '[BLOCKED: Cookie/query string data]';
          if (value.match(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/))
            return '[BLOCKED: JWT token]';
          if (/^[A-Za-z0-9+/]{20,}={0,2}$/.test(value)) return '[BLOCKED: Base64 encoded data]';
          if (/^[a-f0-9]{32,}$/i.test(value)) return '[BLOCKED: Hex credential]';
          if (value.length > 1000) return value.substring(0, 1000) + '[TRUNCATED]';
        }
        if (value && 'object' === typeof value && !Array.isArray(value)) {
          const sanitized: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(value)) {
            const isSensitive = sensitivePatterns.some((p) => p.test(key));
            sanitized[key] = isSensitive
              ? '[BLOCKED: Sensitive key]'
              : 'cookie' === key || 'cookies' === key
                ? '[BLOCKED: Cookie access]'
                : sanitizeValue(val, depth + 1);
          }
          return sanitized;
        }
        if (Array.isArray(value)) {
          const result = value.slice(0, 100).map((v) => sanitizeValue(v, depth + 1));
          if (value.length > 100) result.push(`[TRUNCATED: ${value.length - 100} more items]`);
          return result;
        }
        return value;
      };

      const maxOutputSize = 51200;

      if (evalResult.exceptionDetails) {
        isError = true;
        const exception = evalResult.exceptionDetails.exception;
        const isTimeout = exception?.description?.includes('execution was terminated');
        const exceptionValue = typeof exception?.value === 'string' ? exception.value : undefined;
        errorMessage = isTimeout
          ? 'Execution timeout: Code exceeded 10-second limit'
          : exception?.description || exceptionValue || 'Unknown error';
      } else if (evalResult.result) {
        const result = evalResult.result;
        if ('undefined' === result.type) {
          output = 'undefined';
        } else if ('object' === result.type && 'null' === result.subtype) {
          output = 'null';
        } else if ('function' === result.type) {
          output = result.description || '[Function]';
        } else if ('object' === result.type) {
          if ('node' === result.subtype) {
            output = result.description || '[DOM Node]';
          } else if ('array' === result.subtype) {
            output = result.description || '[Array]';
          } else {
            const sanitized = sanitizeValue(result.value || {});
            output = result.description || JSON.stringify(sanitized, null, 2);
          }
        } else if (void 0 !== result.value) {
          const sanitized = sanitizeValue(result.value);
          output = 'string' === typeof sanitized ? sanitized : JSON.stringify(sanitized, null, 2);
        } else {
          output = result.description || String(result.value);
        }
      } else {
        output = 'undefined';
      }

      if (isError) {
        const validTabs = await tabGroupManager.getValidTabsWithMetadataForContext(
          context.tabId,
          context
        );
        return {
          error: `JavaScript execution error: ${errorMessage}`,
          tabContext: {
            currentTabId: context.tabId,
            executedOnTabId: effectiveTabId,
            availableTabs: validTabs,
            tabCount: validTabs.length
          }
        };
      }

      if (openedTabIds.length > 0) {
        const suffix = `Opened new tab${openedTabIds.length === 1 ? '' : 's'} in current group: ${openedTabIds.join(', ')}`;
        output = output ? `${output}\n${suffix}` : suffix;
      }

      if (output.length > maxOutputSize) {
        output = output.substring(0, maxOutputSize) + '\n[OUTPUT TRUNCATED: Exceeded 50KB limit]';
      }

      const validTabs = await tabGroupManager.getValidTabsWithMetadataForContext(
        context.tabId,
        context
      );
      const executedOnTabId =
        openedTabIds.length > 0 ? openedTabIds[openedTabIds.length - 1] : effectiveTabId;
      return {
        output,
        tabContext: {
          currentTabId: context.tabId,
          executedOnTabId,
          availableTabs: validTabs,
          tabCount: validTabs.length
        }
      };
    } catch (err) {
      return {
        error: `Failed to execute JavaScript: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'javascript_tool',
    description:
      "Execute JavaScript code in the context of the current page. The code runs in the page's context and can interact with the DOM, window object, and page variables. Returns the result of the last expression or any thrown errors. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: "Must be set to 'javascript_exec'" },
        text: {
          type: 'string',
          description:
            "The JavaScript code to execute. The code will be evaluated in the page context. The result of the last expression will be returned automatically. Do NOT use 'return' statements - just write the expression you want to evaluate (e.g., 'window.myData.value' not 'return window.myData.value'). You can access and modify the DOM, call page functions, and interact with page variables."
        },
        tabId: {
          type: 'number',
          description:
            "Tab ID to execute the code in. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
        }
      },
      required: ['action', 'text', 'tabId']
    }
  })
};
