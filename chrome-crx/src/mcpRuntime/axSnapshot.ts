/**
 * CDP AX Tree Snapshot Module
 *
 * 通过 Chrome DevTools Protocol 的 Accessibility.getFullAXTree 获取浏览器原生无障碍树，
 * 并应用剪枝/聚合/过滤策略压缩为 AI agent 可高效消费的紧凑文本表示。
 *
 * 核心策略来自 agent-browser 项目的 snapshot.rs：
 * - Ignored 节点过滤
 * - StaticText 聚合与去重
 * - Generic 节点扁平化
 * - 基于角色的 ref 分配
 * - Compact 模式后处理
 */

import { cdpDebugger } from './cdp';

// ============================================================================
// Types
// ============================================================================

interface AXValue {
  type: string;
  value?: string | number | boolean;
}

interface AXProperty {
  name: string;
  value: AXValue;
}

interface AXNode {
  nodeId: string | number;
  role?: AXValue;
  name?: AXValue;
  value?: AXValue;
  properties?: AXProperty[];
  childIds?: (string | number)[];
  backendDOMNodeId?: number;
  ignored?: boolean;
}

interface TreeNode {
  role: string;
  name: string;
  level: number | null;
  checked: string | null;
  expanded: boolean | null;
  selected: boolean | null;
  disabled: boolean | null;
  required: boolean | null;
  valueText: string | null;
  backendNodeId: number | null;
  children: number[];
  parentIdx: number | null;
  hasRef: boolean;
  refId: string | null;
  depth: number;
  cursorInteractive: boolean;
  url: string | null;
}

export interface SnapshotOptions {
  filter?: 'all' | 'interactive';
  compact?: boolean;
  depth?: number;
  maxChars?: number;
  startRef?: number;
  /**
   * CSS selector 聚焦：只渲染该元素及其后代（含 iframe contentDocument）。
   * CDP 没有 partial AX 树接口，仍需全量抓取再用 backendNodeId 集合过滤。
   */
  selector?: string;
  /**
   * 为带 ref 的 link 节点批量解析 href（DOM.resolveNode + callFunctionOn），
   * 默认关闭。开启后每个链接多一轮 CDP 往返，大页面上会增加延迟。
   */
  urls?: boolean;
}

export interface RefMapping {
  refId: string;
  backendNodeId: number;
  role: string;
  name: string;
  nth: number | null;
  isCursorInteractive: boolean;
  interactiveOnly: boolean;
}

export class SnapshotMaxCharsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotMaxCharsError';
  }
}

export interface SnapshotResult {
  content: string;
  refMappings: RefMapping[];
}

// ============================================================================
// Constants
// ============================================================================

export const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'treeitem',
]);

export const CONTENT_ROLES = new Set([
  'heading',
  'cell',
  'gridcell',
  'columnheader',
  'rowheader',
  'listitem',
  'article',
  'region',
  'main',
  'navigation',
]);

const INVISIBLE_CHARS = /[\uFEFF\u200B\u200C\u200D\u2060\u00A0]/g;

// ============================================================================
// Helpers
// ============================================================================

function extractAXString(value: AXValue | undefined): string {
  if (!value || value.value === undefined || value.value === null) return '';
  if (typeof value.value === 'string') return value.value;
  if (typeof value.value === 'number') return String(value.value);
  if (typeof value.value === 'boolean') return String(value.value);
  return '';
}

function extractProperties(props?: AXProperty[]): {
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

function stripInvisibleChars(text: string): string {
  return text.replace(INVISIBLE_CHARS, '');
}

function createEmptyNode(): TreeNode {
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
    url: null,
  };
}

// ============================================================================
// Tree Building
// ============================================================================

