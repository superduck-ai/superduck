import { PermissionTools } from '../domainPermissions';
import { tabGroupManager } from '../tabState';
import type { ToolDefinition, ToolResult } from '../pageToolsSupport/types';
import { type FindToolInput, getScriptErrorMessage } from './types';

function textMatchFallback(treeContent: string, query: string): ToolResult {
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

  const resultLines = top.map((m) => `- ${m.ref}: ${m.line.replace(/\[ref=ref_\d+\]/, '').trim()}`);
  return {
    output: `Found ${scored.length} matching element${scored.length === 1 ? '' : 's'} (showing ${top.length}):\n\n${resultLines.join('\n')}`
  };
}

export const findTool: ToolDefinition<FindToolInput> = {
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

      const effectiveTabId = await tabGroupManager.getEffectiveTabIdForContext(
        tabId,
        context.tabId,
        { sessionId: context.browserSessionScope?.sessionId }
      );
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
