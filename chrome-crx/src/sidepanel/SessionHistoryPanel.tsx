import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Trash2, X, MessageSquare, ChevronRight } from 'lucide-react';
import { getStorageValue, setStorageValue } from '../extensionServices';
import { loadProviderConfig } from '../utils/providerStore';
import {
  SESSION_INDEX_KEY,
  SESSION_CONVERSATION_MAP_KEY,
  SESSION_REMOTE_MAP_KEY,
  LAST_ACTIVE_SESSION_KEY,
  collectTabSessionKeysToRemove,
  isSessionIndexEntry,
  isStringRecord,
  isSessionSnapshot
} from './sidepanelGuards';
import {
  getHistoryStorageKey,
  getConversationStorageKey,
  hasPersistableSessionContent
} from './sessionHistory';
import type { SessionIndexEntry } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;

  const date = new Date(timestamp);
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export function truncatePreview(text: string | undefined, maxLen: number): string {
  if (!text) return '空对话';
  const trimmed = text.trim();
  if (!trimmed) return '空对话';
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen) + '…';
}

export function getSessionModelLabel(
  providerId: string | undefined,
  providerNameById: Readonly<Record<string, string>>
): string | undefined {
  if (!providerId) return undefined;
  const providerName = providerNameById[providerId]?.trim();
  return providerName || undefined;
}

// ─── Session History Panel ────────────────────────────────────────────────────

export interface SessionHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadSession: (sessionId: string, conversationUuid?: string) => void;
  activeSessionId: string;
}

