import { getStorageValue, removeStorageValues, setStorageValue } from '../../../extensionServices';
import { getConversationStorageKey, getHistoryStorageKey } from '../../session/history';
import {
  isStringRecord,
  SESSION_CONVERSATION_MAP_KEY,
  SESSION_INDEX_KEY
} from '../../sidepanelGuards';
import { ensureToolResultPairs } from '../../../utils/conversationProtocol';
import type { SessionIndexEntry, SessionSnapshot } from '../../types';

export async function upsertSessionIndex(entry: SessionIndexEntry) {
  const raw = await getStorageValue(SESSION_INDEX_KEY, []);
  const current = Array.isArray(raw) ? (raw as SessionIndexEntry[]) : [];
  const existing = current.find((item) => item.sessionId === entry.sessionId);
  const next = existing
    ? current.map((item) =>
        item.sessionId === entry.sessionId
          ? {
              ...entry,
              conversationUuid: entry.conversationUuid || item.conversationUuid,
              remoteSessionId: entry.remoteSessionId || item.remoteSessionId
            }
          : item
      )
    : [entry, ...current];
  next.sort((a, b) => b.updatedAt - a.updatedAt);
  await setStorageValue(SESSION_INDEX_KEY, next.slice(0, 200));
}

export async function removeSessionIndexEntry(sessionId: string) {
  const raw = await getStorageValue(SESSION_INDEX_KEY, []);
  const current = Array.isArray(raw) ? (raw as SessionIndexEntry[]) : [];
  const next = current.filter((item) => item.sessionId !== sessionId);
  if (next.length !== current.length) {
    await setStorageValue(SESSION_INDEX_KEY, next);
  }
}

export async function removeEmptySessionArtifacts(sessionId: string, snapshot: SessionSnapshot) {
  const keysToRemove = [getHistoryStorageKey(sessionId)];
  let ownsConversationSnapshot = false;

  if (snapshot.conversationUuid) {
    const rawMap = await getStorageValue(SESSION_CONVERSATION_MAP_KEY, {});
    const currentMap = isStringRecord(rawMap) ? rawMap : {};
    ownsConversationSnapshot = currentMap[snapshot.conversationUuid] === sessionId;
    if (ownsConversationSnapshot) {
      keysToRemove.push(getConversationStorageKey(snapshot.conversationUuid));
    }
  }

  await removeStorageValues(keysToRemove);
  await removeSessionIndexEntry(sessionId);

  if (snapshot.conversationUuid && ownsConversationSnapshot) {
    const rawMap = await getStorageValue(SESSION_CONVERSATION_MAP_KEY, {});
    const currentMap = isStringRecord(rawMap) ? rawMap : {};
    if (currentMap[snapshot.conversationUuid] === sessionId) {
      const nextMap = { ...currentMap };
      delete nextMap[snapshot.conversationUuid];
      await setStorageValue(SESSION_CONVERSATION_MAP_KEY, nextMap);
    }
  }
}

export function withValidApiMessages(snapshot: SessionSnapshot): SessionSnapshot {
  return {
    ...snapshot,
    apiMessages: ensureToolResultPairs(snapshot.apiMessages)
  };
}
