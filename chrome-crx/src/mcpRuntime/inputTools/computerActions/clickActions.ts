import { waitForTabLoading, tabGroupManager } from '../../tabState';
import {
  cdpDebugger,
  checkDomainSecurity,
  mapCoordinateToViewport,
  screenshotContextManager
} from '../../cdp';
import { getRefBackendNodeId, getRefRole, getRefMetaByTab } from '../../screenshot/refBridge';
import type { ToolResult } from '../../pageTools';
import { type ComputerToolParams, type ClickOptions, type PermissionManagerLike } from '../types';
import { parseModifierKeys, computeModifiersBitmask } from '../modifiers';
import { scrollToElementByRef } from '../frameUtils';
import {
  animateCursorOnTab,
  getElementCheckedState,
  jsClickFallback,
  tryTakePostScrollScreenshot
} from './helpers';

const FOCUSABLE_INPUT_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);

export async function focusFocusableByRef(tabId: number, ref: string | undefined): Promise<void> {
  if (!ref) return;
  const role = getRefRole(tabId, ref);
  if (!role || !FOCUSABLE_INPUT_ROLES.has(role)) return;
  const backendNodeId = getRefBackendNodeId(tabId, ref);
  if (backendNodeId === null) return;
  try {
    await cdpDebugger.sendCommand(tabId, 'DOM.focus', { backendNodeId });
  } catch {
    // best-effort only: refs can go stale across navigations/frames.
  }
}

