import { PermissionActionType } from '../../extensionServices';
import { tabGroupManager } from '../tabState';
import { cdpDebugger } from '../cdp';
import { captureAnnotatedScreenshot } from '../screenshot/annotatedScreenshot';
import type { ToolContext, ToolDefinition, ToolResult } from '../pageTools';
import {
  createPolicyCheckedChildTab,
  filterPolicyAllowedTabs,
  moveSearchNavigationToNewTab
} from '../navigationIsolation';
import type { NavigationPolicyContext } from '../navigationIsolation';
import { type ComputerToolParams } from './types';
import { recordEvent, recordError, redactUrl, recordArtifact } from '../../debug';
import {
  executeClick,
  executeScreenshot,
  executeType,
  executeWait,
  executeScroll,
  executeKey,
  executeDrag,
  executeZoom,
  executeScrollTo,
  executeHover
} from './computerActions';

function canOpenNewTabFromInteraction(action: string): boolean {
  return (
    action === 'left_click' ||
    action === 'double_click' ||
    action === 'triple_click' ||
    action === 'type' ||
    action === 'key'
  );
}

function canTriggerSearchNavigationIsolation(params: ComputerToolParams): boolean {
  if (
    params.action === 'left_click' ||
    params.action === 'double_click' ||
    params.action === 'triple_click'
  ) {
    return true;
  }
  if (params.action === 'key' && typeof params.text === 'string') {
    return params.text
      .split(/\s+/)
      .some((key) => key.toLowerCase() === 'enter' || key.toLowerCase() === 'return');
  }
  return params.action === 'type' && typeof params.text === 'string' && /[\r\n]/.test(params.text);
}

function resolveWindowOpenUrl(rawUrl: string, currentUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl, currentUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

async function createTabsForWindowOpenEvents(
  openerTabId: number,
  currentUrl: string,
  policy: NavigationPolicyContext
): Promise<number[]> {
  const events = cdpDebugger.consumeWindowOpenEvents(openerTabId);
  const seenUrls = new Set<string>();
  const createdTabIds: number[] = [];

  for (const event of events) {
    const url = resolveWindowOpenUrl(event.url, currentUrl);
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);

    const tabId = await createPolicyCheckedChildTab(openerTabId, url, policy);
    if (typeof tabId === 'number') createdTabIds.push(tabId);
  }

  return createdTabIds;
}

