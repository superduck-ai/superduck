import { cdpDebugger } from '../cdp';
import type {
  CdpDomDescribeNodeResult,
  CdpDomGetContentQuadsResult,
  CdpDomGetFrameOwnerResult,
  CdpPageFrameTreeNode,
  CdpPageGetFrameTreeResult
} from '../cdp';
import { resolveStaleRef, getRefBackendNodeId } from '../screenshot/refBridge';
import { isScrollToRefResult, type ScrollToRefResult } from './types';

export function pickFrameResult<T extends { error?: string }>(
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

export async function execWithStaleRecovery<T extends { error?: string }, TArgs extends unknown[]>(
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

export async function getFrameOffsetForNode(
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

export async function scrollToElementByRef(
  tabId: number,
  ref: string,
  scrollAlignment?: { block: string; inline: string }
): Promise<ScrollToRefResult> {
  const scrollScript = (
    elementRef: string,
    alignment: { block: string; inline: string } | null
  ) => {
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

      const align = alignment || { block: 'center', inline: 'center' };
      element.scrollIntoView({
        behavior: 'instant',
        block: align.block as ScrollLogicalPosition,
        inline: align.inline as ScrollLogicalPosition
      });

      if (element instanceof HTMLElement) {
        element.offsetHeight;
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
    const result = await execWithStaleRecovery<
      ScrollToRefResult,
      [string, { block: string; inline: string } | null]
    >(tabId, ref, scrollScript, [ref, scrollAlignment ?? null], isScrollToRefResult);

    if (!result) {
      return { success: false, error: 'Failed to execute script to get element coordinates' };
    }

    const backendNodeId = getRefBackendNodeId(tabId, ref);

    if (!result.success && backendNodeId !== null) {
      console.info(
        `[scrollToRef] content script failed (${result.error}), but have backendNodeId=${backendNodeId}, trying CDP path`
      );
      try {
        await cdpDebugger.sendCommand(tabId, 'DOM.scrollIntoViewIfNeeded', { backendNodeId });
      } catch {
        // scrollIntoViewIfNeeded 失败不阻断流程
      }
    } else if (!result.success) {
      return result;
    }

    let localCoords: [number, number] | null = result.success ? (result.coordinates ?? null) : null;
    console.info(
      `[scrollToRef] ref=${ref}, backendNodeId=${backendNodeId}, contentScript coords=${localCoords}`
    );

    if (backendNodeId !== null) {
      try {
        let stableCoords: [number, number] | null = null;
        let prevQuad: number[] | null = null;
        let consecutiveStable = 0;
        for (let frame = 0; frame < 10; frame++) {
          const quads = await cdpDebugger.sendCommand<CdpDomGetContentQuadsResult>(
            tabId,
            'DOM.getContentQuads',
            { backendNodeId }
          );
          const quad = quads?.quads?.[0];
          if (!quad) break;
          if (
            prevQuad &&
            quad.length === prevQuad.length &&
            quad.every((v, i) => v === prevQuad![i])
          ) {
            consecutiveStable++;
            if (consecutiveStable >= 2) {
              stableCoords = [
                (quad[0] + quad[2] + quad[4] + quad[6]) / 4,
                (quad[1] + quad[3] + quad[5] + quad[7]) / 4
              ];
              break;
            }
          } else {
            consecutiveStable = 0;
          }
          prevQuad = [...quad];
          await new Promise((r) => setTimeout(r, 16));
        }

        if (stableCoords) {
          console.info(
            `[scrollToRef] stable after CDP quads: (${stableCoords[0].toFixed(1)}, ${stableCoords[1].toFixed(1)})`
          );
          localCoords = stableCoords;
        } else {
          if (prevQuad && prevQuad.length >= 8) {
            localCoords = [
              (prevQuad[0] + prevQuad[2] + prevQuad[4] + prevQuad[6]) / 4,
              (prevQuad[1] + prevQuad[3] + prevQuad[5] + prevQuad[7]) / 4
            ];
          }
        }
      } catch {
        // 使用 content script 返回的本地坐标
      }

      const offset = await getFrameOffsetForNode(tabId, backendNodeId);
      console.info(
        `[scrollToRef] frameOffset=${JSON.stringify(offset)}, localCoords=${localCoords}`
      );
      if (offset && localCoords) {
        const finalCoords: [number, number] = [
          localCoords[0] + offset.x,
          localCoords[1] + offset.y
        ];
        console.info(
          `[scrollToRef] final=(${finalCoords[0].toFixed(1)}, ${finalCoords[1].toFixed(1)})`
        );
        return {
          success: true,
          coordinates: finalCoords
        };
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
