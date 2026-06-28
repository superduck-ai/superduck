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
import {
  recordEvent,
  recordError,
  recordArtifact,
  redactCode,
  redactUrl,
  type DebugArtifactRef
} from '../../debug';

export const javascriptTool: ToolDefinition<JavaScriptToolInput> = {
  name: 'javascript_tool',
  description:
    "Execute JavaScript code in the context of the current page. The code runs in the page's context and can interact with the DOM, window object, and page variables. Returns the result of the last expression or any thrown errors. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
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
    const toolUseId = context?.toolUseId;
    const tabIdForIds = context?.tabId;
    const startTime = Date.now();
    const code = input?.text;
    const codeRedaction = code ? redactCode(code) : undefined;

    recordEvent({
      domain: 'javascript',
      event: 'javascript.exec.start',
      ids: { toolUseId, tabId: tabIdForIds },
      data: {
        codeHash: codeRedaction?.hash,
        codePreview: codeRedaction?.preview,
        codeLength: codeRedaction?.length
      }
    });

    const exec = await executeJavascript(input, context, codeRedaction).catch((err: unknown) => {
      recordError(
        'javascript',
        'javascript.exec.end',
        err,
        { toolUseId, tabId: tabIdForIds },
        { resultType: 'exception', durationMs: Date.now() - startTime }
      );
      throw err;
    });
    const result = exec.result;
    const jsArtifactRef = exec.artifactRef;

    const resultType: string = result.error
      ? 'is_error'
      : result.type === 'permission_required'
        ? 'permission_required'
        : 'success';
    recordEvent({
      domain: 'javascript',
      event: 'javascript.exec.end',
      ids: { toolUseId, tabId: tabIdForIds },
      data: { resultType, durationMs: Date.now() - startTime },
      artifactRefs: jsArtifactRef ? [jsArtifactRef] : undefined
    });
    return result;
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

async function executeJavascript(
  input: JavaScriptToolInput,
  context: Parameters<ToolDefinition<JavaScriptToolInput>['execute']>[1],
  _codeRedaction: ReturnType<typeof redactCode> | undefined
): Promise<{ result: ToolResult; artifactRef: DebugArtifactRef | null }> {
  try {
    const { action, text: code, tabId } = input;
    if ('javascript_exec' !== action)
      throw new Error("'javascript_exec' is the only supported action");
    if (!code) throw new Error('Code parameter is required');
    if (!context?.tabId) throw new Error('No active tab found');

    const effectiveTabId = await tabGroupManager.getEffectiveTabId(tabId, context.tabId);
    const tabUrl = (await chrome.tabs.get(effectiveTabId)).url;
    if (!tabUrl) throw new Error('No URL available for active tab');

    const toolUseId = context?.toolUseId;
    const urlOrigin = redactUrl(tabUrl);

    const permissionResult = await context.permissionManager.checkPermission(tabUrl, toolUseId);
    recordEvent({
      domain: 'javascript',
      event: 'javascript.permission.check',
      ids: { toolUseId, tabId: effectiveTabId },
      data: {
        allowed: permissionResult.allowed,
        needsPrompt: permissionResult.needsPrompt,
        urlOrigin
      }
    });
    if (!permissionResult.allowed) {
      if (permissionResult.needsPrompt) {
        return {
          result: {
            type: 'permission_required',
            tool: PermissionTools.EXECUTE_JAVASCRIPT,
            url: tabUrl,
            toolUseId,
            actionData: { text: code }
          },
          artifactRef: null
        };
      }
      return {
        result: { error: 'Permission denied for JavaScript execution on this domain' },
        artifactRef: null
      };
    }

    const securityCheck = await checkUrlSecurity(effectiveTabId, tabUrl, 'JavaScript execution');
    recordEvent({
      domain: 'javascript',
      event: 'javascript.security.check',
      ids: { toolUseId, tabId: effectiveTabId },
      data: { passed: !securityCheck, urlOrigin }
    });
    if (securityCheck) return { result: securityCheck, artifactRef: null };

    const wrappedCode = wrapUserCode(code);
    const navigationPolicy: NavigationPolicyContext = {
      permissionManager: context.permissionManager,
      toolUseId,
      toolName: 'javascript_tool'
    };
    tabGroupManager.rememberChildTabNavigationPolicy(effectiveTabId, navigationPolicy);

    cdpDebugger.clearWindowOpenEvents(effectiveTabId);
    try {
      await cdpDebugger.enablePageEvents(effectiveTabId);
    } catch {
      // Page.windowOpen capture is best effort; JavaScript execution still runs without it.
    }

    recordEvent({
      domain: 'javascript',
      event: 'javascript.runtime.evaluate.start',
      ids: { toolUseId, tabId: effectiveTabId },
      data: { urlOrigin }
    });
    const evaluateStart = Date.now();
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
    recordEvent({
      domain: 'javascript',
      event: 'javascript.runtime.evaluate.end',
      ids: { toolUseId, tabId: effectiveTabId },
      data: {
        durationMs: Date.now() - evaluateStart,
        hasException: !!evalResult.exceptionDetails,
        resultType: evalResult.result?.type,
        resultSubtype: evalResult.result?.subtype
      }
    });

    const openedTabIds = await filterPolicyAllowedTabs(
      await tabGroupManager.adoptChildTabsFromOpener(effectiveTabId),
      navigationPolicy
    );
    if (openedTabIds.length === 0) {
      const events = cdpDebugger.consumeWindowOpenEvents(effectiveTabId);
      if (events.length > 0) {
        recordEvent({
          domain: 'javascript',
          event: 'javascript.window_open.detected',
          ids: { toolUseId, tabId: effectiveTabId },
          data: {
            windowOpenCount: events.length,
            targetUrls: events.map((e) => redactUrl(e.url)),
            adoptedTabIds: []
          }
        });
      }
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
      recordEvent({
        domain: 'javascript',
        event: 'javascript.child_tab.adopted',
        ids: { toolUseId, tabId: effectiveTabId },
        data: { adoptedTabIds: openedTabIds }
      });
    }
    const searchTabIds = await moveSearchNavigationToNewTab({
      openerTabId: effectiveTabId,
      previousUrl: tabUrl,
      timeoutMs: 2500,
      policy: navigationPolicy
    });
    if (searchTabIds.length > 0) {
      recordEvent({
        domain: 'javascript',
        event: 'javascript.search_navigation.moved',
        ids: { toolUseId, tabId: effectiveTabId },
        data: { searchTabIds }
      });
    }
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
    let outputTruncated = false;

    if (evalResult.exceptionDetails) {
      isError = true;
      const exception = evalResult.exceptionDetails.exception;
      const isTimeout = exception?.description?.includes('execution was terminated');
      const exceptionValue = typeof exception?.value === 'string' ? exception.value : undefined;
      errorMessage = isTimeout
        ? 'Execution timeout: Code exceeded 10-second limit'
        : exception?.description || exceptionValue || 'Unknown error';
      recordEvent({
        domain: 'javascript',
        event: 'javascript.runtime.exception',
        ids: { toolUseId, tabId: effectiveTabId },
        level: 'error',
        data: {
          exceptionSummary: errorMessage.slice(0, 500),
          sourceUrl: evalResult.exceptionDetails.url
            ? redactUrl(evalResult.exceptionDetails.url)
            : undefined,
          lineNumber: evalResult.exceptionDetails.lineNumber,
          columnNumber: evalResult.exceptionDetails.columnNumber,
          isTimeout
        }
      });
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
      const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);
      const ref = await recordArtifact({
        type: 'js-result',
        ids: { toolUseId, tabId: effectiveTabId },
        mimeType: 'application/json',
        data: {
          outputLength: 0,
          outputTruncated: false,
          openedTabIds: [],
          exceptionSummary: errorMessage,
          urlOrigin
        }
      });
      return {
        result: {
          error: `JavaScript execution error: ${errorMessage}`,
          tabContext: {
            currentTabId: context.tabId,
            executedOnTabId: effectiveTabId,
            availableTabs: validTabs,
            tabCount: validTabs.length
          }
        },
        artifactRef: ref
      };
    }

    if (openedTabIds.length > 0) {
      const suffix = `Opened new tab${openedTabIds.length === 1 ? '' : 's'} in current group: ${openedTabIds.join(', ')}`;
      output = output ? `${output}\n${suffix}` : suffix;
    }

    if (output.length > maxOutputSize) {
      output = output.substring(0, maxOutputSize) + '\n[OUTPUT TRUNCATED: Exceeded 50KB limit]';
      outputTruncated = true;
      recordEvent({
        domain: 'javascript',
        event: 'javascript.output.truncated',
        ids: { toolUseId, tabId: effectiveTabId },
        data: { maxOutputSize }
      });
    }

    const ref = await recordArtifact({
      type: 'js-result',
      ids: { toolUseId, tabId: effectiveTabId },
      mimeType: 'application/json',
      content: { output, openedTabIds, exceptionSummary: isError ? errorMessage : undefined },
      data: {
        outputLength: output.length,
        outputTruncated,
        openedTabIds,
        exceptionSummary: isError ? errorMessage : undefined,
        urlOrigin
      }
    });

    const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);
    const executedOnTabId =
      openedTabIds.length > 0 ? openedTabIds[openedTabIds.length - 1] : effectiveTabId;
    return {
      result: {
        output,
        tabContext: {
          currentTabId: context.tabId,
          executedOnTabId,
          availableTabs: validTabs,
          tabCount: validTabs.length
        }
      },
      artifactRef: ref
    };
  } catch (err) {
    return {
      result: {
        error: `Failed to execute JavaScript: ${err instanceof Error ? err.message : 'Unknown error'}`
      },
      artifactRef: null
    };
  }
}