function buildTree(nodes: AXNode[]): { treeNodes: TreeNode[]; rootIndices: number[] } {
  const treeNodes: TreeNode[] = [];
  const idToIdx = new Map<string, number>();

  // Phase 1: Create tree nodes
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const role = extractAXString(node.role);
    const name = extractAXString(node.name);

    // nodeId 可能是 string 或 number，统一转 string
    const nodeId = String(node.nodeId);
    idToIdx.set(nodeId, i);

    // Skip ignored nodes (except RootWebArea) and InlineTextBox
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
      url: null,
    });
  }

  // Phase 2: Build parent-child relationships
  for (let i = 0; i < nodes.length; i++) {
    const childIds = nodes[i].childIds;
    if (!childIds) continue;
    for (const cid of childIds) {
      // childIds 的元素可能是 string 或 number，统一转 string
      const childIdx = idToIdx.get(String(cid));
      if (childIdx !== undefined) {
        treeNodes[i].children.push(childIdx);
        treeNodes[childIdx].parentIdx = i;
      }
    }
  }

  // Phase 3: Aggregate StaticText nodes
  aggregateStaticText(treeNodes);

  // Phase 4: Compute depths and find roots
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

    // Merge consecutive StaticText children
    let start = 0;
    while (start < childrenIndices.length) {
      if (treeNodes[childrenIndices[start]].role !== 'StaticText') {
        start++;
        continue;
      }

      let end = start + 1;
      while (end < childrenIndices.length && treeNodes[childrenIndices[end]].role === 'StaticText') {
        end++;
      }

      if (end > start + 1) {
        // Aggregate names into the first node
        let aggregated = '';
        for (let j = start; j < end; j++) {
          aggregated += treeNodes[childrenIndices[j]].name;
        }
        treeNodes[childrenIndices[start]].name = aggregated;
        // Clear the rest
        for (let j = start + 1; j < end; j++) {
          const idx = childrenIndices[j];
          treeNodes[idx].role = '';
          treeNodes[idx].name = '';
          treeNodes[idx].children = [];
        }
      }

      start = end;
    }

    // Deduplicate single StaticText child with same name as parent
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

// ============================================================================
// Cursor Interactive Element Detection
// ============================================================================

/**
 * 注入 JS 扫描页面，找出通过 cursor:pointer / onclick / tabindex / contenteditable
 * 实现交互但在无障碍树中只是 generic 角色的元素。
 * 返回这些元素的 backendNodeId 集合。
 *
 * 大页面跳过扫描：querySelectorAll('*') + 每节点 getComputedStyle 在几千节点的页面上
 * 会明显卡顿。超过 MAX_SCAN_NODES 时直接返回空集。
 */
const MAX_SCAN_NODES = 3000;

/**
 * 隐藏 input 元数据：key 为宿主（包含 input 的容器或 label）的 backendNodeId，
 * value 描述 input 的类型与勾选态。用于把 AX 里只呈现为 generic/LabelText 的
 * 自定义 radio/checkbox 提升回正确的语义角色。
 */
interface HiddenInputInfo {
  type: 'radio' | 'checkbox';
  checked: boolean;
}

