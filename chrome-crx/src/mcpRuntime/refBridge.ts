/**
 * Ref Bridge Module
 *
 * 将 CDP AX Tree 的 backendDOMNodeId 映射注册到页面的 window.__superduckElementMap，
 * 确保 inputTools.ts 的 scroll_to、form_input 等交互工具继续通过 ref_N 引用工作。
 *
 * 支持 Stale Ref 恢复：当 WeakRef 被 GC 或 DOM 重渲染导致 backendNodeId 失效时，
 * 通过存储的 role/name/nth 元数据重新从 AX 树中匹配元素。
 */

import { cdpDebugger } from './cdp';
import { INTERACTIVE_ROLES, CONTENT_ROLES, withSnapshotLock } from './axSnapshot';
import type { CdpAccessibilityTreeResult, CdpDomResolveNodeResult } from './cdpTypes';
import type { RefMapping } from './axSnapshot';

const BATCH_SIZE = 30;

interface AxTreeNode {
  ignored?: boolean;
  role?: {
    value?: string;
  };
  name?: {
    value?: string;
  };
  backendDOMNodeId?: number;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

// 按 tabId 隔离的元数据存储，用于 stale ref 恢复
const refMetaByTab = new Map<number, Map<string, RefMapping>>();

// Tab 关闭时自动清理元数据，防止内存泄漏
chrome.tabs.onRemoved.addListener((tabId) => {
  refMetaByTab.delete(tabId);
});

// 页面导航时清理旧 ref 元数据，防止 resolveStaleRef 恢复到错误元素
chrome.webNavigation.onCommitted.addListener((details) => {
  // 只处理主框架导航（frameId === 0），忽略 iframe 导航
  // 忽略同页锚点跳转和前进/后退缓存恢复等不重新加载的情况
  if (details.frameId === 0 && !['auto_subframe', 'manual_subframe'].includes(details.transitionType)) {
    refMetaByTab.delete(details.tabId);
  }
});

function getTabMeta(tabId: number): Map<string, RefMapping> {
  let m = refMetaByTab.get(tabId);
  if (!m) {
    m = new Map();
    refMetaByTab.set(tabId, m);
  }
  return m;
}

/**
 * 清空页面上的 __superduckElementMap 和重置 __superduckRefCounter，同时清空该 tab 的元数据
 */
export async function clearPageRefs(tabId: number): Promise<void> {
  refMetaByTab.delete(tabId);
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => {
      window.__superduckElementMap = {};
      window.__superduckRefCounter = 0;
    }
  });
}

/**
 * 清理页面上 __superduckElementMap 中已被 GC 的 WeakRef 条目，
 * 同时清理对应的内存元数据，防止 map 无限增长。
 */
export async function pruneStaleRefs(tabId: number): Promise<void> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const map = window.__superduckElementMap;
        if (!map) return [];
        const stale: string[] = [];
        for (const key of Object.keys(map)) {
          if (!map[key]?.deref()) {
            delete map[key];
            stale.push(key);
          }
        }
        return stale;
      }
    });
    const tabMeta = refMetaByTab.get(tabId);
    if (tabMeta && results) {
      for (const r of results) {
        if (isStringArray(r.result)) {
          for (const key of r.result) tabMeta.delete(key);
        }
      }
    }
  } catch {
    // 清理失败不影响主流程
  }
}

/**
 * 将 AX Tree ref 映射批量注册到页面的 __superduckElementMap，并存储元数据
 *
 * 对每个 RefMapping：
 * 1. 存储 role/name/nth 到 refMetaMap
 * 2. DOM.resolveNode({backendNodeId}) → 获取 Runtime objectId
 * 3. Runtime.callFunctionOn({objectId, ...}) → 注册到 __superduckElementMap
 */
export async function registerRefsInPage(
  tabId: number,
  refMappings: RefMapping[]
): Promise<void> {
  if (refMappings.length === 0) return;

  // 存储元数据（按 tab 隔离）
  const tabMeta = getTabMeta(tabId);
  for (const mapping of refMappings) {
    tabMeta.set(mapping.refId, mapping);
  }

  // 确保 DOM domain 已启用
  await cdpDebugger.sendCommand(tabId, 'DOM.enable');

  // 初始化页面上的 element map（如果不存在），包括所有 iframe
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => {
      if (!window.__superduckElementMap) window.__superduckElementMap = {};
      if (!window.__superduckRefCounter) window.__superduckRefCounter = 0;
    }
  });

  // 分批并行注册
  for (let i = 0; i < refMappings.length; i += BATCH_SIZE) {
    const batch = refMappings.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async ({ refId, backendNodeId }) => {
        try {
          await injectWeakRef(tabId, refId, backendNodeId, true);
        } catch {
          // 单个元素注册失败不影响其他元素
        }
      })
    );
  }
}

/**
 * 通过 CDP 在页面上注入一个 WeakRef 到 __superduckElementMap[refId]，可选地推进 refCounter。
 */