export const computerTool: ToolDefinition<ComputerToolParams> = {
  name: 'computer',
  description:
    "Use a mouse and keyboard to interact with a web browser, and take screenshots. If you don't have a valid tab ID, use tabs_context first to get available tabs.\n* The screen's resolution is {self.display_width_px}x{self.display_height_px}.\n* For click actions, ALWAYS prefer using `ref` from read_page or find tools. ref-based clicks are more accurate and work with all AI models. Workflow: call read_page first to get element refs, then click using the ref.\n* Only use `coordinate` as a last resort when ref is unavailable (e.g., canvas, image maps, or custom-rendered graphics).\n* If you tried clicking on a program or link but it failed to load, even after waiting, try calling read_page again to get fresh refs and retry.\n* Make sure to click any buttons, links, icons, etc with the cursor tip in the center of the element. Don't click boxes on their edges unless asked.",
  parameters: {
    action: {
      type: 'string',
      enum: [
        'left_click',
        'right_click',
        'type',
        'screenshot',
        'wait',
        'scroll',
        'key',
        'left_click_drag',
        'double_click',
        'triple_click',
        'zoom',
        'scroll_to',
        'hover'
      ],
      description:
        'The action to perform:\n* `left_click`: Click an element. Use `ref` from read_page (preferred) or `coordinate` as fallback.\n* `right_click`: Right-click an element. Use `ref` (preferred) or `coordinate`.\n* `double_click`: Double-click an element. Use `ref` (preferred) or `coordinate`.\n* `triple_click`: Triple-click an element. Use `ref` (preferred) or `coordinate`.\n* `type`: Type a string of text.\n* `screenshot`: Take a screenshot of the screen.\n* `wait`: Wait for a specified number of seconds.\n* `scroll`: Scroll up, down, left, or right at the specified coordinates.\n* `key`: Press a specific keyboard key.\n* `left_click_drag`: Drag from start_coordinate to coordinate.\n* `zoom`: Take a screenshot of a specific region and scale it to fill the viewport.\n* `scroll_to`: Scroll an element into view using its element reference ID from read_page or find tools.\n* `hover`: Move the mouse cursor to the specified coordinates or element without clicking. Useful for revealing tooltips, dropdown menus, or triggering hover states.'
    },
    coordinate: {
      type: 'array',
      items: { type: 'number' },
      minItems: 2,
      maxItems: 2,
      description:
        '(x, y): Fallback coordinate method — only use when ref is unavailable (canvas, image maps, custom-rendered graphics). The x (pixels from the left edge) and y (pixels from the top edge) coordinates. Required for `scroll` and `left_click_drag`. For click actions, prefer `ref` instead.'
    },
    text: {
      type: 'string',
      description:
        'The text to type (for `type` action) or the key(s) to press (for `key` action). For `key` action: Provide space-separated keys (e.g., "Backspace Backspace Delete"). Supports keyboard shortcuts using the platform\'s modifier key (use "cmd" on Mac, "ctrl" on Windows/Linux, e.g., "cmd+a" or "ctrl+a" for select all).'
    },
    duration: {
      type: 'number',
      minimum: 0,
      maximum: 30,
      description: 'The number of seconds to wait. Required for `wait`. Maximum 30 seconds.'
    },
    scroll_direction: {
      type: 'string',
      enum: ['up', 'down', 'left', 'right'],
      description: 'The direction to scroll. Required for `scroll`.'
    },
    scroll_amount: {
      type: 'number',
      minimum: 1,
      maximum: 10,
      description: 'The number of scroll wheel ticks. Optional for `scroll`, defaults to 3.'
    },
    start_coordinate: {
      type: 'array',
      items: { type: 'number' },
      minItems: 2,
      maxItems: 2,
      description: '(x, y): The starting coordinates for `left_click_drag`.'
    },
    region: {
      type: 'array',
      items: { type: 'number' },
      minItems: 4,
      maxItems: 4,
      description:
        '(x0, y0, x1, y1): The rectangular region to capture for `zoom`. Coordinates are in pixels from the top-left corner of the viewport. Required for `zoom` action.'
    },
    repeat: {
      type: 'number',
      minimum: 1,
      maximum: 100,
      description:
        'Number of times to repeat the key sequence. Only applicable for `key` action. Must be a positive integer between 1 and 100. Default is 1.'
    },
    ref: {
      type: 'string',
      description:
        'PREFERRED: Element reference ID from read_page or find tools (e.g., "ref_1", "ref_2"). Always prefer ref over coordinate for clicks — it is more accurate and model-independent. Required for `scroll_to` action. For click actions (left_click, right_click, double_click, triple_click), use ref instead of coordinate whenever possible.'
    },
    modifiers: {
      type: 'string',
      description:
        'Modifier keys for click actions (left_click, right_click, double_click, triple_click). Supports: "ctrl", "shift", "alt", "cmd" (or "meta"), "win" (or "windows"). Can be combined with "+" (e.g., "ctrl+shift", "cmd+alt"). Optional.'
    },
    tabId: {
      type: 'number',
      description:
        "Tab ID to execute the action on. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
    },
    annotate: {
      type: 'boolean',
      description:
        'For screenshot action only. When true, overlays numbered labels on interactive elements. Each number maps to a ref_N from read_page. Use this to visually identify elements before clicking by ref.'
    }
  },
  execute: async (params: ComputerToolParams, context: ToolContext): Promise<ToolResult> => {
    try {
      const toolParams = params || ({} as ComputerToolParams);
      if (!toolParams.action) throw new Error('Action parameter is required');
      if (!context?.tabId) throw new Error('No active tab found in context');

      const effectiveTabId = await tabGroupManager.getEffectiveTabId(
        toolParams.tabId,
        context.tabId
      );
      const tab = await chrome.tabs.get(effectiveTabId);
      if (!tab.id) throw new Error('Active tab has no ID');

      const inputAction = toolParams.action;
      const inputStartTime = Date.now();
      const refSource = toolParams.ref ? 'ref' : toolParams.coordinate ? 'coordinate' : 'none';
      const beforeUrl = tab.url;
      recordEvent({
        domain: 'input',
        event: 'input.action.start',
        ids: { toolUseId: context.toolUseId, tabId: effectiveTabId },
        data: {
          action: inputAction,
          refSource,
          refId: toolParams.ref,
          hasCoordinate: !!toolParams.coordinate,
          beforeUrl: beforeUrl ? redactUrl(beforeUrl) : undefined
        }
      });

      if (!['wait'].includes(toolParams.action)) {
        const tabUrl = tab.url;
        if (!tabUrl) throw new Error('No URL available for active tab');

        const getRequiredPermission = (action: string): PermissionActionType => {
          const permissionMap = {
            screenshot: PermissionActionType.READ_PAGE_CONTENT,
            scroll: PermissionActionType.READ_PAGE_CONTENT,
            scroll_to: PermissionActionType.READ_PAGE_CONTENT,
            zoom: PermissionActionType.READ_PAGE_CONTENT,
            hover: PermissionActionType.READ_PAGE_CONTENT,
            left_click: PermissionActionType.CLICK,
            right_click: PermissionActionType.CLICK,
            double_click: PermissionActionType.CLICK,
            triple_click: PermissionActionType.CLICK,
            left_click_drag: PermissionActionType.CLICK,
            type: PermissionActionType.TYPE,
            key: PermissionActionType.TYPE
          } satisfies Record<string, PermissionActionType>;
          const permission = permissionMap[action as keyof typeof permissionMap];
          if (!permission) throw new Error(`Unsupported action: ${action}`);
          return permission;
        };

        const requiredPermission = getRequiredPermission(toolParams.action);
        const toolUseId = context?.toolUseId;
        const permissionResult = await context.permissionManager.checkPermission(tabUrl, toolUseId);

        if (!permissionResult.allowed) {
          if (permissionResult.needsPrompt) {
            const permissionRequest: ToolResult = {
              type: 'permission_required',
              tool: requiredPermission,
              url: tabUrl,
              toolUseId
            };

            if (
              toolParams.action === 'left_click' ||
              toolParams.action === 'right_click' ||
              toolParams.action === 'double_click' ||
              toolParams.action === 'triple_click'
            ) {
              try {
                const screenshot = await cdpDebugger.screenshot(effectiveTabId);
                permissionRequest.actionData = {
                  screenshot: `data:image/${screenshot.format};base64,${screenshot.base64}`
                };
                if (toolParams.coordinate) {
                  permissionRequest.actionData.coordinate = toolParams.coordinate;
                }
              } catch (_err) {
                permissionRequest.actionData = {};
                if (toolParams.coordinate) {
                  permissionRequest.actionData.coordinate = toolParams.coordinate;
                }
              }
            } else if (toolParams.action === 'type' && toolParams.text) {
              permissionRequest.actionData = { text: toolParams.text };
            } else if (
              toolParams.action === 'left_click_drag' &&
              toolParams.start_coordinate &&
              toolParams.coordinate
            ) {
              permissionRequest.actionData = {
                start_coordinate: toolParams.start_coordinate,
                coordinate: toolParams.coordinate
              };
            }

            return permissionRequest;
          }
          return { error: 'Permission denied for this action on this domain' };
        }
      }

      const currentUrl = tab.url;
      const requireCurrentUrl = (): string => {
        if (!currentUrl) {
          throw new Error('No URL available for active tab');
        }
        return currentUrl;
      };
      let result: ToolResult;
      let openedTabIdsForContext: number[] = [];
      const clickOptions = context.skipIndicator ? { skipIndicator: true } : undefined;
      const runAction = async (): Promise<ToolResult> => {
        switch (toolParams.action) {
          case 'left_click':
          case 'right_click':
            return await executeClick(
              effectiveTabId,
              toolParams,
              1,
              requireCurrentUrl(),
              clickOptions,
              context.permissionManager
            );

          case 'type':
            return await executeType(effectiveTabId, toolParams, requireCurrentUrl());

          case 'screenshot':
            if (toolParams.annotate) {
              const annotated = await captureAnnotatedScreenshot(effectiveTabId);
              if (annotated) {
                return {
                  output: `Annotated screenshot with ${annotated.annotations.length} labeled elements:\n${annotated.legend}`,
                  base64Image: annotated.base64Image,
                  imageFormat: annotated.imageFormat
                };
              }
              return await executeScreenshot(effectiveTabId, clickOptions);
            }
            return await executeScreenshot(effectiveTabId, clickOptions);

          case 'wait':
            return await executeWait(toolParams);

          case 'scroll':
            return await executeScroll(
              effectiveTabId,
              toolParams,
              context.permissionManager,
              clickOptions
            );

          case 'key':
            return await executeKey(effectiveTabId, toolParams, requireCurrentUrl());

          case 'left_click_drag':
            return await executeDrag(effectiveTabId, toolParams, requireCurrentUrl(), clickOptions);

          case 'double_click':
            return await executeClick(
              effectiveTabId,
              toolParams,
              2,
              requireCurrentUrl(),
              clickOptions,
              context.permissionManager
            );

          case 'triple_click':
            return await executeClick(
              effectiveTabId,
              toolParams,
              3,
              requireCurrentUrl(),
              clickOptions,
              context.permissionManager
            );

          case 'zoom':
            return await executeZoom(effectiveTabId, toolParams);

          case 'scroll_to':
            return await executeScrollTo(effectiveTabId, toolParams, requireCurrentUrl());

          case 'hover':
            return await executeHover(
              effectiveTabId,
              toolParams,
              requireCurrentUrl(),
              clickOptions
            );

          default:
            throw new Error(`Unsupported action: ${toolParams.action}`);
        }
      };

      if (canOpenNewTabFromInteraction(toolParams.action)) {
        cdpDebugger.clearWindowOpenEvents(effectiveTabId);
        try {
          await cdpDebugger.enablePageEvents(effectiveTabId);
        } catch {
          // Page.windowOpen is a best-effort fallback; normal input still runs without it.
        }

        const navigationPolicy: NavigationPolicyContext = {
          permissionManager: context.permissionManager,
          toolUseId: context.toolUseId,
          toolName: 'computer'
        };
        tabGroupManager.rememberChildTabNavigationPolicy(effectiveTabId, navigationPolicy);
        // Run the real interaction first (so SPA/onsubmit handlers and the actual
        // typed value drive the navigation), then isolate whatever navigation it
        // produced — adopted popups, window.open events, or an in-place search
        // result — into a grouped child tab under the navigation policy.
        result = await tabGroupManager.withPreservedActiveTab(effectiveTabId, runAction);
        await new Promise((resolve) => setTimeout(resolve, 150));
        let adoptedTabIds = await filterPolicyAllowedTabs(
          await tabGroupManager.adoptChildTabsFromOpener(effectiveTabId),
          navigationPolicy
        );
        if (adoptedTabIds.length === 0) {
          adoptedTabIds = await createTabsForWindowOpenEvents(
            effectiveTabId,
            requireCurrentUrl(),
            navigationPolicy
          );
        } else {
          cdpDebugger.consumeWindowOpenEvents(effectiveTabId);
        }
        if (canTriggerSearchNavigationIsolation(toolParams)) {
          const searchTabIds = await moveSearchNavigationToNewTab({
            openerTabId: effectiveTabId,
            previousUrl: requireCurrentUrl(),
            timeoutMs: 1800,
            policy: navigationPolicy
          });
          for (const tabId of searchTabIds) {
            if (!adoptedTabIds.includes(tabId)) adoptedTabIds.push(tabId);
          }
        }
        if (adoptedTabIds.length > 0) {
          openedTabIdsForContext = adoptedTabIds;
          const suffix = `Opened new tab${adoptedTabIds.length === 1 ? '' : 's'} in current group: ${adoptedTabIds.join(', ')}`;
          result = {
            ...result,
            output: result.output ? `${result.output}\n${suffix}` : suffix
          };
        }
      } else {
        result = await runAction();
      }

      const availableTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);
      const executedOnTabId =
        openedTabIdsForContext.length > 0
          ? openedTabIdsForContext[openedTabIdsForContext.length - 1]
          : effectiveTabId;

      let afterUrl: string | undefined;
      try {
        const afterTab = await chrome.tabs.get(effectiveTabId);
        afterUrl = afterTab?.url;
      } catch {
        afterUrl = undefined;
      }
      const beforeAfterUrlSame = !!beforeUrl && beforeUrl === afterUrl;
      recordEvent({
        domain: 'input',
        event: 'input.action.end',
        ids: { toolUseId: context.toolUseId, tabId: effectiveTabId },
        data: {
          action: inputAction,
          success: !result.error,
          durationMs: Date.now() - inputStartTime,
          beforeAfterUrlSame,
          pageChanged: !beforeAfterUrlSame,
          beforeUrl: beforeUrl ? redactUrl(beforeUrl) : undefined,
          afterUrl: afterUrl ? redactUrl(afterUrl) : undefined
        }
      });

      if (inputAction === 'screenshot' && result?.base64Image) {
        void recordArtifact({
          type: 'screenshot',
          ids: { toolUseId: context.toolUseId, tabId: effectiveTabId },
          mimeType: result.imageFormat ? `image/${result.imageFormat}` : 'image/png',
          content: result.base64Image
        });
      }

      return {
        ...result,
        tabContext: {
          currentTabId: context.tabId,
          executedOnTabId,
          availableTabs,
          tabCount: availableTabs.length
        }
      };
    } catch (error) {
      recordError(
        'input',
        'input.action.end',
        error,
        { toolUseId: context?.toolUseId, tabId: context?.tabId },
        { action: params?.action, durationMs: 0 }
      );
      return {
        error: `Failed to execute action: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'computer',
    description:
      "Use a mouse and keyboard to interact with a web browser, and take screenshots. If you don't have a valid tab ID, use tabs_context first to get available tabs.\n* For click actions, ALWAYS prefer using `ref` from read_page or find tools. ref-based clicks are more accurate and work with all AI models. Workflow: call read_page first to get element refs, then click using the ref.\n* Only use `coordinate` as a last resort when ref is unavailable (e.g., canvas, image maps, or custom-rendered graphics).\n* If you tried clicking on a program or link but it failed to load, even after waiting, try calling read_page again to get fresh refs and retry.\n* Make sure to click any buttons, links, icons, etc with the cursor tip in the center of the element. Don't click boxes on their edges unless asked.",
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'left_click',
            'right_click',
            'type',
            'screenshot',
            'wait',
            'scroll',
            'key',
            'left_click_drag',
            'double_click',
            'triple_click',
            'zoom',
            'scroll_to',
            'hover'
          ],
          description:
            'The action to perform:\n* `left_click`: Click an element. Use `ref` from read_page (preferred) or `coordinate` as fallback.\n* `right_click`: Right-click an element. Use `ref` (preferred) or `coordinate`.\n* `double_click`: Double-click an element. Use `ref` (preferred) or `coordinate`.\n* `triple_click`: Triple-click an element. Use `ref` (preferred) or `coordinate`.\n* `type`: Type a string of text.\n* `screenshot`: Take a screenshot of the screen.\n* `wait`: Wait for a specified number of seconds.\n* `scroll`: Scroll up, down, left, or right at the specified coordinates.\n* `key`: Press a specific keyboard key.\n* `left_click_drag`: Drag from start_coordinate to coordinate.\n* `zoom`: Take a screenshot of a specific region for closer inspection.\n* `scroll_to`: Scroll an element into view using its element reference ID from read_page or find tools.\n* `hover`: Move the mouse cursor to the specified coordinates or element without clicking. Useful for revealing tooltips, dropdown menus, or triggering hover states.'
        },
        coordinate: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
          description:
            '(x, y): Fallback coordinate method — only use when ref is unavailable (canvas, image maps, custom-rendered graphics). The x (pixels from the left edge) and y (pixels from the top edge) coordinates. Required for `left_click`, `right_click`, `double_click`, `triple_click`, and `scroll`. For `left_click_drag`, this is the end position. For click actions, prefer `ref` instead.'
        },
        text: {
          type: 'string',
          description:
            'The text to type (for `type` action) or the key(s) to press (for `key` action). For `key` action: Provide space-separated keys (e.g., "Backspace Backspace Delete"). Supports keyboard shortcuts using the platform\'s modifier key (use "cmd" on Mac, "ctrl" on Windows/Linux, e.g., "cmd+a" or "ctrl+a" for select all).'
        },
        duration: {
          type: 'number',
          minimum: 0,
          maximum: 30,
          description: 'The number of seconds to wait. Required for `wait`. Maximum 30 seconds.'
        },
        scroll_direction: {
          type: 'string',
          enum: ['up', 'down', 'left', 'right'],
          description: 'The direction to scroll. Required for `scroll`.'
        },
        scroll_amount: {
          type: 'number',
          minimum: 1,
          maximum: 10,
          description: 'The number of scroll wheel ticks. Optional for `scroll`, defaults to 3.'
        },
        start_coordinate: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
          description: '(x, y): The starting coordinates for `left_click_drag`.'
        },
        region: {
          type: 'array',
          items: { type: 'number' },
          minItems: 4,
          maxItems: 4,
          description:
            '(x0, y0, x1, y1): The rectangular region to capture for `zoom`. Coordinates define a rectangle from top-left (x0, y0) to bottom-right (x1, y1) in pixels from the viewport origin. Required for `zoom` action. Useful for inspecting small UI elements like icons, buttons, or text.'
        },
        repeat: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description:
            'Number of times to repeat the key sequence. Only applicable for `key` action. Must be a positive integer between 1 and 100. Default is 1. Useful for navigation tasks like pressing arrow keys multiple times.'
        },
        ref: {
          type: 'string',
          description:
            'PREFERRED: Element reference ID from read_page or find tools (e.g., "ref_1", "ref_2"). Always prefer ref over coordinate for clicks — it is more accurate and model-independent. Required for `scroll_to` action. For click actions, use ref instead of coordinate whenever possible.'
        },
        modifiers: {
          type: 'string',
          description:
            'Modifier keys for click actions. Supports: "ctrl", "shift", "alt", "cmd" (or "meta"), "win" (or "windows"). Can be combined with "+" (e.g., "ctrl+shift", "cmd+alt"). Optional.'
        },
        tabId: {
          type: 'number',
          description:
            "Tab ID to execute the action on. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
        },
        annotate: {
          type: 'boolean',
          description:
            'For screenshot action only. When true, overlays numbered labels on interactive elements. Each number maps to a ref_N from read_page.'
        }
      },
      required: ['action', 'tabId']
    }
  })
};
