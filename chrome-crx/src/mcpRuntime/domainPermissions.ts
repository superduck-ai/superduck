import { PermissionManager as PermissionManagerClass } from '@/permissions/PermissionManager';
import { categoryChecker, tabGroupManager } from './tabState';
import { extractHostname } from './core/utils';
import type { PermissionPromptRequest, TabGroupRecord } from './core/types';
import type { ToolResult } from './pageToolsSupport/types';

export const PermissionTools = {
  EXECUTE_JAVASCRIPT: 'execute_javascript',
  NAVIGATE: 'navigate',
  READ_PAGE_CONTENT: 'read_page_content',
  UPLOAD_IMAGE: 'upload_image',
  UPLOAD_FILE: 'upload_file',
  TYPE: 'type',
  CLICK: 'click',
  READ_CONSOLE_MESSAGES: 'read_console_messages',
  READ_NETWORK_REQUESTS: 'read_network_requests',
  PLAN_APPROVAL: 'plan_approval'
} as const;

export const PermissionType = {
  DOMAIN_TRANSITION: 'domain_transition'
} as const;

interface SecurityCheckResult extends ToolResult {
  error: string;
}

export async function checkUrlSecurity(
  _tabId: number,
  url: string,
  actionName: string
): Promise<SecurityCheckResult | null> {
  try {
    const blockedProtocols = [
      'chrome:',
      'chrome-extension:',
      'about:',
      'data:',
      'javascript:',
      'file:'
    ];
    for (const protocol of blockedProtocols) {
      if (url.startsWith(protocol)) {
        return { error: `Cannot perform ${actionName} on ${protocol} URLs` };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function createBridgePermissionManager(
  permissionMode?: string,
  allowedDomains?: string[]
): PermissionManagerClass | undefined {
  if (!permissionMode || 'ask' === permissionMode) return undefined;
  const skipAll = 'skip_all_permission_checks' === permissionMode;
  const manager = new PermissionManagerClass(() => skipAll, {});
  if ('follow_a_plan' === permissionMode && allowedDomains?.length) {
    manager.setTurnApprovedDomains(allowedDomains);
  }
  return manager;
}

export async function getTabRelationship(
  mainTabId: number,
  tabId: number
): Promise<{
  isMainTab: boolean;
  isSecondaryTab: boolean;
  group: TabGroupRecord;
}> {
  const isMainTab = tabId === mainTabId;
  await tabGroupManager.initialize();
  const group = await tabGroupManager.findGroupByTab(tabId);
  return {
    isMainTab,
    isSecondaryTab: !!group && group.mainTabId === mainTabId && tabId !== mainTabId,
    group
  };
}

export function isBlockedCategory(category: string): boolean {
  return 'category1' === category || 'category2' === category;
}

export function detectDomainTransition(
  currentUrl: string,
  newUrl: string
): { oldDomain: string; newDomain: string } | null {
  if (
    !currentUrl ||
    currentUrl.startsWith('chrome://') ||
    currentUrl.startsWith('chrome-extension://') ||
    currentUrl.startsWith('edge://') ||
    currentUrl.startsWith('brave://') ||
    currentUrl.startsWith('about:') ||
    '' === currentUrl
  ) {
    return null;
  }
  const oldDomain = extractHostname(currentUrl);
  const newDomain = extractHostname(newUrl);
  return oldDomain && newDomain && oldDomain !== newDomain && 'newtab' !== oldDomain
    ? { oldDomain, newDomain }
    : null;
}

export async function getCategoryAndUpdateBlocklist(
  tabId: number,
  url: string
): Promise<string | null> {
  const category = await categoryChecker.getCategory(url);
  await tabGroupManager.updateTabBlocklistStatus(tabId, url);
  return category ?? null;
}

export function getBlockedPageUrl(url: string): string {
  return chrome.runtime.getURL(`blocked.html?url=${encodeURIComponent(url)}`);
}

export function createDomainTransitionPermission(
  fromDomain: string,
  toDomain: string,
  url: string,
  sourceTabId: number,
  isSecondaryTab: boolean
): PermissionPromptRequest {
  return {
    type: 'permission_required',
    tool: PermissionType.DOMAIN_TRANSITION,
    url,
    toolUseId: crypto.randomUUID(),
    actionData: {
      fromDomain,
      toDomain,
      sourceTabId,
      isSecondaryTab
    }
  };
}