async function findCursorInteractiveElements(
  tabId: number
): Promise<{ cursorIds: Set<number>; hiddenInputs: Map<number, HiddenInputInfo> }> {
  const cursorIds = new Set<number>();
  const hiddenInputs = new Map<number, HiddenInputInfo>();
  let scanDispatched = false;

  try {
    const scanFunc = (maxNodes: number) => {
      var nativeTags: Record<string, number> = {A:1,BUTTON:1,INPUT:1,SELECT:1,TEXTAREA:1,DETAILS:1,SUMMARY:1};
      var interactiveRoles: Record<string, number> = {button:1,link:1,textbox:1,checkbox:1,radio:1,combobox:1,
        listbox:1,menuitem:1,menuitemcheckbox:1,menuitemradio:1,option:1,searchbox:1,
        slider:1,spinbutton:1,switch:1,tab:1,treeitem:1};
      var all = document.body ? document.body.querySelectorAll('*') : [];
      // 大页面跳过，避免 getComputedStyle N 次导致的 reflow/style 重算阻塞
      if (all.length > maxNodes) return { count: 0, skipped: true };
      var count = 0;
      var isInputHidden = function (inp: HTMLInputElement): boolean {
        var cs = getComputedStyle(inp);
        if (cs.display === 'none' || cs.visibility === 'hidden') return true;
        if (inp.offsetWidth === 0 || inp.offsetHeight === 0) return true;
        return false;
      };
      for (var i = 0; i < all.length; i++) {
        var el = all[i] as HTMLElement;
        if (el.closest('[hidden],[aria-hidden="true"]')) continue;
        if (nativeTags[el.tagName]) continue;
        var role = el.getAttribute('role');
        if (role && interactiveRoles[role]) continue;
        var cs = getComputedStyle(el);
        var hasCursor = cs.cursor === 'pointer';
        var hasOnClick = el.hasAttribute('onclick') || (el as any).onclick !== null;
        var ti = el.getAttribute('tabindex');
        var hasTabIndex = ti !== null && ti !== '-1';
        var ce = el.getAttribute('contenteditable');
        var isEditable = ce === '' || ce === 'true';

        // 自定义 radio/checkbox 检测：元素内含唯一一个 hidden 的 native input。
        // 多 input 容器（典型 radiogroup / checkbox-group 包装）必须跳过提升，
        // 否则整组会塌成一个节点，只继承第一项的 checked，其他选项的 ref 全丢。
        // 让外层放过，文档顺序后续会处理到每个内层 label/wrapper 各自提升。
        var ihType: 'radio' | 'checkbox' | null = null;
        var ihChecked = false;
        var inputs = el.querySelectorAll('input[type="radio"], input[type="checkbox"]');
        if (inputs.length === 1) {
          var inp = inputs[0] as HTMLInputElement;
          if (isInputHidden(inp)) {
            // 嵌套包装去重：如 <label><span><input/></span></label>，
            // label 已被标记后跳过 span。文档顺序保证外层先被处理。
            if (!el.parentElement || !el.parentElement.closest('[data-__sd-ih-t]')) {
              ihType = inp.type === 'radio' ? 'radio' : 'checkbox';
              ihChecked = !!inp.checked;
            }
          }
        }

        var isInteractive = hasCursor || hasOnClick || hasTabIndex || isEditable;
        // 仅含 hidden input 但本身没有交互标志的元素也要标记，以便后续提升
        if (!isInteractive && !ihType) continue;

        // 仅有 cursor:pointer 且父元素也继承 pointer 时去重（原始逻辑），
        // 但如果自己是 hidden input 宿主，不能被去重，否则提升会失败。
        if (isInteractive && !ihType && hasCursor && !hasOnClick && !hasTabIndex && !isEditable) {
          var parent = el.parentElement;
          if (parent && getComputedStyle(parent).cursor === 'pointer') continue;
        }

        var rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        el.setAttribute('data-__sd-ci', String(count));
        if (ihType) {
          el.setAttribute('data-__sd-ih-t', ihType);
          el.setAttribute('data-__sd-ih-c', ihChecked ? '1' : '0');
          // 标记元素只为 hidden-input 宿主而存在时，不算 cursor 交互（avoid 污染 cursorInteractive）
          if (!isInteractive) el.setAttribute('data-__sd-ih-only', '1');
        }
        count++;
      }
      return { count: count, skipped: false };
    };

    // Step 1: 在所有框架中扫描并打标记
    scanDispatched = true;
    const scanResults = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: scanFunc,
      args: [MAX_SCAN_NODES],
    });

    const totalCount = scanResults?.reduce(
      (sum, r) => sum + (((r.result as any)?.count as number) || 0),
      0
    ) ?? 0;
    if (totalCount === 0) return { cursorIds, hiddenInputs };

    // Step 2: 通过 DOM.getDocument (pierce iframes) + DOM.querySelectorAll 获取标记元素
    const docResult = await cdpDebugger.sendCommand(tabId, 'DOM.getDocument', { depth: -1, pierce: true });
    if (!docResult?.root) return { cursorIds, hiddenInputs };

    // 收集所有 document 节点（主文档 + iframe 内文档）的 nodeId
    const documentNodeIds: number[] = [];
    const collectDocumentNodes = (node: any) => {
      if (node.nodeName === '#document' || node.nodeType === 9) {
        documentNodeIds.push(node.nodeId);
      }
      if (node.children) {
        for (const child of node.children) collectDocumentNodes(child);
      }
      if (node.contentDocument) {
        collectDocumentNodes(node.contentDocument);
      }
    };
    collectDocumentNodes(docResult.root);

    // 在每个 document 中并发查询标记元素
    const allNodeIds: number[] = [];
    const queryResults = await Promise.all(
      documentNodeIds.map(async (docNodeId) => {
        try {
          const r = await cdpDebugger.sendCommand(tabId, 'DOM.querySelectorAll', {
            nodeId: docNodeId,
            selector: '[data-__sd-ci]',
          });
          return r?.nodeIds ?? [];
        } catch {
          return [];
        }
      })
    );
    for (const ids of queryResults) allNodeIds.push(...ids);

    // 并发 describeNode 获取 backendNodeId + 属性（判断是否 hidden-input 宿主）
    const BATCH = 30;
    for (let i = 0; i < allNodeIds.length; i += BATCH) {
      const batch = allNodeIds.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (nid) => {
          try {
            const [desc, attrs] = await Promise.all([
              cdpDebugger.sendCommand(tabId, 'DOM.describeNode', { nodeId: nid }),
              cdpDebugger.sendCommand(tabId, 'DOM.getAttributes', { nodeId: nid }),
            ]);
            const backendNodeId: number | null = desc?.node?.backendNodeId ?? null;
            const flatAttrs: string[] = attrs?.attributes ?? [];
            // flatAttrs 是 [key, value, key, value, ...] 形式
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
            checked: r.ihChecked === '1',
          });
        }
      }
    }
  } catch (err) {
    console.warn('[axSnapshot] findCursorInteractiveElements failed:', err);
  } finally {
    // 只要发起过扫描就必须清理标记，避免中途 CDP 失败导致页面 DOM 残留属性
    if (scanDispatched) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          func: () => {
            var els = document.querySelectorAll('[data-__sd-ci],[data-__sd-ih-t],[data-__sd-ih-c],[data-__sd-ih-only]');
            for (var i = 0; i < els.length; i++) {
              els[i].removeAttribute('data-__sd-ci');
              els[i].removeAttribute('data-__sd-ih-t');
              els[i].removeAttribute('data-__sd-ih-c');
              els[i].removeAttribute('data-__sd-ih-only');
            }
          },
        });
      } catch {
        // 清理失败不影响主流程
      }
    }
  }

  return { cursorIds, hiddenInputs };
}

