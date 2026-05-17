import { PermissionTools, checkUrlSecurity } from './shared';
import { domainCategoryCache, tabGroupManager } from './tabState';
import { cdpDebugger } from './cdp';
import {
  takeSnapshotUnlocked,
  SnapshotMaxCharsError,
  normalizeSnapshotForDiff,
  withSnapshotLock,
} from './axSnapshot';
import { registerRefsInPage, pruneStaleRefs } from './refBridge';
import type { CdpRuntimeEvaluateResult, ConsoleMessage, NetworkRequest } from './cdpTypes';
import {
  coerceToolInputTypes,
  filterAndApproveDomains,
  filterDomainsByCategory,
  formatTabsContext,
  getPlanModeSystemReminder,
  parseArrayInput,
  shouldShowPlanMode,
  toolsToProviderSchema
} from './pageToolsSupport/helpers';
import {
  DIFF_NO_BASELINE_PREFIX,
  DIFF_NO_CHANGES,
  formatCompactDiff,
  snapshotCacheGet,
  snapshotCacheSet,
  snapshotVariantKey,
  type SnapshotVariant
} from './pageToolsSupport/snapshotCache';
import type {
  ToolContext,
  ToolDefinition,
  ToolResult,
  ToolSchemaProperty,
  ToolTabSummary
} from './pageToolsSupport/types';

interface JavaScriptToolInput {
  action: string;
  text: string;
  tabId?: number;
}

interface NavigateToolInput {
  url: string;
  tabId?: number;
}

interface InitialContextData {
  availableTabs?: ToolTabSummary[];
  domainSkills?: unknown[];
  initialTabId?: number;
}

interface FindToolInput {
  query: string;
  tabId?: number;
}

interface GetPageTextToolInput {
  tabId?: number;
  max_chars?: number;
}

interface ReadPageToolInput {
  filter?: 'interactive' | 'all';
  tabId?: number;
  depth?: number;
  ref_id?: string;
  max_chars?: number;
  selector?: string;
  diff?: boolean;
  urls?: boolean;
}

interface ResizeWindowToolInput {
  width?: number;
  height?: number;
  tabId?: number;
}

interface UpdatePlanToolInput {
  domains: string[];
  approach: string[];
}

interface ReadConsoleMessagesToolInput {
  tabId?: number;
  onlyErrors?: boolean;
  clear?: boolean;
  pattern?: string;
  limit?: number;
}

interface ReadNetworkRequestsToolInput {
  tabId?: number;
  urlPattern?: string;
  clear?: boolean;
  limit?: number;
}

type EmptyToolInput = Record<string, never>;

interface MainTextScriptResult {
  text: string;
  source: string;
  title: string;
  url: string;
  error?: string;
}

interface ViewportDimensions {
  width: number;
  height: number;
}

