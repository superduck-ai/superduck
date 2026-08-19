import { PermissionTools } from '../domainPermissions';
import { tabGroupManager } from '../tabState';
import type { ToolDefinition, ToolResult } from '../pageToolsSupport/types';
import { type GetPageTextToolInput, getScriptErrorMessage, isMainTextScriptResult } from './types';

export const getPageTextTool: ToolDefinition<GetPageTextToolInput> = {
  name: 'get_page_text',
  description:
    "Extract text content from the page, prioritizing article content. Ideal for reading articles, blog posts, or other text-heavy pages. Returns plain text without HTML formatting by default; use format='html' to get the raw innerHTML of the content area, preserving all markup for the agent to interpret. If you don't have a valid tab ID, use tabs_context first to get available tabs. Output is limited to 50000 characters by default.",
  tabAccess: 'read',
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
    },
    format: {
      type: 'string',
      description:
        "Output format: 'text' (plain text, default) or 'html' (raw innerHTML of the content area, preserves all markup).",
      enum: ['text', 'html']
    }
  },
  execute: async (input, context): Promise<ToolResult> => {
    const { tabId, max_chars: maxChars, format = 'text' } = input || {};
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
        func: (charLimit: number, outFormat: string) => {
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
            '#content',
            '[contenteditable="true"]',
            '[contenteditable=""]',
            '[contenteditable="plaintext-only"]',
            '#baidu_realtime_editor_f'
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
                format: outFormat as 'text' | 'html',
                source: 'none',
                title: document.title,
                url: window.location.href,
                error:
                  'No semantic content element found and page body is too large (likely contains CSS/scripts). Try using read_page_content (screenshot) instead.'
              };
            }
            contentElement = document.body;
          }

          // 'html' returns the raw innerHTML of the content area (preserves all
          // markup); 'text' (default) returns flattened textContent.
          const text = (contentElement.textContent || '')
            .replace(/\s+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          const output: string = outFormat === 'html' ? contentElement.innerHTML : text;
          if (!output || output.length < 10) {
            return {
              text: '',
              format: outFormat as 'text' | 'html',
              source: 'none',
              title: document.title,
              url: window.location.href,
              error:
                'No text content found. Page may contain only images, videos, or canvas-based content.'
            };
          }
          if (output.length > charLimit) {
            return {
              text: '',
              format: outFormat as 'text' | 'html',
              source: contentElement.tagName.toLowerCase(),
              title: document.title,
              url: window.location.href,
              error:
                'Output exceeds ' +
                charLimit +
                ' character limit (' +
                output.length +
                ' characters). Try using read_page with a specific ref_id to focus on a smaller section, or increase max_chars if your client can handle larger outputs.'
            };
          }
          return {
            text: output,
            format: outFormat as 'text' | 'html',
            source: contentElement.tagName.toLowerCase(),
            title: document.title,
            url: window.location.href
          };
        },
        args: [maxChars ?? 50000, format]
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
        console.error('[get_page_text] unexpected result:', JSON.stringify(result).slice(0, 500));
        throw new Error('Page script returned unexpected result');
      }
      const validTabs = await tabGroupManager.getValidTabsWithMetadataForContext(
        context.tabId,
        context
      );

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
        output: `Title: ${result.title}\nURL: ${result.url}\nSource element: <${result.source}> (format: ${result.format})\n---\n${result.text}`,
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
      "Extract text content from the page, prioritizing article content. Ideal for reading articles, blog posts, or other text-heavy pages. Returns plain text without HTML formatting by default; use format='html' to get the raw innerHTML of the content area, preserving all markup for the agent to interpret. If you don't have a valid tab ID, use tabs_context first to get available tabs. Output is limited to 50000 characters by default. If the output exceeds this limit, you will receive an error suggesting alternatives.",
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
        },
        format: {
          type: 'string',
          description:
            "Output format: 'text' (plain text, default) or 'html' (raw innerHTML of the content area, preserves all markup).",
          enum: ['text', 'html']
        }
      },
      required: ['tabId']
    }
  })
};
