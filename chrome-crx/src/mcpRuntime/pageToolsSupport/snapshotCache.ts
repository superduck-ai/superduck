import { diffArrays } from 'diff';
import { normalizeSnapshotForDiff } from '../axSnapshot';

interface SnapshotCacheEntry {
  url: string;
  variantKey: string;
  content: string;
  lastUsedAt: number;
}

const SNAPSHOT_CACHE_MAX = 20;
const snapshotCache = new Map<string, SnapshotCacheEntry>();

export const DIFF_NO_CHANGES = '(no changes since last read_page)';
export const DIFF_NO_BASELINE_PREFIX = '(no previous snapshot for this URL, returning full content)';

export interface SnapshotVariant {
  filter: 'all' | 'interactive';
  depth: number;
  maxChars: number;
  urls: boolean;
}

function snapshotCacheKey(sessionId: string | undefined, tabId: number): string {
  return `${sessionId ?? '_nosession'}:${tabId}`;
}

export function snapshotVariantKey(v: SnapshotVariant): string {
  return `${v.filter}|d=${v.depth}|m=${v.maxChars}|u=${v.urls ? 1 : 0}`;
}

export function snapshotCacheSet(
  sessionId: string | undefined,
  tabId: number,
  url: string,
  variantKey: string,
  content: string
): void {
  if (!url) return;
  const key = snapshotCacheKey(sessionId, tabId);
  snapshotCache.set(key, { url, variantKey, content, lastUsedAt: Date.now() });
  if (snapshotCache.size > SNAPSHOT_CACHE_MAX) {
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [k, entry] of snapshotCache) {
      if (entry.lastUsedAt < oldestTs) {
        oldestTs = entry.lastUsedAt;
        oldestKey = k;
      }
    }
    if (oldestKey != null) snapshotCache.delete(oldestKey);
  }
}

export function snapshotCacheGet(
  sessionId: string | undefined,
  tabId: number,
  currentUrl: string,
  variantKey: string
): SnapshotCacheEntry | undefined {
  if (!currentUrl) return undefined;
  const key = snapshotCacheKey(sessionId, tabId);
  const entry = snapshotCache.get(key);
  if (!entry) return undefined;
  if (entry.url !== currentUrl || entry.variantKey !== variantKey) {
    snapshotCache.delete(key);
    return undefined;
  }
  entry.lastUsedAt = Date.now();
  return entry;
}

function invalidateAllSessionsForTab(tabId: number): void {
  const suffix = `:${tabId}`;
  for (const key of snapshotCache.keys()) {
    if (key.endsWith(suffix)) snapshotCache.delete(key);
  }
}

export function formatCompactDiff(
  prevContent: string,
  currContent: string
): { added: number; removed: number; body: string } {
  const prevLines = prevContent.split('\n');
  const currLines = currContent.split('\n');
  const parts = diffArrays(prevLines, currLines, {
    comparator: (a, b) => normalizeSnapshotForDiff(a) === normalizeSnapshotForDiff(b)
  });
  let added = 0;
  let removed = 0;
  const out: string[] = [];
  for (const p of parts) {
    const lines = p.value;
    if (p.added) {
      added += lines.length;
      for (const line of lines) out.push('+' + line);
    } else if (p.removed) {
      removed += lines.length;
      for (const line of lines) out.push('-' + line);
    } else {
      // 未变化区块：尝试 tree-level 折叠
      const collapsed = collapseUnchangedSubtrees(lines);
      for (const line of collapsed) out.push(' ' + line);
    }
  }
  return { added, removed, body: out.join('\n') };
}

function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function collapseUnchangedSubtrees(lines: string[]): string[] {
  if (lines.length <= 5) return lines;

  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const indent = getIndentLevel(line);

    // 找出这棵子树的范围（缩进大于当前行的连续后续行）
    let subtreeEnd = i + 1;
    while (subtreeEnd < lines.length && getIndentLevel(lines[subtreeEnd]) > indent) {
      subtreeEnd++;
    }
    const subtreeSize = subtreeEnd - i;

    if (subtreeSize > 4) {
      // 大子树：只保留根行 + 折叠提示
      const refMatch = line.match(/ref=ref_\d+/);
      if (refMatch) {
        result.push(`${line} [${subtreeSize - 1} children unchanged]`);
      } else {
        result.push(line);
        result.push(`${' '.repeat(indent + 2)}... (${subtreeSize - 1} unchanged children) ...`);
      }
      i = subtreeEnd;
    } else {
      result.push(line);
      i++;
    }
  }

  return result;
}

const SNAPSHOT_LISTENERS_INSTALLED = Symbol.for('chrome-crx.snapshot-cache.listeners-installed');
const snapshotCacheGlobal = globalThis as typeof globalThis & {
  [SNAPSHOT_LISTENERS_INSTALLED]?: boolean;
};

if (!snapshotCacheGlobal[SNAPSHOT_LISTENERS_INSTALLED]) {
  snapshotCacheGlobal[SNAPSHOT_LISTENERS_INSTALLED] = true;
  chrome.tabs.onRemoved.addListener((tabId) => {
    invalidateAllSessionsForTab(tabId);
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url !== undefined) invalidateAllSessionsForTab(tabId);
  });
  chrome.webNavigation?.onHistoryStateUpdated.addListener(({ tabId, frameId }) => {
    if (frameId === 0) invalidateAllSessionsForTab(tabId);
  });
}