interface ReadPageScriptResult {
  pageContent: string;
  viewport: ViewportDimensions;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getScriptErrorMessage(error: unknown): string {
  return isRecord(error) && typeof error.message === 'string' ? error.message : 'Unknown error';
}

function isViewportDimensions(value: unknown): value is ViewportDimensions {
  return isRecord(value) && typeof value.width === 'number' && typeof value.height === 'number';
}

function isMainTextScriptResult(value: unknown): value is MainTextScriptResult {
  return (
    isRecord(value) &&
    typeof value.text === 'string' &&
    typeof value.source === 'string' &&
    typeof value.title === 'string' &&
    typeof value.url === 'string' &&
    (value.error === undefined || typeof value.error === 'string')
  );
}

function isReadPageScriptResult(value: unknown): value is ReadPageScriptResult {
  return (
    isRecord(value) &&
    typeof value.pageContent === 'string' &&
    isViewportDimensions(value.viewport) &&
    (value.error === undefined || typeof value.error === 'string')
  );
}

// read_page snapshot diff cache: per-(session, tab) baseline for diff:true.
// 必须按 sessionId 隔离 — 否则两个 sidepanel/agent 共用同一 tab 时会互相污染
// baseline，让 diff 退化成"相对别人上次 read_page 的变化"，且 diff 里的 ref
// 也可能是别的会话注册过的、本会话已 prune 的 stale ref。
// SPA route changes don't fire onUpdated.url, so diff also re-checks cache.url
// against current tab.url and treats a mismatch as no baseline.
// variantKey 把会改变快照形态的参数（filter/depth/maxChars/urls）打进 key，
// 防止"先 interactive 再 diff:true"读到不同形态当同基线，产生大量伪 diff。
const javascriptTool: ToolDefinition<JavaScriptToolInput> = {
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

      const wrappedCode = `
        (function() {
          'use strict';
          try {
            return eval(${JSON.stringify(code)});
          } catch (e) {
            throw e;
          }
        })()
      `;

      const evalResult = await cdpDebugger.sendCommand<CdpRuntimeEvaluateResult>(
        effectiveTabId,
        'Runtime.evaluate',
        {
          expression: wrappedCode,
          returnByValue: true,
          awaitPromise: true,
          timeout: 10000
        }
      );

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

      const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);
      if (isError) {
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

      if (output.length > maxOutputSize) {
        output = output.substring(0, maxOutputSize) + '\n[OUTPUT TRUNCATED: Exceeded 50KB limit]';
      }

      return {
        output,
        tabContext: {
          currentTabId: context.tabId,
          executedOnTabId: effectiveTabId,
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

// =============================================================================
// Tool: navigate (ae)
// =============================================================================

const navigateTool: ToolDefinition<NavigateToolInput> = {
  name: 'navigate',
  description:
    "Navigate to a URL in an existing tab, or go forward/back in browser history. PREFERRED: Always use this tool to navigate to URLs instead of creating new tabs. This keeps all operations in the current tab. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
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
    }
  },
  execute: async (input, context): Promise<ToolResult> => {
    try {
      const { url, tabId } = input;
      if (!url) throw new Error('URL parameter is required');
      if (!context?.tabId) throw new Error('No active tab found');

      const effectiveTabId = await tabGroupManager.getEffectiveTabId(tabId, context.tabId);

      // Check domain category for non-history navigation
      if (url && !['back', 'forward'].includes(url.toLowerCase())) {
        try {
          const category = await domainCategoryCache.getCategory(url);
          if (
            category &&
            ('category1' === category ||
              'category2' === category ||
              'category_org_blocked' === category)
          ) {
            return {
              error:
                'category_org_blocked' === category
                  ? "This site is blocked by your organization's policy."
                  : 'This site is not allowed due to safety restrictions.'
            };
          }
        } catch {
          // ignore category check errors
        }
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

      let normalizedUrl: string = url;
      if (!normalizedUrl.match(/^https?:\/\//)) {
        normalizedUrl = `https://${normalizedUrl}`;
      }

      try {
        new URL(normalizedUrl);
      } catch {
        throw new Error(`Invalid URL: ${url}`);
      }

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
      "Navigate to a URL in an existing tab, or go forward/back in browser history. PREFERRED: Always use this tool to navigate to URLs instead of creating new tabs. This keeps all operations in the current tab. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
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
        }
      },
      required: ['url', 'tabId']
    }
  })
};

// =============================================================================
// Helper Functions (se, ce, ue, le, de, he, pe, fe, me, ge, be, we, ye, ve, Ie, _e)
// =============================================================================

function normalizeDomainHelper(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function extractDomainHelper(url: string): string {
  try {
    return normalizeDomainHelper(new URL(url).hostname);
  } catch {
    return '';
  }
}

const appDetectionRules: Array<{ domain: string; pathPrefix: string; app: string }> = [
  { domain: 'docs.google.com', pathPrefix: '/document/', app: 'google_docs' },
  { domain: 'docs.google.com', pathPrefix: '/spreadsheets/', app: 'google_sheets' },
  { domain: 'docs.google.com', pathPrefix: '/presentation/', app: 'google_slides' }
];

function detectApp(url: string): string | undefined {
  try {
    const parsedUrl = new URL(url);
    const hostname = normalizeDomainHelper(parsedUrl.hostname);
    const pathname = parsedUrl.pathname;
    for (const rule of appDetectionRules) {
      if (hostname === rule.domain && pathname.startsWith(rule.pathPrefix)) return rule.app;
    }
  } catch {
    // ignore
  }
}

function formatInitialContext(contextData: InitialContextData): string {
  const result: Record<string, unknown> = {};
  if (contextData.availableTabs) {
    result.availableTabs = contextData.availableTabs.map((tab) => ({
      tabId: tab.id,
      title: tab.title,
      url: tab.url
    }));
  }
  if (contextData.domainSkills && contextData.domainSkills.length > 0) {
    result.domainSkills = contextData.domainSkills;
  }
  if (void 0 !== contextData.initialTabId) {
    result.initialTabId = contextData.initialTabId;
  }
  return JSON.stringify(result);
}

function stripSystemReminders(text: string): string {
  return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '').trim();
}

function textMatchFallback(
  treeContent: string,
  query: string
): ToolResult {
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (queryTerms.length === 0) return { error: 'Query is empty' };

  const lines = treeContent.split('\n');
  const scored: Array<{ line: string; ref: string; score: number }> = [];

  for (const line of lines) {
    const refMatch = line.match(/ref=(ref_\d+)/);
    if (!refMatch) continue;
    const lower = line.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      if (lower.includes(term)) score++;
    }
    if (score > 0) {
      scored.push({ line: line.trim(), ref: refMatch[1], score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 20);

  if (top.length === 0) {
    return { error: `No matching elements found for "${query}"` };
  }

  const resultLines = top.map(
    (m) => `- ${m.ref}: ${m.line.replace(/\[ref=ref_\d+\]/, '').trim()}`
  );
  return {
    output: `Found ${scored.length} matching element${scored.length === 1 ? '' : 's'} (showing ${top.length}):\n\n${resultLines.join('\n')}`
  };
}

const findTool: ToolDefinition<FindToolInput> = {
  name: 'find',
  description:
    'Find elements on the page using natural language. Can search for elements by their purpose (e.g., "search bar", "login button") or by text content (e.g., "organic mango product"). Returns up to 20 matching elements with references that can be used with other tools. If more than 20 matches exist, you\'ll be notified to use a more specific query. If you don\'t have a valid tab ID, use tabs_context first to get available tabs.',
  parameters: {
    query: {
      type: 'string',
      description:
        'Natural language description of what to find (e.g., "search bar", "add to cart button", "product title containing organic")',
      required: true
    },
    tabId: {
      type: 'number',
      description:
        "Tab ID to search in. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
    }
  },
  execute: async (input, context): Promise<ToolResult> => {
    try {
      const { query, tabId } = input;
      if (!query) throw new Error('Query parameter is required');
      if (!context?.tabId) throw new Error('No active tab found');

      const effectiveTabId = await tabGroupManager.getEffectiveTabId(tabId, context.tabId);
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
            tool: PermissionTools.READ_PAGE_CONTENT,
            url: tabUrl,
            toolUseId
          };
        }
        return { error: 'Permission denied for reading pages on this domain' };
      }

      const treeResult = await chrome.scripting.executeScript({
        target: { tabId: trackedTabId },
        func: () => {
          const pageWindow = window as Window & {
            __generateAccessibilityTree?: (filterArg?: string | null) => unknown;
          };
          if ('function' !== typeof pageWindow.__generateAccessibilityTree)
            throw new Error('Accessibility tree function not found. Please refresh the page.');
          return pageWindow.__generateAccessibilityTree('all');
        },
        args: []
      });

      if (!treeResult || 0 === treeResult.length)
        throw new Error('No results returned from page script');
      if ('error' in treeResult[0] && treeResult[0].error)
        throw new Error(`Script execution failed: ${getScriptErrorMessage(treeResult[0].error)}`);
      if (!treeResult[0].result) throw new Error('Page script returned empty result');

      const pageData = treeResult[0].result;
      const createApiMessage = context?.createApiMessage;
      if (!createApiMessage) {
        // 文本匹配兜底：无 sub-model 时用简单字符串匹配
        return textMatchFallback(pageData.pageContent, query);
      }

      pageData.pageContent.length; // side effect from original

      const apiResponse = await createApiMessage(
        {
          maxTokens: 800,
          modelClass: 'small_fast',
          messages: [
            {
              role: 'user',
              content: `You are helping find elements on a web page. The user wants to find: "${query}"\n\nHere is the accessibility tree of the page:\n${pageData.pageContent}\n\nFind ALL elements that match the user's query. Return up to 20 most relevant matches, ordered by relevance.\n\nReturn your findings in this exact format (one line per matching element):\n\nFOUND: <total_number_of_matching_elements>\nSHOWING: <number_shown_up_to_20>\n---\nref_X | role | name | type | reason why this matches\nref_Y | role | name | type | reason why this matches\n...\n\nIf there are more than 20 matches, add this line at the end:\nMORE: Use a more specific query to see additional results\n\nIf no matching elements are found, return only:\nFOUND: 0\nERROR: explanation of why no elements were found`
            }
          ]
        },
        'sampling_find_tool'
      );

      apiResponse.content; // side effect
      const firstBlock = apiResponse.content[0];
      if ('text' !== firstBlock.type) throw new Error('Unexpected response type from API');

      const lines = firstBlock.text
        .trim()
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line);

      let totalFound = 0;
      const matches: Array<{
        ref: string;
        role: string;
        name: string;
        type?: string;
        description?: string;
      }> = [];
      let errorMsg: string | undefined;
      let hasMore = false;

      for (const line of lines) {
        if (line.startsWith('FOUND:')) {
          totalFound = parseInt(line.split(':')[1].trim()) || 0;
        } else if (line.startsWith('SHOWING:')) {
          // skip
        } else if (line.startsWith('ERROR:')) {
          errorMsg = line.substring(6).trim();
        } else if (line.startsWith('MORE:')) {
          hasMore = true;
        } else if (line.includes('|') && line.startsWith('ref_')) {
          const parts = line.split('|').map((p: string) => p.trim());
          if (parts.length >= 4) {
            matches.push({
              ref: parts[0],
              role: parts[1],
              name: parts[2],
              type: parts[3] || void 0,
              description: parts[4] || void 0
            });
          }
        }
      }

      if (0 === totalFound || 0 === matches.length) {
        return { error: errorMsg || 'No matching elements found' };
      }

      let summary = `Found ${totalFound} matching element${1 === totalFound ? '' : 's'}`;
      if (hasMore) {
        summary += ` (showing first ${matches.length}, use a more specific query to narrow results)`;
      }

      const formattedMatches = matches
        .map(
          (m) =>
            `- ${m.ref}: ${m.role}${m.name ? ` "${m.name}"` : ''}${m.type ? ` (${m.type})` : ''}${m.description ? ` - ${m.description}` : ''}`
        )
        .join('\n');

      matches.length; // side effect
      const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);
      return {
        output: `${summary}\n\n${formattedMatches}`,
        tabContext: {
          currentTabId: context.tabId,
          executedOnTabId: effectiveTabId,
          availableTabs: validTabs,
          tabCount: validTabs.length
        }
      };
    } catch (err) {
      return {
        error: `Failed to find element: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'find',
    description:
      'Find elements on the page using natural language. Can search for elements by their purpose (e.g., "search bar", "login button") or by text content (e.g., "organic mango product"). Returns up to 20 matching elements with references that can be used with other tools. If more than 20 matches exist, you\'ll be notified to use a more specific query. If you don\'t have a valid tab ID, use tabs_context first to get available tabs.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Natural language description of what to find (e.g., "search bar", "add to cart button", "product title containing organic")'
        },
        tabId: {
          type: 'number',
          description:
            "Tab ID to search in. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
        }
      },
      required: ['query', 'tabId']
    }
  })
};

// =============================================================================
// Tool: get_page_text (xe)
// =============================================================================

const getPageTextTool: ToolDefinition<GetPageTextToolInput> = {
  name: 'get_page_text',
  description:
    "Extract raw text content from the page, prioritizing article content. Ideal for reading articles, blog posts, or other text-heavy pages. Returns plain text without HTML formatting. If you don't have a valid tab ID, use tabs_context first to get available tabs. Output is limited to 50000 characters by default.",
  parameters: {
    tabId: {
      type: 'number',
      description:
        "Tab ID to extract text from. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
    },
    max_chars: {
      type: 'number',
      description:
        'Maximum characters for output (default: 50000). Set to a higher value if your client can handle large outputs.'
    }
  },
  execute: async (input, context): Promise<ToolResult> => {
    const { tabId, max_chars: maxChars } = input || {};
    if (!context?.tabId) throw new Error('No active tab found');

    const effectiveTabId = await tabGroupManager.getEffectiveTabId(tabId, context.tabId);
    const tabUrl = (await chrome.tabs.get(effectiveTabId)).url;
    if (!tabUrl) throw new Error('No URL available for active tab');

    const toolUseId = context?.toolUseId;
    const permissionResult = await context.permissionManager.checkPermission(tabUrl, toolUseId);
    if (!permissionResult.allowed) {
      if (permissionResult.needsPrompt) {
        return {
          type: 'permission_required',
          tool: PermissionTools.READ_PAGE_CONTENT,
          url: tabUrl,
          toolUseId
        };
      }
      return { error: 'Permission denied for reading page content on this domain' };
    }

    await tabGroupManager.hideIndicatorForToolUse(effectiveTabId);

    try {
      const scriptResult = await chrome.scripting.executeScript({
        target: { tabId: effectiveTabId },
        func: (charLimit: number) => {
          const selectors = [
            'article',
            'main',
            '[class*="articleBody"]',
            '[class*="article-body"]',
            '[class*="post-content"]',
            '[class*="entry-content"]',
            '[class*="content-body"]',
            '[role="main"]',
            '.content',
            '#content'
          ];
          let contentElement: Element | null = null;
          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              let best = elements[0];
              let bestLength = 0;
              elements.forEach((el) => {
                const len = el.textContent?.length || 0;
                if (len > bestLength) {
                  bestLength = len;
                  best = el;
                }
              });
              contentElement = best;
              break;
            }
          }
          if (!contentElement) {
            if ((document.body.textContent || '').length > charLimit) {
              return {
                text: '',
                source: 'none',
                title: document.title,
                url: window.location.href,
                error:
                  'No semantic content element found and page body is too large (likely contains CSS/scripts). Try using read_page_content (screenshot) instead.'
              };
            }
            contentElement = document.body;
          }
          const text = (contentElement.textContent || '')
            .replace(/\s+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          if (!text || text.length < 10) {
            return {
              text: '',
              source: 'none',
              title: document.title,
              url: window.location.href,
              error:
                'No text content found. Page may contain only images, videos, or canvas-based content.'
            };
          }
          if (text.length > charLimit) {
            return {
              text: '',
              source: contentElement.tagName.toLowerCase(),
              title: document.title,
              url: window.location.href,
              error:
                'Output exceeds ' +
                charLimit +
                ' character limit (' +
                text.length +
                ' characters). Try using read_page with a specific ref_id to focus on a smaller section, or increase max_chars if your client can handle larger outputs.'
            };
          }
          return {
            text,
            source: contentElement.tagName.toLowerCase(),
            title: document.title,
            url: window.location.href
          };
        },
        args: [maxChars ?? 50000]
      });

      if (!scriptResult || 0 === scriptResult.length)
        throw new Error(
          'No main text content found. The content might be visual content only, or rendered in a canvas element.'
        );
      if ('error' in scriptResult[0] && scriptResult[0].error)
        throw new Error(`Script execution failed: ${getScriptErrorMessage(scriptResult[0].error)}`);
      if (!scriptResult[0].result) throw new Error('Page script returned empty result');

      const result = scriptResult[0].result;
      if (!isMainTextScriptResult(result)) {
        throw new Error('Page script returned unexpected result');
      }
      const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);

      if (result.error) {
        return {
          error: result.error,
          tabContext: {
            currentTabId: context.tabId,
            executedOnTabId: effectiveTabId,
            availableTabs: validTabs,
            tabCount: validTabs.length
          }
        };
      }

      return {
        output: `Title: ${result.title}\nURL: ${result.url}\nSource element: <${result.source}>\n---\n${result.text}`,
        tabContext: {
          currentTabId: context.tabId,
          executedOnTabId: effectiveTabId,
          availableTabs: validTabs,
          tabCount: validTabs.length
        }
      };
    } catch (err) {
      return {
        error: `Failed to extract page text: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    } finally {
      await tabGroupManager.restoreIndicatorAfterToolUse(effectiveTabId);
    }
  },
  toProviderSchema: async () => ({
    name: 'get_page_text',
    description:
      "Extract raw text content from the page, prioritizing article content. Ideal for reading articles, blog posts, or other text-heavy pages. Returns plain text without HTML formatting. If you don't have a valid tab ID, use tabs_context first to get available tabs. Output is limited to 50000 characters by default. If the output exceeds this limit, you will receive an error suggesting alternatives.",
    input_schema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description:
            "Tab ID to extract text from. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
        },
        max_chars: {
          type: 'number',
          description:
            'Maximum characters for output (default: 50000). Set to a higher value if your client can handle large outputs.'
        }
      },
      required: ['tabId']
    }
  })
};
// =============================================================================
// Tool: read_page (Ue)
// =============================================================================