async function injectWeakRef(
  tabId: number,
  refId: string,
  backendNodeId: number,
  bumpCounter: boolean
): Promise<void> {
  const resolveResult = await cdpDebugger.sendCommand<CdpDomResolveNodeResult>(
    tabId,
    'DOM.resolveNode',
    { backendNodeId }
  );
  const objectId = resolveResult?.object?.objectId;
  if (!objectId) return;

  const fnBody = bumpCounter
    ? `function(refId) {
        if (!window.__superduckElementMap) window.__superduckElementMap = {};
        window.__superduckElementMap[refId] = new WeakRef(this);
        var num = parseInt(refId.replace('ref_', ''), 10);
        if (!window.__superduckRefCounter || window.__superduckRefCounter < num) {
          window.__superduckRefCounter = num;
        }
      }`
    : `function(refId) {
        if (!window.__superduckElementMap) window.__superduckElementMap = {};
        window.__superduckElementMap[refId] = new WeakRef(this);
      }`;

  await cdpDebugger.sendCommand(tabId, 'Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: fnBody,
    arguments: [{ value: refId }],
    returnByValue: true,
  });
}

/**
 * 获取指定 ref 的 backendNodeId（用于 CDP 坐标查询等场景）
 */
export function getRefBackendNodeId(tabId: number, refId: string): number | null {
  const tabMeta = refMetaByTab.get(tabId);
  const meta = tabMeta?.get(refId);
  return meta?.backendNodeId ?? null;
}

export function getRefRole(tabId: number, refId: string): string | null {
  const tabMeta = refMetaByTab.get(tabId);
  const meta = tabMeta?.get(refId);
  return meta?.role ?? null;
}

export function getRefMetaByTab(tabId: number): ReadonlyMap<string, RefMapping> | undefined {
  return refMetaByTab.get(tabId);
}

/**
 * 尝试恢复一个 stale ref。
 *
 * 当页面上的 WeakRef 已被 GC 或 DOM 重渲染导致元素丢失时：
 * 1. 从 refMetaMap 获取 role/name/nth 元数据
 * 2. 重新拉取 AX 树，按 role+name+nth 匹配新的 backendNodeId
 * 3. 通过 DOM.resolveNode + Runtime.callFunctionOn 重新注入 WeakRef
 *
 * @returns true 如果恢复成功
 */
export async function resolveStaleRef(tabId: number, refId: string): Promise<boolean> {
  const tabMeta = refMetaByTab.get(tabId);
  const meta = tabMeta?.get(refId);
  if (!meta) return false;

  // cursorInteractive 元素无法仅通过 AX 树恢复（AX 树里是 generic，需要 JS 扫描），
  // 而扫描会插入 data-__sd-ci 标记并可能与正在进行的快照冲突，这里直接放弃恢复。
  if (meta.isCursorInteractive) return false;

  // 与 takeSnapshot 共享同一把 tab 级互斥锁，避免并发 AX 扫描相互干扰
  return withSnapshotLock(tabId, () => resolveStaleRefInner(tabId, refId, meta));
}

async function resolveStaleRefInner(
  tabId: number,
  refId: string,
  meta: RefMapping
): Promise<boolean> {
  try {
    // 重新获取 AX 树
    await cdpDebugger.sendCommand(tabId, 'DOM.enable');
    await cdpDebugger.sendCommand(tabId, 'Accessibility.enable');
    const axResult = await cdpDebugger.sendCommand<CdpAccessibilityTreeResult<AxTreeNode>>(
      tabId,
      'Accessibility.getFullAXTree'
    );
    const nodes: AxTreeNode[] = axResult?.nodes ?? [];

    // 按 role+name+nth 匹配，与 assignRefs 保持一致：
    // - interactiveOnly=true 时仅 INTERACTIVE_ROLES 参与；
    // - interactiveOnly=false 时 INTERACTIVE_ROLES + 带 name 的 CONTENT_ROLES 参与。
    // cursorInteractive 不参与此路径（已在上方 early return）。
    const targetNth = meta.nth ?? 0;
    let matchCount = 0;
    let newBackendNodeId: number | null = null;

    for (const node of nodes) {
      if (node.ignored) continue;
      const nodeRole = node.role?.value ?? '';
      const nodeName = node.name?.value ?? '';

      const wouldRef = meta.interactiveOnly
        ? INTERACTIVE_ROLES.has(nodeRole)
        : (INTERACTIVE_ROLES.has(nodeRole) || (CONTENT_ROLES.has(nodeRole) && !!nodeName));
      if (!wouldRef) continue;

      if (nodeRole !== meta.role || nodeName !== meta.name) continue;

      if (matchCount === targetNth) {
        newBackendNodeId = node.backendDOMNodeId ?? null;
        break;
      }
      matchCount++;
    }

    if (newBackendNodeId === null) return false;

    meta.backendNodeId = newBackendNodeId;
    await injectWeakRef(tabId, refId, newBackendNodeId, false);

    return true;
  } catch (err) {
    console.warn('[refBridge] resolveStaleRef failed:', err);
    return false;
  }
}
