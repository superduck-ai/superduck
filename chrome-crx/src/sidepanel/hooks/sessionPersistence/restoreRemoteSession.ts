import { type ApiConversationMessage } from '../../../messageTypes';
import { extractTextFromContent, pickEventMessage } from '../../session/history';
import { createId, type PermissionMode } from '../../sidepanelUtils';
import { ensureToolResultPairs } from '../../../utils/conversationProtocol';
import type { ChatMessage, SessionSnapshot } from '../../types';

interface RestoreRemoteSessionParams {
  apiKey: string;
  apiBaseUrl: string;
  selectedModel: string;
  permissionMode: PermissionMode;
  remoteSessionId: string;
  conversationUuid?: string | null;
}

export async function restoreRemoteSession({
  apiKey,
  apiBaseUrl,
  selectedModel,
  permissionMode,
  remoteSessionId,
  conversationUuid
}: RestoreRemoteSessionParams): Promise<SessionSnapshot | undefined> {
  if (!apiKey) return undefined;
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'ccr-byoc-2025-07-29'
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const [eventsResponse, sessionResponse] = await Promise.all([
      fetch(`${apiBaseUrl}/v1/sessions/${encodeURIComponent(remoteSessionId)}/events`, {
        method: 'GET',
        headers
      }),
      fetch(`${apiBaseUrl}/v1/sessions/${encodeURIComponent(remoteSessionId)}`, {
        method: 'GET',
        headers
      })
    ]);

    if (!eventsResponse.ok) {
      return undefined;
    }

    const eventsPayload = await eventsResponse.json();
    const events = Array.isArray(eventsPayload?.data)
      ? eventsPayload.data
      : Array.isArray(eventsPayload)
        ? eventsPayload
        : [];

    const apiMessages: ApiConversationMessage[] = [];
    const uiMessages: ChatMessage[] = [];
    for (const event of events) {
      const message = pickEventMessage(event);
      if (!message) continue;
      apiMessages.push(message);

      const text =
        typeof message.content === 'string'
          ? message.content.trim()
          : extractTextFromContent(message.content);
      if (!text) continue;
      uiMessages.push({
        id: createId(),
        role: message.role,
        text
      });
    }

    if (apiMessages.length === 0) {
      return undefined;
    }

    let restoredModel = selectedModel;
    if (sessionResponse.ok) {
      const sessionPayload = await sessionResponse.json();
      const sessionModel = sessionPayload?.session_context?.model;
      if (typeof sessionModel === 'string' && sessionModel) {
        restoredModel = sessionModel;
      }
    }

    return {
      uiMessages,
      apiMessages: ensureToolResultPairs(apiMessages),
      selectedModel: restoredModel,
      permissionMode,
      createdAt: Date.now(),
      conversationUuid: conversationUuid || undefined,
      remoteSessionId
    };
  } catch (error) {
    console.error('[sidepanel] failed to restore remote session', error);
    return undefined;
  }
}