const readPageTool: ToolDefinition<ReadPageToolInput> = {
  name: 'read_page',
  description:
    "Get an accessibility tree representation of elements on the page. By default returns all elements including non-visible ones. Can optionally filter for only interactive elements, limit tree depth, or focus on a specific element. Returns a structured tree that represents how screen readers see the page content. If you don't have a valid tab ID, use tabs_context first to get available tabs. Output is limited to 50000 characters - if exceeded, specify a depth limit or ref_id/selector to focus on a specific element. After an interaction (click/fill/scroll), prefer diff:true to receive only the changes since the last read_page (saves tokens in long agent loops). Use selector to scope a snapshot to a CSS-selected subtree (faster and smaller than reading the whole page).",
  parameters: {
    filter: {
      type: 'string',
      enum: ['interactive', 'all'],
      description:
        'Filter elements: "interactive" for buttons/links/inputs only, "all" for all elements including non-visible ones (default: all elements)'
    },
    tabId: {
      type: 'number',
      description:
        "Tab ID to read from. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
    },
    depth: {
      type: 'number',
      description:
        'Maximum depth of the tree to traverse (default: 15). Use a smaller depth if output is too large.'
    },
    ref_id: {
      type: 'string',
      description:
        'Reference ID of a parent element to read. Will return the specified element and all its children. Use this to focus on a specific part of the page when output is too large.'
    },
    max_chars: {
      type: 'number',
      description:
        'Maximum characters for output (default: 50000). Set to a higher value if your client can handle large outputs.'
    },
    selector: {
      type: 'string',
      description:
        'CSS selector to focus the snapshot on a specific element subtree (including iframe contents). Useful when you only care about part of the page. Mutually independent from ref_id.'
    },
    diff: {
      type: 'boolean',
      description:
        'If true, return only changes vs the previous read_page snapshot for this tab (line-based diff). First call always returns the full snapshot. Mutually exclusive with ref_id and selector (subtree reads have no integral baseline). URL navigation invalidates the diff baseline.'
    },
    urls: {
      type: 'boolean',
      description:
        'If true, resolve href for each link element and include it as [url=...] in the output. Adds one CDP round-trip per link; skip on pages with many links unless you need the targets.'
    }
  },
  execute: async (input, context): Promise<ToolResult> => {
    const {
      filter,
      tabId,
      depth,
      ref_id: refId,
      max_chars: maxChars,
      selector,
      diff: diffMode,
      urls: urlsOpt
    } = input || {};
    if (!context?.tabId) throw new Error('No active tab found');
    if (diffMode === true && (refId || selector)) {
      return { error: 'diff is not supported with ref_id or selector (subtree reads have no integral baseline). Use diff only on full-page reads.' };
    }

    const effectiveTabId = await tabGroupManager.getEffectiveTabId(tabId, context.tabId);
    const tab = await chrome.tabs.get(effectiveTabId);
    if (!tab.id) throw new Error('Active tab has no ID');
    const trackedTabId = tab.id;
    const tabUrl = tab.url;
    if (!tabUrl) throw new Error('No URL available for active tab');
    const readFilter = filter ?? 'all';

    const toolUseId = context?.toolUseId;
    const permissionResult = await context.permissionManager.checkPermission(tabUrl, toolUseId);
    if (!permissionResult.allowed) {
      if (permissionResult.needsPrompt) {
        return {
          type: 'permission_required',
          tool: PermissionTools.READ_PAGE_CONTENT,
          url: tabUrl,
          toolUseId
        };
      }
      return { error: 'Permission denied for reading pages on this domain' };
    }

    await tabGroupManager.hideIndicatorForToolUse(effectiveTabId);

    try {
      // CDP AX Tree 优先路径：不指定 ref_id 时尝试使用 CDP 获取原生无障碍树
      if (!refId) {
        try {
          const isAttached = await cdpDebugger.isDebuggerAttached(effectiveTabId);
          if (isAttached) {
            // 持锁串行执行 pruneStaleRefs → 读 counter → takeSnapshot → registerRefsInPage，
            // 防止并发 read_page 读到相同 counter 导致 ref_N 相互覆盖。
            const lockedResult = await withSnapshotLock(effectiveTabId, async () => {
              await pruneStaleRefs(effectiveTabId);

              // 读取所有框架的 ref 计数器，取最大值，确保新 ref 不覆盖已有 ref；
              // 同时读 viewport（仅主框架）。两个 executeScript 并发，无依赖。
              const [counterResult, vpResult] = await Promise.all([
                chrome.scripting.executeScript({
                  target: { tabId: effectiveTabId, allFrames: true },
                  func: () => {
                    const pageWindow = window as Window & { __superduckRefCounter?: number };
                    return pageWindow.__superduckRefCounter || 0;
                  },
                }),
                chrome.scripting.executeScript({
                  target: { tabId: effectiveTabId },
                  func: () => ({ width: window.innerWidth, height: window.innerHeight }),
                })
              ]);
              const currentRefCounter = Math.max(
                0,
                ...counterResult.map((result) =>
                  typeof result.result === 'number' ? result.result : 0
                )
              );

              const snapshotResult = await takeSnapshotUnlocked(effectiveTabId, {
                filter: readFilter,
                depth: depth ?? 15,
                maxChars: maxChars ?? 50000,
                compact: readFilter === 'interactive',
                startRef: currentRefCounter,
                selector: typeof selector === 'string' && selector ? selector : undefined,
                urls: urlsOpt === true,
              });

              if (snapshotResult.refMappings.length > 0) {
                await registerRefsInPage(effectiveTabId, snapshotResult.refMappings);
              }

              const viewport = isViewportDimensions(vpResult?.[0]?.result)
                ? vpResult[0].result
                : { width: 0, height: 0 };
              return { snapshotResult, viewport };
            });

            const viewportInfo = `Viewport: ${lockedResult.viewport.width}x${lockedResult.viewport.height}`;
            const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);

            let outputContent = lockedResult.snapshotResult.content;
            const variantKey = snapshotVariantKey({
              filter: readFilter,
              depth: depth ?? 15,
              maxChars: maxChars ?? 50000,
              urls: urlsOpt === true,
            });
            if (diffMode === true) {
              const prev = snapshotCacheGet(context.sessionId, effectiveTabId, tabUrl, variantKey);
              snapshotCacheSet(context.sessionId, effectiveTabId, tabUrl, variantKey, outputContent);
              if (prev !== undefined) {
                if (normalizeSnapshotForDiff(prev.content) === normalizeSnapshotForDiff(outputContent)) {
                  outputContent = DIFF_NO_CHANGES;
                } else {
                  const { added, removed, body } = formatCompactDiff(prev.content, outputContent);
                  outputContent = `[diff: +${added} -${removed}]\n${body}`;
                }
              } else {
                outputContent = `${DIFF_NO_BASELINE_PREFIX}\n${outputContent}`;
              }
            } else if (!selector) {
              snapshotCacheSet(context.sessionId, effectiveTabId, tabUrl, variantKey, outputContent);
            }

            return {
              output: `${outputContent}\n\n${viewportInfo}`,
              tabContext: {
                currentTabId: context.tabId,
                executedOnTabId: effectiveTabId,
                availableTabs: validTabs,
                tabCount: validTabs.length
              }
            };
          }
        } catch (cdpErr) {
          // maxChars 超限属于业务错误，需透传
          if (cdpErr instanceof SnapshotMaxCharsError) {
            throw cdpErr;
          }
          console.warn('[read_page] CDP AX tree failed, falling back to content script:', cdpErr);
        }
      }

      // 降级路径：使用 content script 方式（ref_id 查询也走此路径）
      const scriptResult = await chrome.scripting.executeScript({
        target: { tabId: trackedTabId },
        func: (
          filterArg: string | null,
          depthArg: number | null,
          maxCharsArg: number,
          refIdArg: string | null
        ) => {
          const pageWindow = window as Window & {
            __generateAccessibilityTree?: (
              filterArg: string | null,
              depthArg: number | null,
              maxCharsArg: number,
              refIdArg: string | null
            ) => unknown;
          };
          if ('function' !== typeof pageWindow.__generateAccessibilityTree)
            throw new Error('Accessibility tree function not found. Please refresh the page.');
          return pageWindow.__generateAccessibilityTree(
            filterArg,
            depthArg,
            maxCharsArg,
            refIdArg
          );
        },
        args: [filter || null, depth ?? null, maxChars ?? 50000, refId ?? null]
      });
      if (!scriptResult || 0 === scriptResult.length)
        throw new Error('No results returned from page script');
      if ('error' in scriptResult[0] && scriptResult[0].error)
        throw new Error(`Script execution failed: ${getScriptErrorMessage(scriptResult[0].error)}`);
      if (!scriptResult[0].result) throw new Error('Page script returned empty result');

      const result = scriptResult[0].result;
      if (!isReadPageScriptResult(result)) {
        throw new Error('Page script returned unexpected result');
      }
      if (result.error) return { error: result.error };

      const viewportInfo = `Viewport: ${result.viewport.width}x${result.viewport.height}`;
      const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);
      // 降级路径产物与 CDP 路径格式不同，不能作为后续 diff:true 的基线，跳过缓存写入。
      return {
        output: `${result.pageContent}\n\n${viewportInfo}`,
        tabContext: {
          currentTabId: context.tabId,
          executedOnTabId: effectiveTabId,
          availableTabs: validTabs,
          tabCount: validTabs.length
        }
      };
    } catch (err) {
      return {
        error: `Failed to read page: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    } finally {
      await tabGroupManager.restoreIndicatorAfterToolUse(effectiveTabId);
    }
  },
  toProviderSchema: async () => ({
    name: 'read_page',
    description:
      "Get an accessibility tree representation of elements on the page. By default returns all elements including non-visible ones. Output is limited to 50000 characters. If the output exceeds this limit, you will receive an error asking you to specify a smaller depth, or focus on a specific element using ref_id or selector. Optionally filter for only interactive elements. After an interaction (click/fill/scroll), prefer diff:true to receive only the changes since the last read_page (saves tokens). Use selector to scope a snapshot to a CSS-selected subtree. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
    input_schema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['interactive', 'all'],
          description:
            'Filter elements: "interactive" for buttons/links/inputs only, "all" for all elements including non-visible ones (default: all elements)'
        },
        tabId: {
          type: 'number',
          description:
            "Tab ID to read from. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
        },
        depth: {
          type: 'number',
          description:
            'Maximum depth of the tree to traverse (default: 15). Use a smaller depth if output is too large.'
        },
        ref_id: {
          type: 'string',
          description:
            'Reference ID of a parent element to read. Will return the specified element and all its children. Use this to focus on a specific part of the page when output is too large.'
        },
        max_chars: {
          type: 'number',
          description:
            'Maximum characters for output (default: 50000). Set to a higher value if your client can handle large outputs.'
        },
        selector: {
          type: 'string',
          description:
            'CSS selector to focus the snapshot on a specific element subtree (including iframe contents).'
        },
        diff: {
          type: 'boolean',
          description:
            'If true, return only changes vs the previous read_page snapshot for this tab. First call returns the full snapshot. Mutually exclusive with ref_id and selector. URL navigation invalidates the diff baseline.'
        },
        urls: {
          type: 'boolean',
          description:
            'If true, resolve href for each link element and include it as [url=...] in the output. Adds one CDP round-trip per link; skip on pages with many links unless you need the targets.'
        }
      },
      required: ['tabId']
    }
  })
};

// =============================================================================
// Tool: resize_window (Pe)
// =============================================================================

const resizeWindowTool: ToolDefinition<ResizeWindowToolInput> = {
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

// =============================================================================
// Tool: tabs_context (Ge)
// =============================================================================

const MCP_NATIVE_SESSION = 'mcp-native-session';

const tabsContextTool: ToolDefinition<EmptyToolInput> = {
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

// =============================================================================
// Tool: tabs_create (Be)
// =============================================================================

const tabsCreateTool: ToolDefinition<EmptyToolInput> = {
  name: 'tabs_create',
  description: 'Creates a new empty tab in the current tab group. IMPORTANT: Only use this when the user explicitly asks to open a new tab, or when you need to keep multiple pages open at the same time. For simple navigation tasks, reuse existing tabs with the navigate tool instead.',
  parameters: {},
  execute: async (_input, context): Promise<ToolResult> => {
    try {
      if (!context?.tabId) throw new Error('No active tab found');

      const currentTab = await chrome.tabs.get(context.tabId);
      const newTab = await chrome.tabs.create({ url: 'chrome://newtab', active: false });
      if (!newTab.id) throw new Error('Failed to create tab - no tab ID returned');

      if (currentTab.groupId && currentTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        await chrome.tabs.group({ tabIds: newTab.id, groupId: currentTab.groupId });
      }

      const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);
      return {
        output: `Created new tab. Tab ID: ${newTab.id}`,
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
    description: 'Creates a new empty tab in the current tab group. IMPORTANT: Only use this when the user explicitly asks to open a new tab, or when you need to keep multiple pages open at the same time. For simple navigation tasks, reuse existing tabs with the navigate tool instead.',
    input_schema: { type: 'object', properties: {}, required: [] }
  })
};

// =============================================================================
// Tool: turn_answer_start (Oe)
// =============================================================================

const turnAnswerStartSchema: {
  type: 'object';
  properties: Record<string, ToolSchemaProperty>;
  required: string[];
} = {
  type: 'object',
  properties: {},
  required: []
};

const turnAnswerStartTool: ToolDefinition<EmptyToolInput> = {
  name: 'turn_answer_start',
  description:
    'Call this immediately before your text response to the user for this turn. Required every turn - whether or not you made tool calls. After calling, write your response. No more tools after this.',
  parameters: {},
  execute: async () => ({ output: 'Proceed with your response.' }),
  toProviderSchema() {
    return {
      type: 'custom',
      name: this.name,
      description: this.description,
      input_schema: turnAnswerStartSchema
    };
  }
};

// =============================================================================
// Tool: update_plan (Le)
// =============================================================================

const updatePlanInputSchema: {
  type: 'object';
  properties: Record<string, ToolSchemaProperty>;
  required: string[];
} = {
  type: 'object',
  properties: {
    domains: {
      type: 'array',
      items: { type: 'string' },
      description:
        "List of domains you will visit (e.g., ['github.com', 'stackoverflow.com']). These domains will be approved for the session when the user accepts the plan."
    },
    approach: {
      type: 'array',
      items: { type: 'string' },
      description:
        'High-level description of what you will do. Focus on outcomes and key actions, not implementation details. Be concise - aim for 3-7 items.'
    }
  },
  required: ['domains', 'approach']
};

const updatePlanTool: ToolDefinition<UpdatePlanToolInput> = {
  name: 'update_plan',
  description:
    'Present a plan to the user for approval before taking actions. The user will see the domains you intend to visit and your approach. Once approved, you can proceed with actions on the approved domains without additional permission prompts.',
  parameters: updatePlanInputSchema.properties,
  async execute(input, context): Promise<ToolResult> {
    const validationError = (function validatePlan(plan: UpdatePlanToolInput | Record<string, unknown>) {
      const planData = isRecord(plan) ? plan : {};
      const domains = planData.domains;
      const approach = planData.approach;
      const errors: Record<string, string> = {};
      if (!Array.isArray(domains)) {
        errors.domains = 'Required field missing or not an array';
      }
      if (!Array.isArray(approach)) {
        errors.approach = 'Required field missing or not an array';
      }
      if (Object.keys(errors).length > 0) {
        return {
          error: {
            type: 'validation_error',
            message: "Invalid plan format. Both 'domains' and 'approach' are required arrays.",
            fields: errors
          }
        };
      }
      return null;
    })(input);

    if (validationError) return { error: JSON.stringify(validationError.error) };

    const { domains, approach } = input;

    const domainsWithCategories = await (async function categorize(domainList: string[]) {
      const results: Array<{ domain: string; category?: string }> = [];
      for (const domain of domainList) {
        try {
          const url = domain.startsWith('http') ? domain : `https://${domain}`;
          const category = await domainCategoryCache.getCategory(url);
          results.push({ domain, category });
        } catch {
          results.push({ domain });
        }
      }
      return results;
    })(domains);

    return {
      type: 'permission_required',
      tool: PermissionTools.PLAN_APPROVAL,
      url: '',
      toolUseId: context?.toolUseId,
      actionData: { plan: { domains: domainsWithCategories, approach } }
    };
  },
  setPromptsConfig(config: Record<string, unknown>) {
    if (typeof config.toolDescription === 'string') {
      this.description = config.toolDescription;
    }
    if (isRecord(config.inputPropertyDescriptions)) {
      const inputPropertyDescriptions = config.inputPropertyDescriptions;
      const props = updatePlanInputSchema.properties;
      if (typeof inputPropertyDescriptions.domains === 'string') {
        props.domains.description = inputPropertyDescriptions.domains;
      }
      if (typeof inputPropertyDescriptions.approach === 'string') {
        props.approach.description = inputPropertyDescriptions.approach;
      }
    }
  },
  toProviderSchema() {
    return {
      type: 'custom',
      name: this.name,
      description: this.description,
      input_schema: updatePlanInputSchema
    };
  }
};

