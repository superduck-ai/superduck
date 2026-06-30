import { cdpDebugger } from '../cdp';
import type {
  CdpAccessibilityTreeResult,
  CdpDomDescribeNodeResult,
  CdpDomGetDocumentResult,
  CdpDomQuerySelectorResult,
  CdpDomResolveNodeResult,
  CdpRuntimeEvaluateResult
} from '../cdp';
import type { AXNode, DomNodeTree, TreeNode } from './types';
import { BATCH_LINK_URLS } from './constants';
import { extractAXString } from './treeBuilder';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function fetchAXTree(tabId: number): Promise<AXNode[]> {
  await cdpDebugger.sendCommand(tabId, 'DOM.enable');
  await cdpDebugger.sendCommand(tabId, 'Accessibility.enable');

  const mainResult = await cdpDebugger.sendCommand<CdpAccessibilityTreeResult<AXNode>>(
    tabId,
    'Accessibility.getFullAXTree'
  );
  const mainNodes: AXNode[] = mainResult?.nodes ?? [];
  if (mainNodes.length === 0) return [];

  const iframeNodes = mainNodes.filter(
    (n) => extractAXString(n.role) === 'Iframe' && typeof n.backendDOMNodeId === 'number'
  );
  if (iframeNodes.length === 0) return mainNodes;

  const childResults = await Promise.all(
    iframeNodes.map(async (ifNode, idx) => {
      const backendId = ifNode.backendDOMNodeId!;
      let frameId: string | undefined;
      try {
        const desc = await cdpDebugger.sendCommand<CdpDomDescribeNodeResult>(
          tabId,
          'DOM.describeNode',
          {
            backendNodeId: backendId,
            depth: 1
          }
        );
        frameId = desc?.node?.contentDocument?.frameId;
      } catch {
        return null;
      }
      if (!frameId) return null;

      let childResp: CdpAccessibilityTreeResult<AXNode>;
      try {
        childResp = await cdpDebugger.sendCommand<CdpAccessibilityTreeResult<AXNode>>(
          tabId,
          'Accessibility.getFullAXTree',
          {
            frameId
          }
        );
      } catch {
        return null;
      }
      const childNodes: AXNode[] = childResp?.nodes ?? [];
      if (childNodes.length === 0) return null;

      const prefix = `f${idx}:`;
      const prefixed: AXNode[] = childNodes.map((n) => ({
        ...n,
        nodeId: `${prefix}${n.nodeId}`,
        childIds: n.childIds?.map((c) => `${prefix}${c}`)
      }));

      const referenced = new Set<string>();
      for (const n of prefixed) {
        if (!n.childIds) continue;
        for (const c of n.childIds) referenced.add(String(c));
      }
      const rootIds = prefixed
        .filter((n) => !referenced.has(String(n.nodeId)))
        .map((n) => n.nodeId);

      return { parentIframeNode: ifNode, prefixed, rootIds };
    })
  );

  const allNodes: AXNode[] = [...mainNodes];
  for (const r of childResults) {
    if (!r) continue;
    if (!r.parentIframeNode.childIds) r.parentIframeNode.childIds = [];
    r.parentIframeNode.childIds.push(...r.rootIds);
    allNodes.push(...r.prefixed);
  }

  return allNodes;
}

export async function resolveLinkUrls(tabId: number, treeNodes: TreeNode[]): Promise<void> {
  const targetIndices: number[] = [];
  for (let i = 0; i < treeNodes.length; i++) {
    const n = treeNodes[i];
    if (n.role === 'link' && n.hasRef && n.backendNodeId !== null) {
      targetIndices.push(i);
    }
  }
  if (targetIndices.length === 0) return;

  for (let i = 0; i < targetIndices.length; i += BATCH_LINK_URLS) {
    const batch = targetIndices.slice(i, i + BATCH_LINK_URLS);
    await Promise.all(
      batch.map(async (idx) => {
        const bid = treeNodes[idx].backendNodeId;
        if (bid === null) return;
        try {
          const r = await cdpDebugger.sendCommand<CdpDomResolveNodeResult>(
            tabId,
            'DOM.resolveNode',
            { backendNodeId: bid }
          );
          const objectId: string | undefined = r?.object?.objectId;
          if (!objectId) return;
          try {
            const call = await cdpDebugger.sendCommand<CdpRuntimeEvaluateResult>(
              tabId,
              'Runtime.callFunctionOn',
              {
                objectId,
                functionDeclaration: 'function() { return this.href; }',
                returnByValue: true
              }
            );
            const href = call?.result?.value;
            if (typeof href === 'string' && href) {
              treeNodes[idx].url = href;
            }
          } finally {
            try {
              await cdpDebugger.sendCommand(tabId, 'Runtime.releaseObject', { objectId });
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore
        }
      })
    );
  }
}

export async function collectSubtreeBackendIds(
  tabId: number,
  selector: string
): Promise<Set<number>> {
  const doc = await cdpDebugger.sendCommand<CdpDomGetDocumentResult>(tabId, 'DOM.getDocument', {
    depth: 0
  });
  const rootNodeId: number | undefined = doc?.root?.nodeId;
  if (typeof rootNodeId !== 'number') {
    throw new Error('Failed to get document root for selector lookup');
  }
  let qs: CdpDomQuerySelectorResult | undefined;
  try {
    qs = await cdpDebugger.sendCommand<CdpDomQuerySelectorResult>(tabId, 'DOM.querySelector', {
      nodeId: rootNodeId,
      selector
    });
  } catch (err) {
    throw new Error(`Invalid selector '${selector}': ${getErrorMessage(err)}`, { cause: err });
  }
  const matchedNodeId: number | undefined = qs?.nodeId;
  if (!matchedNodeId) {
    throw new Error(`Selector '${selector}' matched no element`);
  }
  const describe = await cdpDebugger.sendCommand<CdpDomDescribeNodeResult>(
    tabId,
    'DOM.describeNode',
    {
      nodeId: matchedNodeId,
      depth: -1,
      pierce: true
    }
  );
  const ids = new Set<number>();
  const collect = (n?: DomNodeTree) => {
    if (!n) return;
    if (typeof n.backendNodeId === 'number') ids.add(n.backendNodeId);
    if (Array.isArray(n.children)) n.children.forEach(collect);
    if (n.contentDocument) collect(n.contentDocument);
  };
  collect(describe?.node);
  return ids;
}
