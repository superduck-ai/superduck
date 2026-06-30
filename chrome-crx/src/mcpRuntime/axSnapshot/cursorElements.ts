import { cdpDebugger } from '../cdp';
import type {
  CdpDomAttributesResult,
  CdpDomDescribeNodeResult,
  CdpDomGetDocumentResult,
  CdpDomQuerySelectorAllResult
} from '../cdp';
import type { DomNodeTree, HiddenInputInfo } from './types';
import { MAX_SCAN_NODES } from './constants';

export async function findCursorInteractiveElements(
  tabId: number
): Promise<{ cursorIds: Set<number>; hiddenInputs: Map<number, HiddenInputInfo> }> {
  const cursorIds = new Set<number>();
  const hiddenInputs = new Map<number, HiddenInputInfo>();
  let scanDispatched = false;

  try {
    const scanFunc = (maxNodes: number) => {
      const nativeTags: Record<string, number> = {
        A: 1,
        BUTTON: 1,
        INPUT: 1,
        SELECT: 1,
        TEXTAREA: 1,
        DETAILS: 1,
        SUMMARY: 1
      };
      const interactiveRoles: Record<string, number> = {
        button: 1,
        link: 1,
        textbox: 1,
        checkbox: 1,
        radio: 1,
        combobox: 1,
        listbox: 1,
        menuitem: 1,
        menuitemcheckbox: 1,
        menuitemradio: 1,
        option: 1,
        searchbox: 1,
        slider: 1,
        spinbutton: 1,
        switch: 1,
        tab: 1,
        treeitem: 1
      };
      const all = document.body ? document.body.querySelectorAll('*') : [];
      if (all.length > maxNodes) return { count: 0, skipped: true };
      let count = 0;
      const isInputHidden = function (inp: HTMLInputElement): boolean {
        const cs = getComputedStyle(inp);
        if (cs.display === 'none' || cs.visibility === 'hidden') return true;
        if (inp.offsetWidth === 0 || inp.offsetHeight === 0) return true;
        return false;
      };
      for (let i = 0; i < all.length; i++) {
        const el = all[i] as HTMLElement;
        if (el.closest('[hidden],[aria-hidden="true"]')) continue;
        if (nativeTags[el.tagName]) continue;
        const role = el.getAttribute('role');
        if (role && interactiveRoles[role]) continue;
        const cs = getComputedStyle(el);
        const hasCursor = cs.cursor === 'pointer';
        const hasOnClick = el.hasAttribute('onclick') || el.onclick !== null;
        const ti = el.getAttribute('tabindex');
        const hasTabIndex = ti !== null && ti !== '-1';
        const ce = el.getAttribute('contenteditable');
        const isEditable = ce === '' || ce === 'true';

        let ihType: 'radio' | 'checkbox' | null = null;
        let ihChecked = false;
        const inputs = el.querySelectorAll('input[type="radio"], input[type="checkbox"]');
        if (inputs.length === 1) {
          const inp = inputs[0] as HTMLInputElement;
          if (isInputHidden(inp)) {
            if (!el.parentElement || !el.parentElement.closest('[data-__sd-ih-t]')) {
              ihType = inp.type === 'radio' ? 'radio' : 'checkbox';
              ihChecked = !!inp.checked;
            }
          }
        }

        const isInteractive = hasCursor || hasOnClick || hasTabIndex || isEditable;
        if (!isInteractive && !ihType) continue;

        if (isInteractive && !ihType && hasCursor && !hasOnClick && !hasTabIndex && !isEditable) {
          const parent = el.parentElement;
          if (parent && getComputedStyle(parent).cursor === 'pointer') continue;
        }

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        el.setAttribute('data-__sd-ci', String(count));
        if (ihType) {
          el.setAttribute('data-__sd-ih-t', ihType);
          el.setAttribute('data-__sd-ih-c', ihChecked ? '1' : '0');
          if (!isInteractive) el.setAttribute('data-__sd-ih-only', '1');
        }
        count++;
      }
      return { count: count, skipped: false };
    };

    scanDispatched = true;
    const scanResults = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: scanFunc,
      args: [MAX_SCAN_NODES]
    });

    const totalCount =
      scanResults?.reduce(
        (sum, r) => sum + (((r.result as { count?: number } | undefined)?.count as number) || 0),
        0
      ) ?? 0;
    if (totalCount === 0) return { cursorIds, hiddenInputs };

    const docResult = await cdpDebugger.sendCommand<CdpDomGetDocumentResult>(
      tabId,
      'DOM.getDocument',
      { depth: -1, pierce: true }
    );
    if (!docResult?.root) return { cursorIds, hiddenInputs };

    const documentNodeIds: number[] = [];
    const collectDocumentNodes = (node?: DomNodeTree) => {
      if (!node) return;
      if (node.nodeName === '#document' || node.nodeType === 9) {
        if (typeof node.nodeId === 'number') {
          documentNodeIds.push(node.nodeId);
        }
      }
      if (node.children) {
        for (const child of node.children) collectDocumentNodes(child);
      }
      if (node.contentDocument) {
        collectDocumentNodes(node.contentDocument);
      }
    };
    collectDocumentNodes(docResult.root);

    const allNodeIds: number[] = [];
    const queryResults = await Promise.all(
      documentNodeIds.map(async (docNodeId) => {
        try {
          const r = await cdpDebugger.sendCommand<CdpDomQuerySelectorAllResult>(
            tabId,
            'DOM.querySelectorAll',
            {
              nodeId: docNodeId,
              selector: '[data-__sd-ci]'
            }
          );
          return r?.nodeIds ?? [];
        } catch {
          return [];
        }
      })
    );
    for (const ids of queryResults) allNodeIds.push(...ids);

    const BATCH = 30;
    for (let i = 0; i < allNodeIds.length; i += BATCH) {
      const batch = allNodeIds.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (nid) => {
          try {
            const [desc, attrs] = await Promise.all([
              cdpDebugger.sendCommand<CdpDomDescribeNodeResult>(tabId, 'DOM.describeNode', {
                nodeId: nid
              }),
              cdpDebugger.sendCommand<CdpDomAttributesResult>(tabId, 'DOM.getAttributes', {
                nodeId: nid
              })
            ]);
            const backendNodeId: number | null = desc?.node?.backendNodeId ?? null;
            const flatAttrs: string[] = attrs?.attributes ?? [];
            let ihType: string | null = null;
            let ihChecked: string | null = null;
            let ihOnly = false;
            for (let k = 0; k < flatAttrs.length; k += 2) {
              const key = flatAttrs[k];
              const val = flatAttrs[k + 1];
              if (key === 'data-__sd-ih-t') ihType = val;
              else if (key === 'data-__sd-ih-c') ihChecked = val;
              else if (key === 'data-__sd-ih-only') ihOnly = val === '1';
            }
            return { backendNodeId, ihType, ihChecked, ihOnly };
          } catch {
            return null;
          }
        })
      );
      for (const r of results) {
        if (!r || r.backendNodeId === null) continue;
        if (!r.ihOnly) cursorIds.add(r.backendNodeId);
        if (r.ihType === 'radio' || r.ihType === 'checkbox') {
          hiddenInputs.set(r.backendNodeId, {
            type: r.ihType,
            checked: r.ihChecked === '1'
          });
        }
      }
    }
  } catch (err) {
    console.warn('[axSnapshot] findCursorInteractiveElements failed:', err);
  } finally {
    if (scanDispatched) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          func: () => {
            const els = document.querySelectorAll(
              '[data-__sd-ci],[data-__sd-ih-t],[data-__sd-ih-c],[data-__sd-ih-only]'
            );
            for (let i = 0; i < els.length; i++) {
              els[i].removeAttribute('data-__sd-ci');
              els[i].removeAttribute('data-__sd-ih-t');
              els[i].removeAttribute('data-__sd-ih-c');
              els[i].removeAttribute('data-__sd-ih-only');
            }
          }
        });
      } catch {
        // ignore
      }
    }
  }

  return { cursorIds, hiddenInputs };
}