// ============================================================================
// Role-Name Tracker (for nth disambiguation)
// ============================================================================

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

// ============================================================================
// Ref Assignment
// ============================================================================

function assignRefs(treeNodes: TreeNode[], interactiveOnly: boolean, startRef: number = 1): RefMapping[] {
  const refMappings: RefMapping[] = [];
  const tracker = new RoleNameTracker();
  const nodesWithRefs: Array<{ idx: number; nth: number }> = [];
  let nextRef = startRef;

  // Pass 1: identify which nodes get refs and track role:name occurrences
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

  // Pass 2: assign refs with nth disambiguation
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
        interactiveOnly,
      });
    }
  }

  return refMappings;
}

// ============================================================================
// Rendering
// ============================================================================

function renderTree(
  treeNodes: TreeNode[],
  rootIndices: number[],
  options: SnapshotOptions
): string {
  let output = '';

  for (const rootIdx of rootIndices) {
    output += renderNode(treeNodes, rootIdx, 0, options);
  }

  return output;
}

function renderNode(
  treeNodes: TreeNode[],
  idx: number,
  indent: number,
  options: SnapshotOptions
): string {
  const node = treeNodes[idx];

  const passthrough = () => {
    let out = '';
    for (const childIdx of node.children) {
      out += renderNode(treeNodes, childIdx, indent, options);
    }
    return out;
  };

  if (!node.role) return passthrough();
  if (node.role === 'StaticText' && !stripInvisibleChars(node.name)) return passthrough();
  if (node.role === 'generic' && !node.hasRef && node.children.length <= 1) return passthrough();
  if (node.role === 'RootWebArea' || node.role === 'WebArea') return passthrough();

  // Depth limit
  if (options.depth !== undefined && indent > options.depth) {
    return '';
  }

  // Interactive-only mode: skip non-ref nodes but traverse children
  if (options.filter === 'interactive' && !node.hasRef) return passthrough();

  // Build line
  const prefix = '  '.repeat(indent);
  let line = `${prefix}- ${node.role}`;

  // Name
  const displayName = stripInvisibleChars(node.name);
  if (displayName) {
    const escaped = JSON.stringify(displayName);
    line += ` ${escaped}`;
  }

  // Attributes
  const attrs: string[] = [];
  if (node.level !== null) attrs.push(`level=${node.level}`);
  if (node.checked !== null) attrs.push(`checked=${node.checked}`);
  if (node.expanded !== null) attrs.push(`expanded=${node.expanded}`);
  if (node.selected === true) attrs.push('selected');
  if (node.disabled === true) attrs.push('disabled');
  if (node.required === true) attrs.push('required');
  if (node.refId) attrs.push(`ref=${node.refId}`);
  if (node.url) attrs.push(`url=${node.url}`);
  if (attrs.length > 0) line += ` [${attrs.join(', ')}]`;

  // Value
  if (node.valueText && node.valueText !== node.name) {
    line += `: ${node.valueText}`;
  }

  let output = line + '\n';

  // Render children
  for (const childIdx of node.children) {
    output += renderNode(treeNodes, childIdx, indent + 1, options);
  }

  return output;
}