// =============================================================================
// Tool: read_console_messages (De)
// =============================================================================

const readConsoleMessagesTool: ToolDefinition<ReadConsoleMessagesToolInput> = {
  name: 'read_console_messages',
  description:
    "Read browser console messages (console.log, console.error, console.warn, etc.) from a specific tab. Useful for debugging JavaScript errors, viewing application logs, or understanding what's happening in the browser console. Returns console messages from the current domain only. If you don't have a valid tab ID, use tabs_context first to get available tabs. IMPORTANT: Always provide a pattern to filter messages - without a pattern, you may get too many irrelevant messages.",
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

      const effectiveTabId = await tabGroupManager.getEffectiveTabId(tabId, context.tabId);
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
      } catch {
        // ignore
      }

      const messages = cdpDebugger.getConsoleMessages(trackedTabId, onlyErrors, pattern);
      if (clear) cdpDebugger.clearConsoleMessages(trackedTabId);

      if (0 === messages.length) {
        return {
          output: `No console ${onlyErrors ? 'errors or exceptions' : 'messages'} found for this tab.\n\nNote: Console tracking starts when this tool is first called. If the page loaded before calling this tool, you may need to refresh the page to capture console messages from page load.`,
          tabContext: {
            currentTabId: context.tabId,
            executedOnTabId: effectiveTabId,
            availableTabs: await tabGroupManager.getValidTabsWithMetadata(context.tabId),
            tabCount: (await tabGroupManager.getValidTabsWithMetadata(context.tabId)).length
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
      const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);

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

// =============================================================================
// Tool: read_network_requests (Re)
// =============================================================================

const readNetworkRequestsTool: ToolDefinition<ReadNetworkRequestsToolInput> = {
  name: 'read_network_requests',
  description:
    "Read HTTP network requests (XHR, Fetch, documents, images, etc.) from a specific tab. Useful for debugging API calls, monitoring network activity, or understanding what requests a page is making. Returns all network requests made by the current page, including cross-origin requests. Requests are automatically cleared when the page navigates to a different domain. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
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

      const effectiveTabId = await tabGroupManager.getEffectiveTabId(tabId, context.tabId);
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
      } catch {
        // ignore
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
            availableTabs: await tabGroupManager.getValidTabsWithMetadata(context.tabId),
            tabCount: (await tabGroupManager.getValidTabsWithMetadata(context.tabId)).length
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
      const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);

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

export type { ToolContext, ToolResult, ToolDefinition };
export {
  javascriptTool,
  navigateTool,
  findTool,
  getPageTextTool,
  readPageTool,
  resizeWindowTool,
  tabsContextTool,
  tabsCreateTool,
  turnAnswerStartTool,
  updatePlanTool,
  readConsoleMessagesTool,
  readNetworkRequestsTool,
  shouldShowPlanMode,
  getPlanModeSystemReminder,
  filterAndApproveDomains,
  filterDomainsByCategory,
  coerceToolInputTypes,
  toolsToProviderSchema,
  parseArrayInput
};