export function SessionHistoryPanel({
  isOpen,
  onClose,
  onLoadSession,
  activeSessionId
}: SessionHistoryPanelProps) {
  const [entries, setEntries] = useState<SessionIndexEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [providerNameById, setProviderNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    void loadProviderConfig(true)
      .then((config) => {
        if (!active) return;
        setProviderNameById(
          Object.fromEntries(
            config.providers.flatMap((provider) => {
              const providerName = provider.name.trim();
              return providerName ? [[provider.id, providerName]] : [];
            })
          )
        );
      })
      .catch(() => {
        if (active) setProviderNameById({});
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  // Load session index whenever the panel opens
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const raw = await getStorageValue(SESSION_INDEX_KEY, []);
        if (!active) return;
        const candidate: unknown[] = Array.isArray(raw) ? raw : [];
        // Filter to well-formed entries so a corrupted / migrated storage
        // payload can't crash the sort or downstream render.
        const list: SessionIndexEntry[] = candidate.filter(isSessionIndexEntry);
        const visibleEntries: SessionIndexEntry[] = [];

        for (const entry of list) {
          const snapshot = await getStorageValue(getHistoryStorageKey(entry.sessionId));
          if (isSessionSnapshot(snapshot) && hasPersistableSessionContent(snapshot)) {
            visibleEntries.push(entry);
            continue;
          }

          if (entry.conversationUuid) {
            const conversationSnapshot = await getStorageValue(
              getConversationStorageKey(entry.conversationUuid)
            );
            if (isSessionSnapshot(conversationSnapshot)) {
              if (hasPersistableSessionContent(conversationSnapshot)) {
                visibleEntries.push(entry);
              }
              continue;
            }
          }

          if (entry.preview?.trim()) {
            visibleEntries.push(entry);
          }
        }
        // Sort by updatedAt descending
        if (!active) return;
        visibleEntries.sort((a, b) => b.updatedAt - a.updatedAt);
        setEntries(visibleEntries);
        if (visibleEntries.length !== list.length) {
          await setStorageValue(SESSION_INDEX_KEY, visibleEntries);
        }
      } catch {
        if (active) setEntries([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isOpen]);

  // Delete a session entry and its stored data
  const handleDelete = useCallback(async (entry: SessionIndexEntry, event: React.MouseEvent) => {
    event.stopPropagation();
    setDeletingId(entry.sessionId);
    try {
      // Remove the stored snapshot
      const keysToRemove = [getHistoryStorageKey(entry.sessionId)];
      if (entry.conversationUuid) {
        keysToRemove.push(getConversationStorageKey(entry.conversationUuid));

        // Clean up conversation map
        const rawMap = await getStorageValue(SESSION_CONVERSATION_MAP_KEY, {});
        const currentMap = isStringRecord(rawMap) ? rawMap : {};
        if (currentMap[entry.conversationUuid] === entry.sessionId) {
          const nextMap = { ...currentMap };
          delete nextMap[entry.conversationUuid];
          await setStorageValue(SESSION_CONVERSATION_MAP_KEY, nextMap);
        }

        // Clean up remote map
        const rawRemoteMap = await getStorageValue(SESSION_REMOTE_MAP_KEY, {});
        const remoteMap = isStringRecord(rawRemoteMap) ? rawRemoteMap : {};
        if (entry.conversationUuid in remoteMap) {
          const nextRemoteMap = { ...remoteMap };
          delete nextRemoteMap[entry.conversationUuid];
          await setStorageValue(SESSION_REMOTE_MAP_KEY, nextRemoteMap);
        }
      }

      // Remove any tab→session aliases pointing at this session, and
      // clear the global last-active key if it also points here. Without
      // this cleanup, a future sidepanel open on a tab whose alias still
      // resolves to the deleted session would resurrect an empty entry
      // with the same id.
      const aliasKeys = await collectTabSessionKeysToRemove(entry.sessionId);
      keysToRemove.push(...aliasKeys);
      const lastActive = await getStorageValue(LAST_ACTIVE_SESSION_KEY);
      if (lastActive === entry.sessionId) {
        keysToRemove.push(LAST_ACTIVE_SESSION_KEY);
      }

      await chrome.storage.local.remove(keysToRemove);

      // Remove from index
      const raw = await getStorageValue(SESSION_INDEX_KEY, []);
      const list = Array.isArray(raw) ? (raw as SessionIndexEntry[]) : [];
      const filtered = list.filter((item) => item.sessionId !== entry.sessionId);
      await setStorageValue(SESSION_INDEX_KEY, filtered);
      setEntries(filtered);
    } catch {
      // ignore delete errors
    } finally {
      setDeletingId(null);
    }
  }, []);

  // Handle clicking a session entry
  const handleLoad = useCallback(
    (entry: SessionIndexEntry) => {
      if (entry.sessionId === activeSessionId) {
        onClose();
        return;
      }
      onLoadSession(entry.sessionId, entry.conversationUuid);
      onClose();
    },
    [activeSessionId, onLoadSession, onClose]
  );

  const displayEntries = entries;

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-[20] flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-[85%] max-w-[360px] h-full bg-bg-100 border-l border-border-200 shadow-xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border-300">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-text-300" />
            <h2 className="text-sm font-medium text-text-100">历史对话</h2>
            {displayEntries.length > 0 && (
              <span className="text-xs text-text-400 bg-bg-300 px-1.5 py-0.5 rounded-full">
                {displayEntries.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-text-300 hover:bg-bg-300 hover:text-text-100 transition-colors"
            aria-label="关闭历史"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-text-400">加载中…</div>
            </div>
          ) : displayEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <MessageSquare size={24} className="text-text-500 mb-3" />
              <p className="text-sm text-text-400">还没有历史对话</p>
              <p className="text-xs text-text-500 mt-1">开始聊天后会在这里保存记录</p>
            </div>
          ) : (
            <div className="py-1">
              {displayEntries.map((entry) => {
                const isDeleting = deletingId === entry.sessionId;
                const isActive = entry.sessionId === activeSessionId;
                const modelLabel = getSessionModelLabel(entry.model, providerNameById);
                return (
                  // Outer row is a div, not a button, so the nested
                  // delete <button> stays valid HTML and reachable for
                  // keyboard / screen-reader users.
                  <div
                    key={entry.sessionId}
                    role="button"
                    tabIndex={isDeleting ? -1 : 0}
                    aria-disabled={isDeleting}
                    aria-label={`${isActive ? '当前会话' : '加载会话'} ${truncatePreview(entry.preview, 30)}`}
                    onClick={() => {
                      if (!isDeleting) handleLoad(entry);
                    }}
                    onKeyDown={(e) => {
                      if (isDeleting) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleLoad(entry);
                      }
                    }}
                    className={
                      'w-full group flex items-start gap-3 px-4 py-3 text-left hover:bg-bg-200 transition-colors ' +
                      (isActive ? 'bg-bg-200/70 ' : '') +
                      (isDeleting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer')
                    }
                  >
                    <div className="shrink-0 mt-0.5">
                      <MessageSquare
                        size={14}
                        className={
                          isDeleting ? 'text-text-500' : 'text-text-400 group-hover:text-text-200'
                        }
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-200 truncate leading-snug">
                        {isDeleting ? '删除中…' : truncatePreview(entry.preview, 60)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-text-500">
                          {formatRelativeTime(entry.updatedAt)}
                        </span>
                        {modelLabel && (
                          <span className="text-[10px] text-text-500 bg-bg-300 px-1 py-0.5 rounded truncate max-w-[80px]">
                            {modelLabel}
                          </span>
                        )}
                        {isActive && (
                          <span className="text-[10px] text-text-400 bg-bg-300 px-1 py-0.5 rounded">
                            当前
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isActive ? null : (
                        <button
                          type="button"
                          onClick={(e) => handleDelete(entry, e)}
                          className="p-1 rounded-md text-text-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          aria-label="删除对话"
                          title="删除对话"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                      {isActive ? null : <ChevronRight size={12} className="text-text-500" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CSS animation (add to a global stylesheet or inline) ─────────────────────

export const SESSION_HISTORY_PANEL_STYLES = `
@keyframes slide-in-right {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
.animate-slide-in-right {
  animation: slide-in-right 0.2s ease-out;
}
`;
