import type { AXNode, AXProperty, AXValue, TreeNode } from './types';
import { INVISIBLE_CHARS } from './constants';

export function extractAXString(value: AXValue | undefined): string {
  if (!value || value.value === undefined || value.value === null) return '';
  if (typeof value.value === 'string') return value.value;
  if (typeof value.value === 'number') return String(value.value);
  if (typeof value.value === 'boolean') return String(value.value);
  return '';
}

export function extractProperties(props?: AXProperty[]): {
  level: number | null;
  checked: string | null;
  expanded: boolean | null;
  selected: boolean | null;
  disabled: boolean | null;
  required: boolean | null;
} {
  let level: number | null = null;
  let checked: string | null = null;
  let expanded: boolean | null = null;
  let selected: boolean | null = null;
  let disabled: boolean | null = null;
  let required: boolean | null = null;

  if (!props) return { level, checked, expanded, selected, disabled, required };

  for (const prop of props) {
    switch (prop.name) {
      case 'level':
        if (typeof prop.value.value === 'number') level = prop.value.value;
        break;
      case 'checked':
        if (typeof prop.value.value === 'string') checked = prop.value.value;
        else if (typeof prop.value.value === 'boolean') checked = String(prop.value.value);
        break;
      case 'expanded':
        if (typeof prop.value.value === 'boolean') expanded = prop.value.value;
        break;
      case 'selected':
        if (typeof prop.value.value === 'boolean') selected = prop.value.value;
        break;
      case 'disabled':
        if (typeof prop.value.value === 'boolean') disabled = prop.value.value;
        break;
      case 'required':
        if (typeof prop.value.value === 'boolean') required = prop.value.value;
        break;
    }
  }

  return { level, checked, expanded, selected, disabled, required };
}

export function stripInvisibleChars(text: string): string {
  return text.replace(INVISIBLE_CHARS, '');
}

export function createEmptyNode(): TreeNode {
  return {
    role: '',
    name: '',
    level: null,
    checked: null,
    expanded: null,
    selected: null,
    disabled: null,
    required: null,
    valueText: null,
    backendNodeId: null,
    children: [],
    parentIdx: null,
    hasRef: false,
    refId: null,
    depth: 0,
    cursorInteractive: false,
    url: null
  };
}

export function buildTree(nodes: AXNode[]): { treeNodes: TreeNode[]; rootIndices: number[] } {
  const treeNodes: TreeNode[] = [];
  const idToIdx = new Map<string, number>();

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const role = extractAXString(node.role);
    const name = extractAXString(node.name);

    const nodeId = String(node.nodeId);
    idToIdx.set(nodeId, i);

    if ((node.ignored && role !== 'RootWebArea') || role === 'InlineTextBox') {
      treeNodes.push(createEmptyNode());
      continue;
    }

    const { level, checked, expanded, selected, disabled, required } = extractProperties(
      node.properties
    );
    const valueText = extractAXString(node.value) || null;

    treeNodes.push({
      role,
      name,
      level,
      checked,
      expanded,
      selected,
      disabled,
      required,
      valueText,
      backendNodeId: node.backendDOMNodeId ?? null,
      children: [],
      parentIdx: null,
      hasRef: false,
      refId: null,
      depth: 0,
      cursorInteractive: false,
      url: null
    });
  }

  for (let i = 0; i < nodes.length; i++) {
    const childIds = nodes[i].childIds;
    if (!childIds) continue;
    for (const cid of childIds) {
      const childIdx = idToIdx.get(String(cid));
      if (childIdx !== undefined) {
        treeNodes[i].children.push(childIdx);
        treeNodes[childIdx].parentIdx = i;
      }
    }
  }

  aggregateStaticText(treeNodes);

  const isChild = new Array(treeNodes.length).fill(false);
  for (const node of treeNodes) {
    for (const childIdx of node.children) {
      isChild[childIdx] = true;
    }
  }

  const rootIndices: number[] = [];
  for (let i = 0; i < isChild.length; i++) {
    if (!isChild[i]) rootIndices.push(i);
  }

  function setDepth(idx: number, depth: number) {
    treeNodes[idx].depth = depth;
    for (const childIdx of treeNodes[idx].children) {
      setDepth(childIdx, depth + 1);
    }
  }

  for (const root of rootIndices) {
    setDepth(root, 0);
  }

  return { treeNodes, rootIndices };
}

function aggregateStaticText(treeNodes: TreeNode[]): void {
  for (let i = 0; i < treeNodes.length; i++) {
    const node = treeNodes[i];
    if (!node.role || node.children.length === 0) continue;

    const childrenIndices = [...node.children];

    let start = 0;
    while (start < childrenIndices.length) {
      if (treeNodes[childrenIndices[start]].role !== 'StaticText') {
        start++;
        continue;
      }

      let end = start + 1;
      while (
        end < childrenIndices.length &&
        treeNodes[childrenIndices[end]].role === 'StaticText'
      ) {
        end++;
      }

      if (end > start + 1) {
        let aggregated = '';
        for (let j = start; j < end; j++) {
          aggregated += treeNodes[childrenIndices[j]].name;
        }
        treeNodes[childrenIndices[start]].name = aggregated;
        for (let j = start + 1; j < end; j++) {
          const idx = childrenIndices[j];
          treeNodes[idx].role = '';
          treeNodes[idx].name = '';
          treeNodes[idx].children = [];
        }
      }

      start = end;
    }

    if (
      childrenIndices.length === 1 &&
      treeNodes[childrenIndices[0]].role === 'StaticText' &&
      node.name === treeNodes[childrenIndices[0]].name
    ) {
      const idx = childrenIndices[0];
      treeNodes[idx].role = '';
      treeNodes[idx].name = '';
      treeNodes[idx].children = [];
    }
  }
}
