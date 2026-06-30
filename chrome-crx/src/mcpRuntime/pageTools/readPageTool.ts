import { PermissionTools } from '../domainPermissions';
import { tabGroupManager } from '../tabState';
import { cdpDebugger } from '../cdp';
import {
  takeSnapshotUnlocked,
  SnapshotMaxCharsError,
  normalizeSnapshotForDiff,
  withSnapshotLock
} from '../axSnapshot';
import { registerRefsInPage, pruneStaleRefs } from '../screenshot/refBridge';
import {
  DIFF_NO_BASELINE_PREFIX,
  DIFF_NO_CHANGES,
  formatCompactDiff,
  snapshotCacheGet,
  snapshotCacheSet,
  snapshotVariantKey
} from '../pageToolsSupport/snapshotCache';
import type { ToolDefinition, ToolResult } from '../pageToolsSupport/types';
import {
  type ReadPageToolInput,
  getScriptErrorMessage,
  isReadPageScriptResult,
  isViewportDimensions
} from './types';

export const readPageTool: ToolDefinition<ReadPageToolInput> = {
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
      return {
        error:
          'diff is not supported with ref_id or selector (subtree reads have no integral baseline). Use diff only on full-page reads.'
      };
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
                  }
                }),
                chrome.scripting.executeScript({
                  target: { tabId: effectiveTabId },
                  func: () => ({ width: window.innerWidth, height: window.innerHeight })
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
                urls: urlsOpt === true
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
              urls: urlsOpt === true
            });
            if (diffMode === true) {
              const prev = snapshotCacheGet(context.sessionId, effectiveTabId, tabUrl, variantKey);
              snapshotCacheSet(
                context.sessionId,
                effectiveTabId,
                tabUrl,
                variantKey,
                outputContent
              );
              if (prev !== undefined) {
                if (
                  normalizeSnapshotForDiff(prev.content) === normalizeSnapshotForDiff(outputContent)
                ) {
                  outputContent = DIFF_NO_CHANGES;
                } else {
                  const { added, removed, body } = formatCompactDiff(prev.content, outputContent);
                  outputContent = `[diff: +${added} -${removed}]\n${body}`;
                }
              } else {
                outputContent = `${DIFF_NO_BASELINE_PREFIX}\n${outputContent}`;
              }
            } else if (!selector) {
              snapshotCacheSet(
                context.sessionId,
                effectiveTabId,
                tabUrl,
                variantKey,
                outputContent
              );
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
          return pageWindow.__generateAccessibilityTree(filterArg, depthArg, maxCharsArg, refIdArg);
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
