import { PermissionActionType } from '../extensionServices';
import { PermissionTools, checkUrlSecurity, screenshotContextManager } from './shared';
import { tabGroupManager } from './tabState';
import {
  cdpDebugger,
  checkDomainSecurity,
  generateUniqueId,
  screenshotToViewportCoords,
  scrollViaContentScript
} from './cdp';
import type {
  CdpCaptureScreenshotResult,
  CdpDomDescribeNodeResult,
  CdpDomGetContentQuadsResult,
  CdpDomGetFrameOwnerResult,
  CdpPageFrameTreeNode,
  CdpPageGetFrameTreeResult
} from './cdpTypes';
import { resolveStaleRef, getRefBackendNodeId } from './refBridge';
import type { ToolContext, ToolDefinition, ToolResult } from './pageTools';

interface ComputerToolParams {
  action: string;
  coordinate?: [number, number];
  text?: string;
  duration?: number;
  scroll_direction?: string;
  scroll_amount?: number;
  start_coordinate?: [number, number];
  region?: [number, number, number, number];
  repeat?: number;
  ref?: string;
  modifiers?: string;
  tabId?: number;
}

interface ClickOptions {
  skipIndicator?: boolean;
}

type FormInputValue = string | number | boolean;

interface FormInputToolParams {
  ref: string;
  value: FormInputValue;
  tabId?: number;
}

