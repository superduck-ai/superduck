import type { TabGroupManager } from './tabGroups';
import {
  DEFAULT_SESSION_KEY,
  TAB_GROUP_MARKER,
  TAB_GROUP_TITLE,
  type GroupMetadata
} from './types';

const COMPLETED_GROUP_PREFIX = '✅';

const PREFIX_PATTERN = /^(⌛|🔔|✅)/;

export function markGroupTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed.includes(TAB_GROUP_MARKER) ? trimmed : `${TAB_GROUP_MARKER} ${trimmed}`;
}

export function resolveBaseGroupTitle(
  mgr: TabGroupManager,
  sessionId?: string,
  fallbackTitle?: string
): string {
  const named = sessionId
    ? mgr.sessionGroupTitles.get(sessionId)
    : mgr.sessionGroupTitles.get(DEFAULT_SESSION_KEY);
  if (named) return markGroupTitle(named);
  return fallbackTitle ? markGroupTitle(fallbackTitle) : TAB_GROUP_TITLE;
}

function stripStatusPrefix(title: string): string {
  return title.replace(PREFIX_PATTERN, '').trim();
}

export function decorateGroupTitleForStatus(
  title: string,
  status?: GroupMetadata['status']
): string {
  const stripped = stripStatusPrefix(title);
  return status === 'completed' ? `${COMPLETED_GROUP_PREFIX}${stripped}` : stripped;
}

export function resolveGroupDisplayTitle(
  mgr: TabGroupManager,
  sessionId?: string,
  status?: GroupMetadata['status'],
  fallbackTitle?: string
): string {
  return decorateGroupTitleForStatus(resolveBaseGroupTitle(mgr, sessionId, fallbackTitle), status);
}

export function resolveGroupDisplayColor(status?: GroupMetadata['status']): chrome.tabGroups.Color {
  if (status === 'completed') {
    return chrome.tabGroups.Color.GREEN ?? chrome.tabGroups.Color.ORANGE;
  }
  return chrome.tabGroups.Color.ORANGE;
}

export function buildGroupAppearanceUpdate(
  mgr: TabGroupManager,
  meta: Pick<GroupMetadata, 'sessionId' | 'status' | 'title'>
): { title: string; color: chrome.tabGroups.Color } {
  return {
    title: resolveGroupDisplayTitle(mgr, meta.sessionId, meta.status, meta.title),
    color: resolveGroupDisplayColor(meta.status)
  };
}
