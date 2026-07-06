import { tabGroupManager } from '../../../mcpRuntime';

const FALLBACK_TITLE_MAX_LENGTH = 48;

export function deriveSidepanelGroupTitle(input: string, locale: string): string {
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (!normalized) return locale === 'zh-CN' ? '图片任务' : 'Image task';
  if (normalized.length <= FALLBACK_TITLE_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, FALLBACK_TITLE_MAX_LENGTH - 3).trimEnd()}...`;
}

export async function ensureSidepanelManagedGroup(tabId: number): Promise<void> {
  await tabGroupManager.initialize(true);
  const existing = await tabGroupManager.findGroupByTab(tabId);
  if (existing) return;
  await tabGroupManager.createGroup(tabId);
}

export async function updateSidepanelGroupTitle(
  tabId: number,
  title: string,
  isLoading = true
): Promise<void> {
  await tabGroupManager.initialize();
  await tabGroupManager.updateGroupTitle(tabId, title, isLoading);
}