export async function executeClick(
  tabId: number,
  params: ComputerToolParams,
  clickCount: number = 1,
  currentUrl?: string,
  options?: ClickOptions,
  permissionManager?: PermissionManagerLike
): Promise<ToolResult> {
  let x = 0;
  let y = 0;

  if (params.ref) {
    console.info(`[Click] ref=${params.ref}`);
    const backendNodeId = getRefBackendNodeId(tabId, params.ref);
    console.info(`[Click] backendNodeId=${backendNodeId}`);
    const SCROLL_ALIGNMENTS: Array<{
      block: ScrollLogicalPosition;
      inline: ScrollLogicalPosition;
    }> = [
      { block: 'center', inline: 'center' },
      { block: 'end', inline: 'end' },
      { block: 'start', inline: 'start' }
    ];

    let resolved = false;
    for (const alignment of SCROLL_ALIGNMENTS) {
      const refResult = await scrollToElementByRef(tabId, params.ref, alignment);
      if (!refResult.success) {
        console.info(`[Click] scrollToElementByRef FAILED: ${refResult.error}`);
        return { error: refResult.error };
      }
      [x, y] = refResult.coordinates!;
      console.info(
        `[Click] alignment=${alignment.block} → coords=(${x.toFixed(1)}, ${y.toFixed(1)})`
      );

      if (backendNodeId !== null) {
        try {
          const hitResult = await cdpDebugger.sendCommand<{
            backendNodeId: number;
            nodeId: number;
          }>(tabId, 'DOM.getNodeForLocation', {
            x: Math.round(x),
            y: Math.round(y),
            includeUserAgentShadowDOM: true
          });
          console.info(
            `[Click] hitTest: expected=${backendNodeId}, got=${hitResult?.backendNodeId}, match=${hitResult?.backendNodeId === backendNodeId}`
          );
          if (hitResult?.backendNodeId === backendNodeId) {
            resolved = true;
            break;
          }
          console.info(
            `[Click] hit-target mismatch: expected=${backendNodeId}, got=${hitResult?.backendNodeId}, retrying with ${alignment.block}`
          );
        } catch (e) {
          console.info(
            `[Click] hitTest error: ${e instanceof Error ? e.message : 'unknown'}, proceeding`
          );
          resolved = true;
          break;
        }
      } else {
        console.info(`[Click] no backendNodeId, skipping hitTest`);
        resolved = true;
        break;
      }
    }
    if (!resolved) {
      console.info(`[Click] all 3 alignments failed hitTest, using last coords`);
      console.info(
        `[Click] hit-target verification failed for ref=${params.ref}, proceeding with last coords`
      );
    }
    console.info(`[Click] final coords=(${x.toFixed(1)}, ${y.toFixed(1)})`);
    console.info(`[Click] ref=${params.ref} → resolved coords=(${x}, ${y})`);
  } else if (params.coordinate) {
    console.info(
      `[Click] AI passed coordinate=(${params.coordinate[0]}, ${params.coordinate[1]}), attempting auto-ref-match`
    );
    [x, y] = params.coordinate;
    const context = screenshotContextManager.getContext(tabId);
    const [mappedX, mappedY] = mapCoordinateToViewport(x, y, context, params.coordinate_space);
    if (mappedX !== x || mappedY !== y) {
      console.info(`[Click] viewport=(${mappedX}, ${mappedY})`);
      x = mappedX;
      y = mappedY;
    }

    const refMeta = getRefMetaByTab(tabId);
    if (refMeta && refMeta.size > 0) {
      try {
        const hitNode = await cdpDebugger.sendCommand<{ backendNodeId: number }>(
          tabId,
          'DOM.getNodeForLocation',
          { x: Math.round(x), y: Math.round(y), includeUserAgentShadowDOM: true }
        );
        if (hitNode?.backendNodeId) {
          let matchedRef: string | null = null;
          for (const [refId, meta] of refMeta.entries()) {
            if (meta.backendNodeId === hitNode.backendNodeId) {
              matchedRef = refId;
              break;
            }
          }
          if (matchedRef) {
            console.info(
              `[Click] auto-matched coordinate to ${matchedRef} (backendNodeId=${hitNode.backendNodeId}), switching to ref path`
            );
            console.info(
              `[Click] auto-matched coordinate (${Math.round(x)}, ${Math.round(y)}) to ref=${matchedRef}`
            );
            const refResult = await scrollToElementByRef(tabId, matchedRef);
            if (refResult.success && refResult.coordinates) {
              [x, y] = refResult.coordinates;
              console.info(`[Click] ref-resolved coords=(${x.toFixed(1)}, ${y.toFixed(1)})`);
            }
          } else {
            console.info(
              `[Click] backendNodeId=${hitNode.backendNodeId} not in refMeta, using raw coords`
            );
          }
        }
      } catch (e) {
        console.info(
          `[Click] auto-ref-match failed: ${e instanceof Error ? e.message : 'unknown'}`
        );
      }
    }

    console.info(`[Click] final coords=(${x}, ${y})`);
  } else {
    throw new Error('Either ref or coordinate parameter is required for click action');
  }

  const button = params.action === 'right_click' ? 'right' : 'left';
  let modifiers = 0;

  if (params.modifiers) {
    modifiers = computeModifiersBitmask(parseModifierKeys(params.modifiers));
  }

  try {
    const securityCheck = await checkDomainSecurity(tabId, currentUrl, 'click action');
    if (securityCheck) return securityCheck;

    const actionName =
      clickCount === 1 ? 'click' : clickCount === 2 ? 'doubleclick' : 'tripleclick';
    await animateCursorOnTab(tabId, x, y, actionName, options?.skipIndicator);

    let checkedBefore: boolean | null = null;
    const refRole = params.ref ? getRefRole(tabId, params.ref) : null;
    const isCheckableRole =
      refRole &&
      ['checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio'].includes(refRole);
    if (isCheckableRole && clickCount === 1) {
      checkedBefore = await getElementCheckedState(tabId, params.ref!);
    }

    await cdpDebugger.click(tabId, x, y, button, clickCount, modifiers, options);

    await focusFocusableByRef(tabId, params.ref);

    if (isCheckableRole && clickCount === 1 && checkedBefore !== null) {
      try {
        const checkedAfter = await getElementCheckedState(tabId, params.ref!);
        if (checkedAfter !== null && checkedAfter === checkedBefore) {
          console.info(
            `[Click] checkbox/radio state unchanged after CDP click, trying JS click fallback`
          );
          await jsClickFallback(tabId, params.ref!);
        }
      } catch {
        // 验证失败不影响正常流程
      }
    }

    const clickLabel =
      clickCount === 1 ? 'Clicked' : clickCount === 2 ? 'Double-clicked' : 'Triple-clicked';
    const outputText = params.ref
      ? `${clickLabel} on element ${params.ref} at (${Math.round(x)}, ${Math.round(y)})`
      : `${clickLabel} at (${Math.round(params.coordinate![0])}, ${Math.round(params.coordinate![1])})`;

    if (permissionManager && !options?.skipIndicator) {
      await waitForTabLoading(tabId, 3000);
      const postClickScreenshot = await tryTakePostScrollScreenshot(
        tabId,
        permissionManager,
        options
      );
      if (postClickScreenshot) {
        return {
          output: outputText,
          base64Image: postClickScreenshot.base64Image,
          imageFormat: postClickScreenshot.imageFormat
        };
      }
    }

    return { output: outputText };
  } catch (error) {
    return { error: `Error clicking: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

export async function executeHover(
  tabId: number,
  params: ComputerToolParams,
  currentUrl: string,
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
      throw new Error('Either ref or coordinate parameter is required for hover action');
    [x, y] = params.coordinate;
    const context = screenshotContextManager.getContext(tabId);
    [x, y] = mapCoordinateToViewport(x, y, context, params.coordinate_space);
  }

  try {
    const securityCheck = await checkDomainSecurity(tabId, currentUrl, 'hover action');
    if (securityCheck) return securityCheck;

    await animateCursorOnTab(tabId, x, y, 'hover', options?.skipIndicator);
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
}