// ============================================================================
// Compact Mode
// ============================================================================

function compactTree(tree: string, interactive: boolean): string {
  const lines = tree.split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) return '';

  const keep = new Array(lines.length).fill(false);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('ref=') || lines[i].includes(': ')) {
      keep[i] = true;
      // Mark ancestors by indent
      const myIndent = countIndent(lines[i]);
      for (let j = i - 1; j >= 0; j--) {
        const ancestorIndent = countIndent(lines[j]);
        if (ancestorIndent < myIndent) {
          keep[j] = true;
          if (ancestorIndent === 0) break;
        }
      }
    }
  }

  const result = lines.filter((_, i) => keep[i]).join('\n');

  if (!result.trim() && interactive) {
    return '(no interactive elements)';
  }

  return result;
}

function countIndent(line: string): number {
  const trimmed = line.trimStart();
  return (line.length - trimmed.length) / 2;
}

// ============================================================================
// Main Entry
// ============================================================================

/**
 * 按 tabId 串行化 AX 扫描 + cursor-interactive 扫描。
 * 即便上层调度是串行的，也能防止未来引入并发（或 resolveStaleRef 与 takeSnapshot
 * 同时跑）时 data-__sd-ci 标记、__superduckRefCounter 等共享状态互相踩。
 */
const snapshotLocks = new Map<number, Promise<unknown>>();

chrome.tabs.onRemoved.addListener((tabId) => {
  snapshotLocks.delete(tabId);
});

