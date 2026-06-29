import type { RefMapping, TreeNode } from './types';
import { CONTENT_ROLES, INTERACTIVE_ROLES } from './constants';

class RoleNameTracker {
  private counts = new Map<string, number>();

  track(role: string, name: string): number {
    const key = `${role}:${name}`;
    const nth = this.counts.get(key) ?? 0;
    this.counts.set(key, nth + 1);
    return nth;
  }

  getDuplicateKeys(): Set<string> {
    const dups = new Set<string>();
    for (const [key, count] of this.counts) {
      if (count > 1) dups.add(key);
    }
    return dups;
  }
}

export function assignRefs(
  treeNodes: TreeNode[],
  interactiveOnly: boolean,
  startRef: number = 1
): RefMapping[] {
  const refMappings: RefMapping[] = [];
  const tracker = new RoleNameTracker();
  const nodesWithRefs: Array<{ idx: number; nth: number }> = [];
  let nextRef = startRef;

  for (let i = 0; i < treeNodes.length; i++) {
    const node = treeNodes[i];
    const role = node.role;
    let shouldRef = false;

    if (INTERACTIVE_ROLES.has(role)) {
      shouldRef = true;
    } else if (!interactiveOnly && CONTENT_ROLES.has(role) && node.name) {
      shouldRef = true;
    } else if (node.cursorInteractive) {
      shouldRef = true;
    }

    if (shouldRef) {
      const nth = tracker.track(role, node.name);
      nodesWithRefs.push({ idx: i, nth });
    }
  }

  const duplicates = tracker.getDuplicateKeys();

  for (const { idx, nth } of nodesWithRefs) {
    const node = treeNodes[idx];
    const key = `${node.role}:${node.name}`;
    const actualNth = duplicates.has(key) ? nth : null;

    const refId = `ref_${nextRef}`;
    nextRef++;
    node.hasRef = true;
    node.refId = refId;

    if (node.backendNodeId !== null) {
      refMappings.push({
        refId,
        backendNodeId: node.backendNodeId,
        role: node.role,
        name: node.name,
        nth: actualNth,
        isCursorInteractive: node.cursorInteractive,
        interactiveOnly
      });
    }
  }

  return refMappings;
}
