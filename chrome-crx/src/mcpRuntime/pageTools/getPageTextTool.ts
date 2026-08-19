import { PermissionTools } from '../domainPermissions';
import { tabGroupManager } from '../tabState';
import type { ToolDefinition, ToolResult } from '../pageToolsSupport/types';
import { type GetPageTextToolInput, getScriptErrorMessage, isMainTextScriptResult } from './types';

export const getPageTextTool: ToolDefinition<GetPageTextToolInput> = {
  name: 'get_page_text',
  description:
    "Extract text content from the page, prioritizing article content. Ideal for reading articles, blog posts, or other text-heavy pages. Returns plain text without HTML formatting by default; use format='html' to get the raw HTML of the content area, or format='markdown' to get structured markdown (headings, bold/italic, links, lists, code blocks). If you don't have a valid tab ID, use tabs_context first to get available tabs. Output is limited to 50000 characters by default.",
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
        "Output format: 'text' (plain text, default), 'html' (raw innerHTML of the content area, preserves all markup), 'markdown' (structured markdown with headings, bold/italic, links, lists, code blocks).",
      enum: ['text', 'html', 'markdown']
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
                format: outFormat as 'text' | 'html' | 'markdown',
                source: 'none',
                title: document.title,
                url: window.location.href,
                error:
                  'No semantic content element found and page body is too large (likely contains CSS/scripts). Try using read_page_content (screenshot) instead.'
              };
            }
            contentElement = document.body;
          }

          // Minimal HTML -> Markdown converter covering the structures agents
          // actually need (headings, bold/italic, links, lists, code, tables,
          // images, hr). Recursive walk over text + element nodes preserves
          // inline formatting inside blocks and keeps word boundaries intact.
          const htmlToMarkdown = (root: Element): string => {
            const walk = (node: Node, inPre = false): string => {
              if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent || '';
                return inPre ? text : text.replace(/\s+/g, ' ');
              }
              if (node.nodeType !== Node.ELEMENT_NODE) return '';
              const el = node as Element;
              const tag = el.tagName;
              const isPre = tag === 'PRE' || inPre;

              if (tag === 'PRE') {
                const code = el.querySelector('code');
                const codeText = code ? code.textContent : el.textContent;
                return `\n\`\`\`\n${codeText || ''}\n\`\`\`\n`;
              }

              const childrenMarkdown = Array.from(node.childNodes)
                .map((child) => walk(child, isPre))
                .join('');

              switch (tag) {
                case 'A':
                  return `[${childrenMarkdown.trim()}](${(el as HTMLAnchorElement).href || ''})`;
                case 'B':
                case 'STRONG':
                  return childrenMarkdown.trim() ? `**${childrenMarkdown.trim()}**` : '';
                case 'I':
                case 'EM':
                  return childrenMarkdown.trim() ? `*${childrenMarkdown.trim()}*` : '';
                case 'CODE':
                  return childrenMarkdown.trim() ? '`' + childrenMarkdown.trim() + '`' : '';
                case 'BR':
                  return '\n';
                case 'IMG': {
                  const src = (el as HTMLImageElement).src;
                  return src ? `![${(el as HTMLImageElement).alt || ''}](${src})` : '';
                }
                case 'H1':
                  return `\n# ${childrenMarkdown.trim()}\n`;
                case 'H2':
                  return `\n## ${childrenMarkdown.trim()}\n`;
                case 'H3':
                  return `\n### ${childrenMarkdown.trim()}\n`;
                case 'H4':
                  return `\n#### ${childrenMarkdown.trim()}\n`;
                case 'H5':
                  return `\n##### ${childrenMarkdown.trim()}\n`;
                case 'H6':
                  return `\n###### ${childrenMarkdown.trim()}\n`;
                case 'HR':
                  return '\n---\n';
                case 'P':
                case 'DIV':
                case 'SECTION':
                case 'ARTICLE':
                case 'FIGURE':
                  return `\n${childrenMarkdown.trim()}\n`;
                case 'BLOCKQUOTE':
                  return `\n> ${childrenMarkdown.trim().replace(/\n/g, '\n> ')}\n`;
                case 'UL':
                case 'OL':
                  return `\n${childrenMarkdown.trim()}\n`;
                case 'LI':
                  return `\n- ${childrenMarkdown.trim()}`;
                case 'TABLE': {
                  // Emit a GFM header separator row after the first row so
                  // common renderers treat it as a real table.
                  const rows = childrenMarkdown.trim().split('\n').filter(Boolean);
                  if (rows.length > 1) {
                    const headerCells = rows[0].split('|').filter((c) => c.trim()).length;
                    const separator =
                      '| ' + Array.from({ length: headerCells }, () => '---').join(' | ') + ' |';
                    return `\n${rows[0]}\n${separator}\n${rows.slice(1).join('\n')}\n`;
                  }
                  return `\n${rows.join('\n')}\n`;
                }
                case 'TR': {
                  const cells = Array.from(el.children)
                    .filter((c) => c.tagName === 'TD' || c.tagName === 'TH')
                    .map((c) => walk(c, isPre).trim())
                    .join(' | ');
                  return `| ${cells} |\n`;
                }
                case 'TD':
                case 'TH':
                  return childrenMarkdown.trim();
                default:
                  return childrenMarkdown;
              }
            };
            return walk(root)
              .replace(/\n{3,}/g, '\n\n')
              .trim();
          };

          const text = (contentElement.textContent || '')
            .replace(/\s+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          let output: string;
          if (outFormat === 'html') {
            output = contentElement.innerHTML;
          } else if (outFormat === 'markdown') {
            output = htmlToMarkdown(contentElement);
          } else {
            output = text;
          }
          if (!output || output.length < 10) {
            return {
              text: '',
              format: outFormat as 'text' | 'html' | 'markdown',
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
              format: outFormat as 'text' | 'html' | 'markdown',
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
            format: outFormat as 'text' | 'html' | 'markdown',
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
      "Extract text content from the page, prioritizing article content. Ideal for reading articles, blog posts, or other text-heavy pages. Returns plain text without HTML formatting by default; use format='html' to get the raw HTML of the content area, or format='markdown' to get structured markdown (headings, bold/italic, links, lists, code blocks). If you don't have a valid tab ID, use tabs_context first to get available tabs. Output is limited to 50000 characters by default. If the output exceeds this limit, you will receive an error suggesting alternatives.",
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
            "Output format: 'text' (plain text, default), 'html' (raw innerHTML of the content area, preserves all markup), 'markdown' (structured markdown with headings, bold/italic, links, lists, code blocks).",
          enum: ['text', 'html', 'markdown']
        }
      },
      required: ['tabId']
    }
  })
};