export async function withSnapshotLock<T>(tabId: number, fn: () => Promise<T>): Promise<T> {
  const prev = snapshotLocks.get(tabId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const chained = prev.then(() => gate);
  snapshotLocks.set(tabId, chained);
  try {
    await prev;
    return await fn();
  } finally {
    release();
    // 若当前链尾仍是自己，说明没有后继任务排队，清理 map 避免长期持有已完成 promise
    if (snapshotLocks.get(tabId) === chained) {
      snapshotLocks.delete(tabId);
    }
  }
}

/**
 * 抓取主帧 + 同源 iframe 的完整 AX 树。
 *
 * CDP 的 nodeId 只在"单次 getFullAXTree 调用"内唯一：主帧和每个子帧各自从小整数开始，
 * 因此合并前必须给子帧 nodeId 加前缀避免冲突。backendDOMNodeId 是 tab 级唯一，不受影响。
 *
 * 跨域 OOPIF：同源 getFullAXTree({frameId}) 调用会失败，这里 try-catch 吞掉，
 * Phase 2 再接入 Target.setAutoAttach + child sessionId 路由。
 *
 * 嵌套 iframe：当前只递归一层（主帧 → 直接子帧）。更深层嵌套、以及嵌套 iframe
 * 内的 cursor-interactive 元素（需要穿透多层 contentDocument）留到 Phase 2。
 */
async function fetchAXTree(tabId: number): Promise<AXNode[]> {
  await cdpDebugger.sendCommand(tabId, 'DOM.enable');
  await cdpDebugger.sendCommand(tabId, 'Accessibility.enable');

  const mainResult = await cdpDebugger.sendCommand(tabId, 'Accessibility.getFullAXTree');
  const mainNodes: AXNode[] = mainResult?.nodes ?? [];
  if (mainNodes.length === 0) return [];

  // 找出所有 Iframe AX 节点（主帧内）
  const iframeNodes = mainNodes.filter(
    (n) => extractAXString(n.role) === 'Iframe' && typeof n.backendDOMNodeId === 'number'
  );
  if (iframeNodes.length === 0) return mainNodes;

  // 并发递归抓取每个 iframe 的子帧 AX 树
  const childResults = await Promise.all(
    iframeNodes.map(async (ifNode, idx) => {
      const backendId = ifNode.backendDOMNodeId!;
      let frameId: string | undefined;
      try {
        const desc = await cdpDebugger.sendCommand(tabId, 'DOM.describeNode', {
          backendNodeId: backendId,
          depth: 1,
        });
        frameId = desc?.node?.contentDocument?.frameId;
      } catch {
        // describeNode 失败 → 跳过此 iframe
        return null;
      }
      if (!frameId) return null;

      let childResp: any;
      try {
        childResp = await cdpDebugger.sendCommand(tabId, 'Accessibility.getFullAXTree', {
          frameId,
        });
      } catch {
        // 跨域 OOPIF / detached frame → 静默跳过（Phase 2 再处理）
        return null;
      }
      const childNodes: AXNode[] = childResp?.nodes ?? [];
      if (childNodes.length === 0) return null;

      // 给子帧 nodeId 加前缀 + 重写 childIds，避免与主帧 / 其他子帧的 nodeId 冲突
      const prefix = `f${idx}:`;
      const prefixed: AXNode[] = childNodes.map((n) => ({
        ...n,
        nodeId: `${prefix}${n.nodeId}`,
        childIds: n.childIds?.map((c) => `${prefix}${c}`),
      }));

      // 找子帧的 root（通常是 RootWebArea，且没有 parentId 的节点）
      // 最稳健的做法：subtree 第一个节点就是 root（CDP 保证 BFS/DFS 顺序，root 在前）
      // 但为避免依赖顺序，计算所有被 childIds 引用过的 id 集合，取未被引用者
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

  // 合并：把子帧 root 追加到对应 Iframe 节点的 childIds；拼接所有 prefixed 节点
  const allNodes: AXNode[] = [...mainNodes];
  for (const r of childResults) {
    if (!r) continue;
    // 在合并后的 mainNodes 中定位这个 Iframe 节点并追加 childIds。
    // 这里要修改的是我们 push 进 allNodes 的 mainNodes 中的引用，而不是
    // iframeNodes 浅拷贝——ifNode 来自 mainNodes.filter 过滤，是同一个对象引用。
    if (!r.parentIframeNode.childIds) r.parentIframeNode.childIds = [];
    r.parentIframeNode.childIds.push(...r.rootIds);
    allNodes.push(...r.prefixed);
  }

  return allNodes;
}

/**
 * 批量解析 link 节点的 href：DOM.resolveNode → Runtime.callFunctionOn(this.href)。
 * 仅处理带 ref 且带 backendNodeId 的 link 节点，避免浪费 CDP 往返。
 * BATCH_LINK_URLS 控制并发，避免 CDP 队列拥塞。
 */
const BATCH_LINK_URLS = 20;

async function resolveLinkUrls(tabId: number, treeNodes: TreeNode[]): Promise<void> {
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
          const r = await cdpDebugger.sendCommand(tabId, 'DOM.resolveNode', { backendNodeId: bid });
          const objectId: string | undefined = r?.object?.objectId;
          if (!objectId) return;
          try {
            const call = await cdpDebugger.sendCommand(tabId, 'Runtime.callFunctionOn', {
              objectId,
              functionDeclaration: 'function() { return this.href; }',
              returnByValue: true,
            });
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
          // 单个链接失败不影响其他
        }
      })
    );
  }
}