interface FormInputScriptResult extends ToolResult {
  success?: boolean;
  action?: string;
  ref?: string;
  element_type?: string;
  previous_value?: string | boolean;
  new_value?: string | boolean;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isScrollToRefResult(value: unknown): value is ScrollToRefResult {
  return (
    isRecord(value) &&
    typeof value.success === 'boolean' &&
    (value.error === undefined || typeof value.error === 'string') &&
    (value.coordinates === undefined ||
      (Array.isArray(value.coordinates) &&
        value.coordinates.length === 2 &&
        value.coordinates.every((entry) => typeof entry === 'number')))
  );
}

function isFormInputScriptResult(value: unknown): value is FormInputScriptResult {
  return (
    isRecord(value) &&
    (value.error === undefined || typeof value.error === 'string') &&
    (value.success === undefined || typeof value.success === 'boolean') &&
    (value.action === undefined || typeof value.action === 'string') &&
    (value.ref === undefined || typeof value.ref === 'string') &&
    (value.element_type === undefined || typeof value.element_type === 'string') &&
    (value.previous_value === undefined ||
      typeof value.previous_value === 'string' ||
      typeof value.previous_value === 'boolean') &&
    (value.new_value === undefined ||
      typeof value.new_value === 'string' ||
      typeof value.new_value === 'boolean') &&
    (value.message === undefined || typeof value.message === 'string') &&
    (value.output === undefined || typeof value.output === 'string')
  );
}

type PermissionManagerLike = ToolContext['permissionManager'];

// ToolContext and ToolResult interfaces defined below in the tool definitions section

const computerTool: ToolDefinition<ComputerToolParams> = {
  name: 'computer',
  description:
    "Use a mouse and keyboard to interact with a web browser, and take screenshots. If you don't have a valid tab ID, use tabs_context first to get available tabs.\n* The screen's resolution is {self.display_width_px}x{self.display_height_px}.\n* Whenever you intend to click on an element like an icon, you should consult a screenshot to determine the coordinates of the element before moving the cursor.\n* If you tried clicking on a program or link but it failed to load, even after waiting, try adjusting your click location so that the tip of the cursor visually falls on the element that you want to click.\n* Make sure to click any buttons, links, icons, etc with the cursor tip in the center of the element. Don't click boxes on their edges unless asked.",
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
        'The action to perform:\n* `left_click`: Click the left mouse button at the specified coordinates.\n* `right_click`: Click the right mouse button at the specified coordinates to open context menus.\n* `double_click`: Double-click the left mouse button at the specified coordinates.\n* `triple_click`: Triple-click the left mouse button at the specified coordinates.\n* `type`: Type a string of text.\n* `screenshot`: Take a screenshot of the screen.\n* `wait`: Wait for a specified number of seconds.\n* `scroll`: Scroll up, down, left, or right at the specified coordinates.\n* `key`: Press a specific keyboard key.\n* `left_click_drag`: Drag from start_coordinate to coordinate.\n* `zoom`: Take a screenshot of a specific region and scale it to fill the viewport.\n* `scroll_to`: Scroll an element into view using its element reference ID from read_page or find tools.\n* `hover`: Move the mouse cursor to the specified coordinates or element without clicking. Useful for revealing tooltips, dropdown menus, or triggering hover states.'
    },
    coordinate: {
      type: 'array',
      items: { type: 'number' },
      minItems: 2,
      maxItems: 2,
      description:
        '(x, y): The x (pixels from the left edge) and y (pixels from the top edge) coordinates. Required for `scroll` and `left_click_drag`. For click actions (left_click, right_click, double_click, triple_click), either `coordinate` or `ref` must be provided (not both).'
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
        'Element reference ID from read_page or find tools (e.g., "ref_1", "ref_2"). Required for `scroll_to` action. Can be used as alternative to `coordinate` for click actions (left_click, right_click, double_click, triple_click).'
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
      const clickOptions = context.skipIndicator ? { skipIndicator: true } : undefined;

      switch (toolParams.action) {
        case 'left_click':
        case 'right_click':
          result = await executeClick(
            effectiveTabId,
            toolParams,
            1,
            requireCurrentUrl(),
            clickOptions
          );
          break;

        case 'type':
          result = await executeType(effectiveTabId, toolParams, requireCurrentUrl());
          break;

        case 'screenshot':
          result = await executeScreenshot(effectiveTabId, clickOptions);
          break;

        case 'wait':
          result = await executeWait(toolParams);
          break;

        case 'scroll':
          result = await executeScroll(
            effectiveTabId,
            toolParams,
            context.permissionManager,
            clickOptions
          );
          break;

        case 'key':
          result = await executeKey(effectiveTabId, toolParams, requireCurrentUrl());
          break;

        case 'left_click_drag':
          result = await executeDrag(effectiveTabId, toolParams, requireCurrentUrl());
          break;

        case 'double_click':
          result = await executeClick(
            effectiveTabId,
            toolParams,
            2,
            requireCurrentUrl(),
            clickOptions
          );
          break;

        case 'triple_click':
          result = await executeClick(
            effectiveTabId,
            toolParams,
            3,
            requireCurrentUrl(),
            clickOptions
          );
          break;

        case 'zoom':
          result = await executeZoom(effectiveTabId, toolParams);
          break;

        case 'scroll_to':
          result = await executeScrollTo(effectiveTabId, toolParams, requireCurrentUrl());
          break;

        case 'hover':
          result = await executeHover(effectiveTabId, toolParams, requireCurrentUrl());
          break;

        default:
          throw new Error(`Unsupported action: ${toolParams.action}`);
      }

      const availableTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);
      return {
        ...result,
        tabContext: {
          currentTabId: context.tabId,
          executedOnTabId: effectiveTabId,
          availableTabs,
          tabCount: availableTabs.length
        }
      };
    } catch (error) {
      return {
        error: `Failed to execute action: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'computer',
    description:
      "Use a mouse and keyboard to interact with a web browser, and take screenshots. If you don't have a valid tab ID, use tabs_context first to get available tabs.\n* Whenever you intend to click on an element like an icon, you should consult a screenshot to determine the coordinates of the element before moving the cursor.\n* If you tried clicking on a program or link but it failed to load, even after waiting, try adjusting your click location so that the tip of the cursor visually falls on the element that you want to click.\n* Make sure to click any buttons, links, icons, etc with the cursor tip in the center of the element. Don't click boxes on their edges unless asked.",
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
            'The action to perform:\n* `left_click`: Click the left mouse button at the specified coordinates.\n* `right_click`: Click the right mouse button at the specified coordinates to open context menus.\n* `double_click`: Double-click the left mouse button at the specified coordinates.\n* `triple_click`: Triple-click the left mouse button at the specified coordinates.\n* `type`: Type a string of text.\n* `screenshot`: Take a screenshot of the screen.\n* `wait`: Wait for a specified number of seconds.\n* `scroll`: Scroll up, down, left, or right at the specified coordinates.\n* `key`: Press a specific keyboard key.\n* `left_click_drag`: Drag from start_coordinate to coordinate.\n* `zoom`: Take a screenshot of a specific region for closer inspection.\n* `scroll_to`: Scroll an element into view using its element reference ID from read_page or find tools.\n* `hover`: Move the mouse cursor to the specified coordinates or element without clicking. Useful for revealing tooltips, dropdown menus, or triggering hover states.'
        },
        coordinate: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
          description:
            '(x, y): The x (pixels from the left edge) and y (pixels from the top edge) coordinates. Required for `left_click`, `right_click`, `double_click`, `triple_click`, and `scroll`. For `left_click_drag`, this is the end position.'
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
            'Element reference ID from read_page or find tools (e.g., "ref_1", "ref_2"). Required for `scroll_to` action. Can be used as alternative to `coordinate` for click actions.'
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
        }
      },
      required: ['action', 'tabId']
    }
  })
};

// --- scrollToElementByRef helper (te) ---

function pickFrameResult<T extends { error?: string }>(
  results: chrome.scripting.InjectionResult[],
  isResult: (value: unknown) => value is T
): T | null {
  for (const sr of results) {
    const r = sr.result;
    if (!isResult(r)) continue;
    if (r && !r.error?.includes('No element found')) return r;
  }
  const firstResult = results[0]?.result;
  return isResult(firstResult) ? firstResult : null;
}

async function execWithStaleRecovery<T extends { error?: string }, TArgs extends unknown[]>(
  tabId: number,
  ref: string,
  func: (...args: TArgs) => T,
  args: TArgs,
  isResult: (value: unknown) => value is T
): Promise<T | null> {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func,
    args
  });
  if (!results?.length) return null;

  let result = pickFrameResult(results, isResult);

  if (result?.error?.includes('No element found')) {
    const recovered = await resolveStaleRef(tabId, ref);
    if (recovered) {
      const retryResults = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func,
        args
      });
      if (retryResults?.length) {
        const retryResult = pickFrameResult(retryResults, isResult);
        if (retryResult) result = retryResult;
      }
    }
  }

  return result;
}

interface ScrollToRefResult {
  success: boolean;
  error?: string;
  coordinates?: [number, number];
}

/**
 * 计算 backendNodeId 所在 frame 相对主框架的累积 offset。
 * 主框架返回 (0, 0)；任一环节失败返回 null，由调用方决定是否降级。
 *
 * 实现要点：先一次性从 Page.getFrameTree 构建 child→parent 映射，避免逐跳 describeNode。
 * 每跳 owner 元素本身位于父 frame，其位置由父 frame 的 DOM.getContentQuads 给出。
 */
async function getFrameOffsetForNode(
  tabId: number,
  backendNodeId: number
): Promise<{ x: number; y: number } | null> {
  try {
    const [desc, frameTree] = await Promise.all([
      cdpDebugger.sendCommand<CdpDomDescribeNodeResult>(tabId, 'DOM.describeNode', {
        backendNodeId
      }),
      cdpDebugger.sendCommand<CdpPageGetFrameTreeResult>(tabId, 'Page.getFrameTree')
    ]);
    let frameId: string | undefined = desc?.node?.frameId;
    if (!frameId) return { x: 0, y: 0 };

    const mainFrameId: string | undefined = frameTree?.frameTree?.frame?.id;
    if (!mainFrameId) return null;

    const parentOf = new Map<string, string>();
    const walk = (node?: CdpPageFrameTreeNode) => {
      const pid = node?.frame?.id;
      if (!pid) return;
      for (const child of node.childFrames ?? []) {
        if (child?.frame?.id) parentOf.set(child.frame.id, pid);
        walk(child);
      }
    };
    walk(frameTree?.frameTree);

    let offsetX = 0;
    let offsetY = 0;
    // 最多 16 跳：防御异常的 frame 树（如循环引用）导致死循环，正常嵌套远不会到这个深度。
    for (let hop = 0; hop < 16 && frameId !== mainFrameId; hop++) {
      const owner = await cdpDebugger.sendCommand<CdpDomGetFrameOwnerResult>(
        tabId,
        'DOM.getFrameOwner',
        { frameId }
      );
      const ownerBackendNodeId: number | undefined = owner?.backendNodeId;
      if (!ownerBackendNodeId) return null;

      const quads = await cdpDebugger.sendCommand<CdpDomGetContentQuadsResult>(
        tabId,
        'DOM.getContentQuads',
        {
          backendNodeId: ownerBackendNodeId
        }
      );
      const quad = quads?.quads?.[0];
      if (!quad) return null;
      offsetX += quad[0];
      offsetY += quad[1];

      const parent = parentOf.get(frameId);
      if (!parent) return null;
      frameId = parent;
    }

    return { x: offsetX, y: offsetY };
  } catch {
    return null;
  }
}

async function scrollToElementByRef(tabId: number, ref: string): Promise<ScrollToRefResult> {
  const scrollScript = (elementRef: string) => {
    try {
      let element: Element | null = null;
      if (window.__superduckElementMap?.[elementRef]) {
        element = window.__superduckElementMap[elementRef].deref() || null;
        if (!element || !document.contains(element)) {
          delete window.__superduckElementMap[elementRef];
          element = null;
        }
      }

      if (!element) {
        return {
          success: false,
          error: `No element found with reference: "${elementRef}". The element may have been removed from the page.`
        };
      }

      element.scrollIntoView({
        behavior: 'instant',
        block: 'center',
        inline: 'center'
      });

      if (element instanceof HTMLElement) {
        element.offsetHeight; // force reflow
      }

      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      return { success: true, coordinates: [centerX, centerY] as [number, number] };
    } catch (err) {
      return {
        success: false,
        error: `Error getting element coordinates: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  };

  try {
      const result = await execWithStaleRecovery<ScrollToRefResult, [string]>(
        tabId,
        ref,
        scrollScript,
        [ref],
        isScrollToRefResult
      );

    if (!result) {
      return { success: false, error: 'Failed to execute script to get element coordinates' };
    }
    if (!result.success) return result;

    // 统一以 backendNodeId 为基准计算坐标，保证 iframe 与主框架一致：
    // 1) 优先 CDP DOM.getContentQuads（对 CSS transform/clip 更稳），否则退回 content script 返回的
    //    iframe-local 坐标；
    // 2) 两者都是节点所在 document 的本地坐标，最后叠加该 document 相对主框架的累积 offset，
    //    得到主框架坐标供上层 left_click 使用。
    const backendNodeId = getRefBackendNodeId(tabId, ref);
    let localCoords: [number, number] | null = result.coordinates ?? null;

    if (backendNodeId !== null) {
      try {
        const quads = await cdpDebugger.sendCommand<CdpDomGetContentQuadsResult>(
          tabId,
          'DOM.getContentQuads',
          { backendNodeId }
        );
        const quad = quads?.quads?.[0];
        if (quad) {
          localCoords = [
            (quad[0] + quad[2] + quad[4] + quad[6]) / 4,
            (quad[1] + quad[3] + quad[5] + quad[7]) / 4
          ];
        }
      } catch {
        // 使用 content script 返回的本地坐标
      }

      const offset = await getFrameOffsetForNode(tabId, backendNodeId);
      if (offset && localCoords) {
        return { success: true, coordinates: [localCoords[0] + offset.x, localCoords[1] + offset.y] };
      }
      // offset 解析失败且元素在 iframe：本地坐标不可直接用于主框架点击。仍返回本地坐标，
      // 与改造前行为一致（只点主框架可用，iframe 情况原本就错），避免整个 ref 操作失败。
    }

    return localCoords ? { success: true, coordinates: localCoords } : result;
  } catch (error) {
    return {
      success: false,
      error: `Failed to get element coordinates from ref: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// --- Modifier parsing helpers ---
function parseModifierKeys(modifierString: string): string[] {
  const parts = modifierString.toLowerCase().split('+');
  const validModifiers = [
    'ctrl',
    'control',
    'alt',
    'shift',
    'cmd',
    'meta',
    'command',
    'win',
    'windows'
  ];
  return parts.filter((part) => validModifiers.includes(part.trim()));
}

function computeModifiersBitmask(modifiers: string[]): number {
  const modifierMap: Record<string, number> = {
    alt: 1,
    ctrl: 2,
    control: 2,
    meta: 4,
    cmd: 4,
    command: 4,
    win: 4,
    windows: 4,
    shift: 8
  };
  let bitmask = 0;
  for (const mod of modifiers) {
    bitmask |= modifierMap[mod] || 0;
  }
  return bitmask;
}

// --- executeClick helper (re) ---
async function executeClick(
  tabId: number,
  params: ComputerToolParams,
  clickCount: number = 1,
  currentUrl?: string,
  options?: ClickOptions
): Promise<ToolResult> {
  let x: number;
  let y: number;

  if (params.ref) {
    const refResult = await scrollToElementByRef(tabId, params.ref);
    if (!refResult.success) return { error: refResult.error };
    [x, y] = refResult.coordinates!;
  } else {
    if (!params.coordinate)
      throw new Error('Either ref or coordinate parameter is required for click action');
    [x, y] = params.coordinate;
    const context = screenshotContextManager.getContext(tabId);
    if (context) {
      const [mappedX, mappedY] = screenshotToViewportCoords(x, y, context);
      x = mappedX;
      y = mappedY;
    }
  }

  const button = params.action === 'right_click' ? 'right' : 'left';
  let modifiers = 0;

  if (params.modifiers) {
    modifiers = computeModifiersBitmask(parseModifierKeys(params.modifiers));
  }

  try {
    const securityCheck = await checkDomainSecurity(tabId, currentUrl, 'click action');
    if (securityCheck) return securityCheck;

    await cdpDebugger.click(tabId, x, y, button, clickCount, modifiers, options);

    const clickLabel =
      clickCount === 1 ? 'Clicked' : clickCount === 2 ? 'Double-clicked' : 'Triple-clicked';
    if (params.ref) {
      return { output: `${clickLabel} on element ${params.ref}` };
    }
    return {
      output: `${clickLabel} at (${Math.round(params.coordinate![0])}, ${Math.round(params.coordinate![1])})`
    };
  } catch (error) {
    return { error: `Error clicking: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

// --- executeScreenshot helper (oe) ---
async function executeScreenshot(tabId: number, options?: ClickOptions): Promise<ToolResult> {
  try {
    const screenshotResult = await cdpDebugger.screenshot(tabId, undefined, options);
    const screenshotId = generateUniqueId();
    console.info(`[Computer Tool] Generated screenshot ID: ${screenshotId}`);
    console.info(
      `[Computer Tool] Screenshot dimensions: ${screenshotResult.width}x${screenshotResult.height}`
    );
    return {
      output: `Successfully captured screenshot (${screenshotResult.width}x${screenshotResult.height}, ${screenshotResult.format}) - ID: ${screenshotId}`,
      base64Image: screenshotResult.base64,
      imageFormat: screenshotResult.format,
      imageId: screenshotId
    };
  } catch (error) {
    return {
      error: `Error capturing screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// --- getScrollPosition helper (ne) ---
async function getScrollPosition(tabId: number): Promise<{ x: number; y: number }> {
  const scriptResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      x: window.pageXOffset || document.documentElement.scrollLeft,
      y: window.pageYOffset || document.documentElement.scrollTop
    })
  });
  if (!scriptResults || !scriptResults[0]?.result) {
    throw new Error('Failed to get scroll position');
  }
  return scriptResults[0].result;
}

// --- executeType helper ---
async function executeType(
  tabId: number,
  params: ComputerToolParams,
  currentUrl: string
): Promise<ToolResult> {
  if (!params.text) throw new Error('Text parameter is required for type action');
  try {
    const securityCheck = await checkDomainSecurity(tabId, currentUrl, 'type action');
    if (securityCheck) return securityCheck;
    await cdpDebugger.type(tabId, params.text);
    return { output: `Typed "${params.text}"` };
  } catch (error) {
    return { error: `Failed to type: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

// --- executeWait helper ---
async function executeWait(params: ComputerToolParams): Promise<ToolResult> {
  if (!params.duration || params.duration <= 0)
    throw new Error('Duration parameter is required and must be positive');
  if (params.duration > 30) throw new Error('Duration cannot exceed 30 seconds');
  const ms = Math.round(1000 * params.duration);
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
  return { output: `Waited for ${params.duration} second${params.duration === 1 ? '' : 's'}` };
}

// --- executeScroll helper ---
async function executeScroll(
  tabId: number,
  params: ComputerToolParams,
  permissionManager: PermissionManagerLike,
  options?: ClickOptions
): Promise<ToolResult> {
  if (!params.coordinate || params.coordinate.length !== 2) {
    throw new Error('Coordinate parameter is required for scroll action');
  }

  let [x, y] = params.coordinate;
  const context = screenshotContextManager.getContext(tabId);
  if (context) {
    const [mappedX, mappedY] = screenshotToViewportCoords(x, y, context);
    x = mappedX;
    y = mappedY;
  }

  const direction = params.scroll_direction || 'down';
  const amount = params.scroll_amount || 3;

  const manageIndicator = !options?.skipIndicator;
  if (manageIndicator) {
    await tabGroupManager.hideIndicatorForToolUse(tabId);
  }

  try {
    let deltaX = 0;
    let deltaY = 0;
    const pixelsPerTick = 100;

    switch (direction) {
      case 'up':
        deltaY = -amount * pixelsPerTick;
        break;
      case 'down':
        deltaY = amount * pixelsPerTick;
        break;
      case 'left':
        deltaX = -amount * pixelsPerTick;
        break;
      case 'right':
        deltaX = amount * pixelsPerTick;
        break;
      default:
        throw new Error(`Invalid scroll direction: ${direction}`);
    }

    if (options?.skipIndicator) {
      await cdpDebugger.scrollWheel(tabId, x, y, deltaX, deltaY);
    } else {
      const scrollBefore = await getScrollPosition(tabId);
      const tabInfo = await chrome.tabs.get(tabId);

      if (tabInfo.active ?? false) {
        try {
          const scrollPromise = cdpDebugger.scrollWheel(tabId, x, y, deltaX, deltaY);
          const timeoutPromise = new Promise<never>((_resolve, reject) => {
            setTimeout(() => reject(new Error('Scroll timeout')), 5000);
          });
          await Promise.race([scrollPromise, timeoutPromise]);
          await new Promise<void>((resolve) => setTimeout(resolve, 200));

          const scrollAfter = await getScrollPosition(tabId);
          if (
            !(
              Math.abs(scrollAfter.x - scrollBefore.x) > 5 ||
              Math.abs(scrollAfter.y - scrollBefore.y) > 5
            )
          ) {
            throw new Error('CDP scroll ineffective');
          }
        } catch (_err) {
          await scrollViaContentScript(tabId, x, y, deltaX, deltaY);
          await new Promise<void>((resolve) => setTimeout(resolve, 200));
        }
      } else {
        await scrollViaContentScript(tabId, x, y, deltaX, deltaY);
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
      }
    }

    if (!options?.skipIndicator) {
      const postScrollScreenshot = await tryTakePostScrollScreenshot(
        tabId,
        permissionManager,
        options
      );
      return {
        output: `Scrolled ${direction} by ${amount} ticks at (${x}, ${y})`,
        ...(postScrollScreenshot && {
          base64Image: postScrollScreenshot.base64Image,
          imageFormat: postScrollScreenshot.imageFormat
        })
      };
    }

    return { output: `Scrolled ${direction} by ${amount} ticks at (${x}, ${y})` };
  } catch (error) {
    return {
      error: `Error scrolling: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  } finally {
    if (manageIndicator) {
      await tabGroupManager.restoreIndicatorAfterToolUse(tabId);
    }
  }
}

// --- tryTakePostScrollScreenshot helper ---
async function tryTakePostScrollScreenshot(
  tabId: number,
  permissionManager: PermissionManagerLike,
  options?: ClickOptions
): Promise<{ base64Image: string; imageFormat: string } | undefined> {
  try {
    const tabInfo = await chrome.tabs.get(tabId);
    if (!tabInfo?.url) return undefined;

    const permResult = await permissionManager.checkPermission(tabInfo.url, undefined);
    if (!permResult.allowed) return undefined;

    try {
      const screenshot = await executeScreenshot(tabId, options);
      return { base64Image: screenshot.base64Image!, imageFormat: screenshot.imageFormat || 'png' };
    } catch (_err) {
      return undefined;
    }
  } catch (_err) {
    return undefined;
  }
}

// --- executeKey helper ---
async function executeKey(
  tabId: number,
  params: ComputerToolParams,
  currentUrl: string
): Promise<ToolResult> {
  if (!params.text) throw new Error('Text parameter is required for key action');

  const repeatCount = params.repeat ?? 1;
  if (!Number.isInteger(repeatCount) || repeatCount < 1)
    throw new Error('Repeat parameter must be a positive integer');
  if (repeatCount > 100) throw new Error('Repeat parameter cannot exceed 100');

  try {
    const securityCheck = await checkDomainSecurity(tabId, currentUrl, 'key action');
    if (securityCheck) return securityCheck;

    const keyInputs = params.text
      .trim()
      .split(/\s+/)
      .filter((k) => k.length > 0);
    console.info({ keyInputs });

    // Handle page reload shortcuts
    if (keyInputs.length === 1) {
      const singleKey = keyInputs[0].toLowerCase();
      if (
        singleKey === 'cmd+r' ||
        singleKey === 'cmd+shift+r' ||
        singleKey === 'ctrl+r' ||
        singleKey === 'ctrl+shift+r' ||
        singleKey === 'f5' ||
        singleKey === 'ctrl+f5' ||
        singleKey === 'shift+f5'
      ) {
        const isHardReload =
          singleKey === 'cmd+shift+r' ||
          singleKey === 'ctrl+shift+r' ||
          singleKey === 'ctrl+f5' ||
          singleKey === 'shift+f5';
        await chrome.tabs.reload(tabId, { bypassCache: isHardReload });
        const reloadType = isHardReload ? 'hard reload' : 'reload';
        return { output: `Executed ${keyInputs[0]} (${reloadType} page)` };
      }
    }

    for (let i = 0; i < repeatCount; i++) {
      for (const keyInput of keyInputs) {
        if (keyInput.includes('+')) {
          await cdpDebugger.pressKeyChord(tabId, keyInput);
        } else {
          const keyCode = cdpDebugger.getKeyCode(keyInput);
          if (keyCode) {
            await cdpDebugger.pressKey(tabId, keyCode);
          } else {
            await cdpDebugger.insertText(tabId, keyInput);
          }
        }
      }
    }

    const repeatSuffix = repeatCount > 1 ? ` (repeated ${repeatCount} times)` : '';
    return {
      output: `Pressed ${keyInputs.length} key${keyInputs.length === 1 ? '' : 's'}: ${keyInputs.join(' ')}${repeatSuffix}`
    };
  } catch (error) {
    return {
      error: `Error pressing key: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// --- executeDrag helper ---
async function executeDrag(
  tabId: number,
  params: ComputerToolParams,
  currentUrl: string
): Promise<ToolResult> {
  if (!params.start_coordinate || params.start_coordinate.length !== 2) {
    throw new Error('start_coordinate parameter is required for left_click_drag action');
  }
  if (!params.coordinate || params.coordinate.length !== 2) {
    throw new Error('coordinate parameter (end position) is required for left_click_drag action');
  }

  let [startX, startY] = params.start_coordinate;
  let [endX, endY] = params.coordinate;

  const context = screenshotContextManager.getContext(tabId);
  if (context) {
    const [mappedStartX, mappedStartY] = screenshotToViewportCoords(startX, startY, context);
    const [mappedEndX, mappedEndY] = screenshotToViewportCoords(endX, endY, context);
    startX = mappedStartX;
    startY = mappedStartY;
    endX = mappedEndX;
    endY = mappedEndY;
  }

  try {
    const securityCheck = await checkDomainSecurity(tabId, currentUrl, 'drag action');
    if (securityCheck) return securityCheck;

    await tabGroupManager.hideIndicatorForToolUse(tabId);
    try {
      await cdpDebugger.dispatchMouseEvent(tabId, {
        type: 'mouseMoved',
        x: startX,
        y: startY,
        button: 'none',
        buttons: 0,
        modifiers: 0
      });
      await cdpDebugger.dispatchMouseEvent(tabId, {
        type: 'mousePressed',
        x: startX,
        y: startY,
        button: 'left',
        buttons: 1,
        clickCount: 1,
        modifiers: 0
      });
      await cdpDebugger.dispatchMouseEvent(tabId, {
        type: 'mouseMoved',
        x: endX,
        y: endY,
        button: 'left',
        buttons: 1,
        modifiers: 0
      });
      await cdpDebugger.dispatchMouseEvent(tabId, {
        type: 'mouseReleased',
        x: endX,
        y: endY,
        button: 'left',
        buttons: 0,
        clickCount: 1,
        modifiers: 0
      });
    } finally {
      await tabGroupManager.restoreIndicatorAfterToolUse(tabId);
    }

    return { output: `Dragged from (${startX}, ${startY}) to (${endX}, ${endY})` };
  } catch (error) {
    return {
      error: `Error performing drag: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// --- executeZoom helper ---
async function executeZoom(tabId: number, params: ComputerToolParams): Promise<ToolResult> {
  if (!params.region || params.region.length !== 4) {
    throw new Error('Region parameter is required for zoom action and must be [x0, y0, x1, y1]');
  }

  let [x0, y0, x1, y1] = params.region;
  if (x0 < 0 || y0 < 0 || x1 <= x0 || y1 <= y0) {
    throw new Error(
      'Invalid region coordinates: x0 and y0 must be non-negative, and x1 > x0, y1 > y0'
    );
  }

  try {
    const context = screenshotContextManager.getContext(tabId);
    if (context) {
      const [mappedX0, mappedY0] = screenshotToViewportCoords(x0, y0, context);
      const [mappedX1, mappedY1] = screenshotToViewportCoords(x1, y1, context);
      x0 = mappedX0;
      y0 = mappedY0;
      x1 = mappedX1;
      y1 = mappedY1;
    }

    const viewportResult = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({ width: window.innerWidth, height: window.innerHeight })
    });

    if (!viewportResult || !viewportResult[0]?.result) {
      throw new Error('Failed to get viewport dimensions');
    }

    const { width: vpWidth, height: vpHeight } = viewportResult[0].result;
    if (x1 > vpWidth || y1 > vpHeight) {
      throw new Error(
        `Region exceeds viewport boundaries (${vpWidth}x${vpHeight}). Please choose a region within the visible viewport.`
      );
    }

    const regionWidth = x1 - x0;
    const regionHeight = y1 - y0;

    await tabGroupManager.hideIndicatorForToolUse(tabId);

    try {
      const captureResult = await cdpDebugger.sendCommand<CdpCaptureScreenshotResult>(
        tabId,
        'Page.captureScreenshot',
        {
          format: 'png',
          captureBeyondViewport: false,
          fromSurface: true,
          clip: { x: x0, y: y0, width: regionWidth, height: regionHeight, scale: 1 }
        }
      );

      if (!captureResult || !captureResult.data) {
        throw new Error('Failed to capture zoomed screenshot via CDP');
      }

      return {
        output: `Successfully captured zoomed screenshot of region (${x0},${y0}) to (${x1},${y1}) - ${regionWidth}x${regionHeight} pixels`,
        base64Image: captureResult.data,
        imageFormat: 'png'
      };
    } finally {
      await tabGroupManager.restoreIndicatorAfterToolUse(tabId);
    }
  } catch (error) {
    return {
      error: `Error capturing zoomed screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// --- executeScrollTo helper ---
async function executeScrollTo(
  tabId: number,
  params: ComputerToolParams,
  currentUrl: string
): Promise<ToolResult> {
  if (!params.ref) throw new Error('ref parameter is required for scroll_to action');

  try {
    const securityCheck = await checkDomainSecurity(tabId, currentUrl, 'scroll_to action');
    if (securityCheck) return securityCheck;

    const result = await scrollToElementByRef(tabId, params.ref);
    if (result.success) {
      return { output: `Scrolled to element with reference: ${params.ref}` };
    }
    return { error: result.error };
  } catch (error) {
    return {
      error: `Failed to scroll to element: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// --- executeHover helper ---
async function executeHover(
  tabId: number,
  params: ComputerToolParams,
  currentUrl: string
): Promise<ToolResult> {
  let x: number;
  let y: number;

  if (params.ref) {
    const refResult = await scrollToElementByRef(tabId, params.ref);
    if (!refResult.success) return { error: refResult.error };
    [x, y] = refResult.coordinates!;
  } else {
    if (!params.coordinate)
      throw new Error('Either ref or coordinate parameter is required for hover action');
    [x, y] = params.coordinate;
    const context = screenshotContextManager.getContext(tabId);
    if (context) {
      const [mappedX, mappedY] = screenshotToViewportCoords(x, y, context);
      x = mappedX;
      y = mappedY;
    }
  }

  try {
    const securityCheck = await checkDomainSecurity(tabId, currentUrl, 'hover action');
    if (securityCheck) return securityCheck;

    await tabGroupManager.hideIndicatorForToolUse(tabId);
    try {
      await cdpDebugger.dispatchMouseEvent(tabId, {
        type: 'mouseMoved',
        x,
        y,
        button: 'none',
        buttons: 0,
        modifiers: 0
      });
    } finally {
      await tabGroupManager.restoreIndicatorAfterToolUse(tabId);
    }

    if (params.ref) {
      return { output: `Hovered over element ${params.ref}` };
    }
    return {
      output: `Hovered at (${Math.round(params.coordinate![0])}, ${Math.round(params.coordinate![1])})`
    };
  } catch (error) {
    return { error: `Error hovering: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
} // =============================================================================
// MCP Section: Tool Definitions and Helper Functions
// Converted from the legacy compiled MCP runtime bundle (lines ~3500-6300)

// =============================================================================
// Tool: form_input (Ee)
// =============================================================================

const formInputTool: ToolDefinition<FormInputToolParams> = {
  name: 'form_input',
  description:
    "Set values in form elements using element reference ID from the read_page or find tools. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
  parameters: {
    ref: {
      type: 'string',
      description: 'Element reference ID from the read_page or find tools (e.g., "ref_1", "ref_2")'
    },
    value: {
      type: ['string', 'boolean', 'number'],
      description:
        'The value to set. For checkboxes use boolean, for selects use option value or text, for other inputs use appropriate string/number'
    },
    tabId: {
      type: 'number',
      description:
        "Tab ID to set form value in. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
    }
  },
  execute: async (input: FormInputToolParams, context: ToolContext): Promise<ToolResult> => {
    try {
      const params = input;
      if (!params?.ref) throw new Error('ref parameter is required');
      if (void 0 === params.value || null === params.value)
        throw new Error('Value parameter is required');
      if (!context?.tabId) throw new Error('No active tab found');

      const effectiveTabId = await tabGroupManager.getEffectiveTabId(params.tabId, context.tabId);
      const tab = await chrome.tabs.get(effectiveTabId);
      if (!tab.id) throw new Error('Active tab has no ID');
      const activeTabId = tab.id;
      const tabUrl = tab.url;
      if (!tabUrl) throw new Error('No URL available for active tab');

      const toolUseId = context?.toolUseId;
      const permissionResult = await context.permissionManager.checkPermission(tabUrl, toolUseId);
      if (!permissionResult.allowed) {
        if (permissionResult.needsPrompt) {
          return {
            type: 'permission_required',
            tool: PermissionTools.TYPE,
            url: tabUrl,
            toolUseId,
            actionData: { ref: params.ref, value: params.value }
          };
        }
        return { error: 'Permission denied for form input on this domain' };
      }

      const originalUrl = tab.url;
      if (!originalUrl) return { error: 'Unable to get original URL for security check' };

      const securityCheck = await checkUrlSecurity(activeTabId, originalUrl, 'form input action');
      if (securityCheck) return securityCheck;

      const formInputScript = (ref: string, value: FormInputValue): FormInputScriptResult => {
        try {
          let element: Element | null = null;
          if (window.__superduckElementMap?.[ref]) {
            element = window.__superduckElementMap[ref].deref() || null;
            if (!element || !document.contains(element)) {
              delete window.__superduckElementMap[ref];
              element = null;
            }
          }
          if (!element)
            return {
              error: `No element found with reference: "${ref}". The element may have been removed from the page.`
            };

          element.scrollIntoView({ behavior: 'smooth', block: 'center' });

          if (element instanceof HTMLSelectElement) {
            const prevValue = element.value;
            const options = Array.from(element.options);
            let found = false;
            const strValue = String(value);
            for (let i = 0; i < options.length; i++) {
              if (options[i].value === strValue || options[i].text === strValue) {
                element.selectedIndex = i;
                found = true;
                break;
              }
            }
            if (!found) {
              return {
                error: `Option "${strValue}" not found. Available options: ${options.map((o) => `"${o.text}" (value: "${o.value}")`).join(', ')}`
              };
            }
            element.focus();
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('input', { bubbles: true }));
            return {
              output: `Selected option "${strValue}" in dropdown (previous: "${prevValue}")`
            };
          }

          if (element instanceof HTMLInputElement && 'checkbox' === element.type) {
            const prevChecked = element.checked;
            if ('boolean' !== typeof value)
              return { error: 'Checkbox requires a boolean value (true/false)' };
            element.checked = value;
            element.focus();
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('input', { bubbles: true }));
            return {
              output: `Checkbox ${element.checked ? 'checked' : 'unchecked'} (previous: ${prevChecked})`
            };
          }

          if (element instanceof HTMLInputElement && 'radio' === element.type) {
            const prevChecked = element.checked;
            const groupName = element.name;
            element.checked = true;
            element.focus();
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('input', { bubbles: true }));
            return {
              success: true,
              action: 'form_input',
              ref,
              element_type: 'radio',
              previous_value: prevChecked,
              new_value: element.checked,
              message: 'Radio button selected' + (groupName ? ` in group "${groupName}"` : '')
            };
          }

          if (
            element instanceof HTMLInputElement &&
            ('date' === element.type ||
              'time' === element.type ||
              'datetime-local' === element.type ||
              'month' === element.type ||
              'week' === element.type)
          ) {
            const prevValue = element.value;
            element.value = String(value);
            element.focus();
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('input', { bubbles: true }));
            return {
              output: `Set ${element.type} to "${element.value}" (previous: ${prevValue})`
            };
          }

          if (element instanceof HTMLInputElement && 'range' === element.type) {
            const prevValue = element.value;
            const numValue = Number(value);
            if (isNaN(numValue)) return { error: 'Range input requires a numeric value' };
            element.value = String(numValue);
            element.focus();
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('input', { bubbles: true }));
            return {
              success: true,
              action: 'form_input',
              ref,
              element_type: 'range',
              previous_value: prevValue,
              new_value: element.value,
              message: `Set range to ${element.value} (min: ${element.min}, max: ${element.max})`
            };
          }

          if (element instanceof HTMLInputElement && 'number' === element.type) {
            const prevValue = element.value;
            const numValue = Number(value);
            if (isNaN(numValue) && '' !== value)
              return { error: 'Number input requires a numeric value' };
            element.value = String(value);
            element.focus();
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('input', { bubbles: true }));
            return {
              output: `Set number input to ${element.value} (previous: ${prevValue})`
            };
          }

          if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            const prevValue = element.value;
            element.value = String(value);
            element.focus();
            if (
              element instanceof HTMLTextAreaElement ||
              (element instanceof HTMLInputElement &&
                ['text', 'search', 'url', 'tel', 'password'].includes(element.type))
            ) {
              element.setSelectionRange(element.value.length, element.value.length);
            }
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('input', { bubbles: true }));
            return {
              output: `Set ${element instanceof HTMLTextAreaElement ? 'textarea' : (element as HTMLInputElement).type || 'text'} value to "${element.value}" (previous: "${prevValue}")`
            };
          }

          return {
            error: `Element type "${element.tagName}" is not a supported form input`
          };
        } catch (err) {
          return {
            error: `Error setting form value: ${err instanceof Error ? err.message : 'Unknown error'}`
          };
        }
      };

      const formResult = await execWithStaleRecovery<FormInputScriptResult, [string, FormInputValue]>(
        activeTabId,
        params.ref,
        formInputScript,
        [params.ref, params.value],
        isFormInputScriptResult
      );

      if (!formResult)
        throw new Error('Failed to execute form input');

      const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);
      return {
        ...formResult,
        tabContext: {
          currentTabId: context.tabId,
          executedOnTabId: effectiveTabId,
          availableTabs: validTabs,
          tabCount: validTabs.length
        }
      };
    } catch (err) {
      return {
        error: `Failed to execute form input: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'form_input',
    description:
      "Set values in form elements using element reference ID from the read_page tool. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
    input_schema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'Element reference ID from the read_page tool (e.g., "ref_1", "ref_2")'
        },
        value: {
          type: ['string', 'boolean', 'number'],
          description:
            'The value to set. For checkboxes use boolean, for selects use option value or text, for other inputs use appropriate string/number'
        },
        tabId: {
          type: 'number',
          description:
            "Tab ID to set form value in. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
        }
      },
      required: ['ref', 'value', 'tabId']
    }
  })
};

export { computerTool, formInputTool };
