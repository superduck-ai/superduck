/**
 * CDP AX Tree Snapshot Module
 *
 * 通过 Chrome DevTools Protocol 的 Accessibility.getFullAXTree 获取浏览器原生无障碍树，
 * 并应用剪枝/聚合/过滤策略压缩为 AI agent 可高效消费的紧凑文本表示。
 */

import { SnapshotMaxCharsError, type SnapshotOptions, type SnapshotResult } from './types';
import { EMPTY_ATTRS_RE, SNAPSHOT_NORMALIZE_RE } from './constants';
import { buildTree } from './treeBuilder';
import { findCursorInteractiveElements } from './cursorElements';
import { assignRefs } from './refs';
import { compactTree, renderTree } from './render';
import { withSnapshotLock } from './snapshotLock';
import { collectSubtreeBackendIds, fetchAXTree, resolveLinkUrls } from './cdpFetch';

export { INTERACTIVE_ROLES, CONTENT_ROLES } from './constants';
export { withSnapshotLock } from './snapshotLock';
export type { RefMapping, SnapshotOptions, SnapshotResult } from './types';
export { SnapshotMaxCharsError } from './types';

export function normalizeSnapshotForDiff(text: string): string {
  return text.replace(SNAPSHOT_NORMALIZE_RE, '').replace(EMPTY_ATTRS_RE, '');
}

export async function takeSnapshot(
  tabId: number,
  options: SnapshotOptions = {}
): Promise<SnapshotResult> {
  return withSnapshotLock(tabId, () => takeSnapshotUnlocked(tabId, options));
}

export async function takeSnapshotUnlocked(
  tabId: number,
  options: SnapshotOptions
): Promise<SnapshotResult> {
  const [axNodes, cursorScan, selectorSubtreeIds] = await Promise.all([
    fetchAXTree(tabId),
    findCursorInteractiveElements(tabId),
    options.selector
      ? collectSubtreeBackendIds(tabId, options.selector)
      : Promise.resolve(null as Set<number> | null)
  ]);
  const cursorInteractiveIds = cursorScan.cursorIds;
  const hiddenInputs = cursorScan.hiddenInputs;

  if (!axNodes.length) {
    return { content: '(empty page)', refMappings: [] };
  }

  const { treeNodes, rootIndices } = buildTree(axNodes);

  if (cursorInteractiveIds.size > 0) {
    for (const node of treeNodes) {
      if (node.backendNodeId !== null && cursorInteractiveIds.has(node.backendNodeId)) {
        node.cursorInteractive = true;
      }
    }
  }

  if (hiddenInputs.size > 0) {
    for (const node of treeNodes) {
      if (node.backendNodeId === null) continue;
      const info = hiddenInputs.get(node.backendNodeId);
      if (!info) continue;
      if (node.role !== 'generic' && node.role !== 'LabelText') continue;
      node.role = info.type;
      node.checked = info.checked ? 'true' : 'false';
      node.cursorInteractive = true;
    }
  }

  let effectiveRoots = rootIndices;
  if (selectorSubtreeIds) {
    const inSubtree = treeNodes.map(
      (n) => n.backendNodeId != null && selectorSubtreeIds.has(n.backendNodeId)
    );
    const newRoots: number[] = [];
    for (let i = 0; i < treeNodes.length; i++) {
      if (!inSubtree[i]) {
        treeNodes[i].role = '';
        continue;
      }
      const parentIdx = treeNodes[i].parentIdx;
      if (parentIdx == null || !inSubtree[parentIdx]) newRoots.push(i);
      treeNodes[i].children = treeNodes[i].children.filter((c) => inSubtree[c]);
    }
    if (newRoots.length === 0) {
      return { content: '(selector matched no accessibility nodes)', refMappings: [] };
    }
    const setDepth = (idx: number, d: number) => {
      treeNodes[idx].depth = d;
      for (const childIdx of treeNodes[idx].children) setDepth(childIdx, d + 1);
    };
    for (const root of newRoots) setDepth(root, 0);
    effectiveRoots = newRoots;
  }

  const refMappings = assignRefs(
    treeNodes,
    options.filter === 'interactive',
    (options.startRef ?? 0) + 1
  );

  if (options.urls) {
    await resolveLinkUrls(tabId, treeNodes);
  }

  let content = renderTree(treeNodes, effectiveRoots, options);

  if (options.compact) {
    content = compactTree(content, options.filter === 'interactive');
  }

  content = content.trim();

  if (!content) {
    if (options.filter === 'interactive') {
      return { content: '(no interactive elements)', refMappings: [] };
    }
    return { content: '(empty page)', refMappings: [] };
  }

  if (options.maxChars && content.length > options.maxChars) {
    const prefix = `Output exceeds ${options.maxChars} character limit (${content.length} characters). `;

    if (options.depth !== undefined) {
      throw new SnapshotMaxCharsError(
        `${prefix}Try specifying an even smaller depth parameter or use ref_id to focus on a specific element.`
      );
    }

    throw new SnapshotMaxCharsError(
      `${prefix}Try specifying a depth parameter (e.g., depth: 5) or use ref_id to focus on a specific element from the page.`
    );
  }

  return { content, refMappings };
}