/**
 * 解析 selector → 子树所有 backendNodeId 集合（含 iframe contentDocument）。
 */
async function collectSubtreeBackendIds(tabId: number, selector: string): Promise<Set<number>> {
  // 用 DOM.querySelector 参数化传 selector，避免 Runtime.evaluate 拼字符串带来的代码注入面。
  const doc = await cdpDebugger.sendCommand(tabId, 'DOM.getDocument', { depth: 0 });
  const rootNodeId: number | undefined = doc?.root?.nodeId;
  if (typeof rootNodeId !== 'number') {
    throw new Error('Failed to get document root for selector lookup');
  }
  let qs: any;
  try {
    qs = await cdpDebugger.sendCommand(tabId, 'DOM.querySelector', {
      nodeId: rootNodeId,
      selector,
    });
  } catch (err) {
    throw new Error(`Invalid selector '${selector}': ${(err as Error).message}`);
  }
  const matchedNodeId: number | undefined = qs?.nodeId;
  if (!matchedNodeId) {
    throw new Error(`Selector '${selector}' matched no element`);
  }
  const describe = await cdpDebugger.sendCommand(tabId, 'DOM.describeNode', {
    nodeId: matchedNodeId,
    depth: -1,
    pierce: true,
  });
  const ids = new Set<number>();
  const collect = (n: any) => {
    if (!n) return;
    if (typeof n.backendNodeId === 'number') ids.add(n.backendNodeId);
    if (Array.isArray(n.children)) n.children.forEach(collect);
    if (n.contentDocument) collect(n.contentDocument);
  };
  collect(describe?.node);
  return ids;
}

// 抖动字段：每次扫描都可能不同，diff 前一律剔除避免误报。
// - ref=ref_N: ref 计数器跨调用单调递增
// - focused/focused=true: 鼠标移动就变
// - value="...": 输入中的表单文本
const SNAPSHOT_NORMALIZE_RE =
  /,?\s*(?:ref=ref_\d+|focused(?:=(?:true|false))?|value="(?:[^"\\]|\\.)*")/g;
const EMPTY_ATTRS_RE = / \[\]/g;

export function normalizeSnapshotForDiff(text: string): string {
  return text.replace(SNAPSHOT_NORMALIZE_RE, '').replace(EMPTY_ATTRS_RE, '');
}

export async function takeSnapshot(
  tabId: number,
  options: SnapshotOptions = {}
): Promise<SnapshotResult> {
  return withSnapshotLock(tabId, () => takeSnapshotUnlocked(tabId, options));
}

/**
 * 免锁版本：调用方已经持有 withSnapshotLock 时使用，避免嵌套死锁。
 */
export async function takeSnapshotUnlocked(
  tabId: number,
  options: SnapshotOptions
): Promise<SnapshotResult> {
  const [axNodes, cursorScan, selectorSubtreeIds] = await Promise.all([
    fetchAXTree(tabId),
    findCursorInteractiveElements(tabId),
    options.selector
      ? collectSubtreeBackendIds(tabId, options.selector)
      : Promise.resolve(null as Set<number> | null),
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

  // 自定义 radio/checkbox 提升：只处理在 AX 树里呈现为 generic/LabelText 的宿主，
  // 原生 radio/checkbox 不经过这里（scanFunc 里已经 continue 跳过 INPUT 标签）。
  // 放在 cursorInteractive 标记之后，是因为提升后 role 变成 INTERACTIVE_ROLES，
  // assignRefs 会自动给 ref，无需依赖 cursorInteractive 标志。
  //
  // 关键：提升后也标记 cursorInteractive=true。原因是下一次 resolveStaleRef 会
  // 再抓一次 AX 树并按 (role=radio|checkbox) 匹配，但 AX 树本身仍呈现为 generic，
  // 会匹配失败或错配到其他元素。标记后 resolveStaleRef 早停返回 false，避免误恢复。
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

  const refMappings = assignRefs(treeNodes, options.filter === 'interactive', (options.startRef ?? 0) + 1);

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

  // Check maxChars limit
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
