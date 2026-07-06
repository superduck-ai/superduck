import { useCallback, useRef } from 'react';
import { type SupportedLocale, useIntlSafe } from '../../index-react-dom-intl';
import { tabGroupManager, trackEvent } from '../../mcpRuntime';
import {
  generateConversationTitle as generateConversationTitleFunction,
  resolveSpecialCommand,
  type ModelInvoker
} from '../session';
import { ConversationCompactor } from '../conversation/conversationCompaction';
import { MessagesClient } from '../../mcpServersStore';
import { MAX_TOKENS } from '../conversation/messageLimits';
import { getErrorMessage } from '../conversation/messageProcessing';
import {
  createId,
  getTextFromBlockContent,
  type PermissionMode,
  type PromptAttachmentPayload
} from '../sidepanelUtils';
import { createStreamingTextStore } from '../sidepanelGuards';
import type {
  ApiConversationMessage,
  ApiResponseMessage,
  ApiToolResultBlock,
  CreateApiMessageParams
} from '../../messageTypes';
import { getStatusSummaryLanguageInstruction } from '@/sidepanel/components/StatusDisplay';
import { getStorageValue, StorageKeys } from '../../extensionServices';
import type { PermissionManager } from '@/permissions/PermissionManager';
import type {
  ChatRole,
  VisibleChatRole,
  NotificationPreference,
  SendPromptOptions,
  ToolUseBlock
} from '../types';
import { useChatStore } from '../stores/chatStore';
import { useAgentStore } from '../stores/agentStore';
import { useAttachmentStore } from '../stores/attachmentStore';
import { useModelStore } from '../stores/modelStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useUIStore } from '../stores/uiStore';
import { prepareUserMessage } from './agentLoop/prepareUserMessage';
import { streamAndProcess, type RafState } from './agentLoop/streamAndProcess';
import { executeToolUses, type ReminderState } from './agentLoop/executeToolUses';
import { compactInLoop } from './agentLoop/compactInLoop';
import { handleStreamError, type RetryState } from './agentLoop/handleStreamError';
import { handleSendPromptError } from './agentLoop/handleSendPromptError';
import {
  deriveSidepanelGroupTitle,
  ensureSidepanelManagedGroup,
  updateSidepanelGroupTitle
} from './agentLoop/sidepanelGroupTitle';

// ─── Hook interface ────────────────────────────────────────────────────────────

export interface UseAgentLoopProps {
  // UI state values (still need to be passed — can't all come from stores due to callbacks)
  systemPrompt: string | Array<{ type: string; text: string; cache_control?: unknown }>;

  // Refs (must be passed — refs can't be stored in Zustand)
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  generationStartedAtRef: React.MutableRefObject<number | null>;
  completionNotificationSentRef: React.MutableRefObject<boolean>;
  iterationCountRef: React.MutableRefObject<number>;
  lastSentPayloadRef: React.MutableRefObject<{
    text: string;
    attachments: PromptAttachmentPayload[];
    isAnnotated: boolean;
  } | null>;
  serverContextLengthRef: React.MutableRefObject<number | undefined>;
  notificationBannerTimerRef: React.MutableRefObject<number | null>;
  notificationsEnabledRef: React.MutableRefObject<NotificationPreference>;
  selectedModelRef: React.MutableRefObject<string>;
  selectedModel: string;
  permissionModeRef: React.MutableRefObject<PermissionMode>;
  hasApprovedPlanRef: React.MutableRefObject<boolean>;
  streamingTextStoreRef: React.MutableRefObject<ReturnType<typeof createStreamingTextStore>>;

  // Callbacks (complex business logic, can't be stored)
  pushMessage: (role: ChatRole | VisibleChatRole, text: string) => void;
  executeToolUse: (toolUse: ToolUseBlock) => Promise<ApiToolResultBlock>;
  createApiMessage: (params: CreateApiMessageParams) => Promise<ApiResponseMessage>;
  invokeSessionModel: ModelInvoker;
  updateLastAssistantMessage: (text: string) => void;
  flushStreamingText: () => void;
  appendVisibleLocalMessages: (entries: Array<{ role: VisibleChatRole; text: string }>) => void;
  getPermissionManager: () => PermissionManager;

  // Provider
  effectiveMessagesClient: InstanceType<typeof MessagesClient> | null;

  // Query
  queryTabId: number | undefined;

  // Intl
  intl: ReturnType<typeof useIntlSafe>;
}

export interface UseAgentLoopReturn {
  sendPrompt: (text: string, options?: SendPromptOptions) => Promise<void>;
  compactConversation: (
    manual?: boolean,
    options?: { visibleCommandText?: string }
  ) => Promise<ApiConversationMessage[]>;
  sendCompletionNotification: (tabId?: number, answerText?: string) => Promise<void>;
  generateStatusSummary: (text: string) => Promise<void>;
  generateConversationTitle: (
    userMessage: Pick<ApiConversationMessage, 'content'>
  ) => Promise<void>;
}

const MAX_NOTIFICATION_ANSWER_LENGTH = 240;

function formatNotificationAnswer(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_NOTIFICATION_ANSWER_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_NOTIFICATION_ANSWER_LENGTH - 3).trimEnd()}...`;
}

// ─── Hook implementation ─────────────────────────────────────────────────────

export function useAgentLoop({
  systemPrompt,
  abortControllerRef,
  generationStartedAtRef,
  completionNotificationSentRef,
  iterationCountRef,
  lastSentPayloadRef,
  serverContextLengthRef,
  notificationBannerTimerRef,
  notificationsEnabledRef,
  selectedModelRef,
  selectedModel,
  permissionModeRef,
  hasApprovedPlanRef,
  streamingTextStoreRef,
  pushMessage,
  executeToolUse,
  createApiMessage,
  invokeSessionModel,
  updateLastAssistantMessage,
  flushStreamingText,
  appendVisibleLocalMessages,
  getPermissionManager,
  effectiveMessagesClient,
  queryTabId,
  intl
}: UseAgentLoopProps): UseAgentLoopReturn {
  // ─── Read state from Zustand stores (no prop drilling) ───────────────────
  const apiMessages = useChatStore((s) => s.apiMessages);
  const setApiMessages = useChatStore((s) => s.setApiMessages);
  const setMessages = useChatStore((s) => s.setMessages);
  const setIsAgentRunning = useAgentStore((s) => s.setIsAgentRunning);
  const setHasInteractiveTools = useAgentStore((s) => s.setHasInteractiveTools);
  const setCurrentStatus = useAgentStore((s) => s.setCurrentStatus);
  const setRuntimeError = useAgentStore((s) => s.setRuntimeError);
  const setLastStopReason = useAgentStore((s) => s.setLastStopReason);
  const setIsCompacting = useAgentStore((s) => s.setIsCompacting);
  const setTokensSaved = useAgentStore((s) => s.setTokensSaved);
  const isCompacting = useAgentStore((s) => s.isCompacting);
  const setAttachmentCount = useAttachmentStore((s) => s.setAttachmentCount);
  const setPendingAttachments = useAttachmentStore((s) => s.setPendingAttachments);
  const setPreviewAttachmentImage = useAttachmentStore((s) => s.setPreviewAttachmentImage);
  const toolSchemas = useModelStore((s) => s.toolSchemas);
  const notificationsEnabled = useNotificationStore((s) => s.notificationsEnabled);
  const setMessageLimit = useNotificationStore((s) => s.setMessageLimit);
  const setMessageLimitDismissed = useUIStore((s) => s.setIsMessageLimitDismissed);
  const setShowNotificationBanner = useUIStore((s) => s.setShowNotificationBanner);
  const lastFailedBrowserBatchSignatureRef = useRef<string | null>(null);

  // ─── Compact conversation ─────────────────────────────────────────────────

  const compactConversation = useCallback(
    async (
      manual = false,
      options?: { visibleCommandText?: string }
    ): Promise<ApiConversationMessage[]> => {
      const visibleCommandText = options?.visibleCommandText?.trim();
      const messagesToCompact = apiMessages.filter((msg) => !msg.isLocalOnlyMessage);

      if (messagesToCompact.length === 0) {
        if (visibleCommandText) {
          appendVisibleLocalMessages([
            { role: 'user', text: visibleCommandText },
            {
              role: 'assistant',
              text: intl.formatMessage({
                id: 'agent.noHistoryToCompact',
                defaultMessage: 'No conversation history to clear'
              })
            }
          ]);
        }
        return apiMessages;
      }

      if (isCompacting) return apiMessages;

      if (visibleCommandText) {
        pushMessage('user', visibleCommandText);
        const visibleCommandMessage: ApiConversationMessage = {
          role: 'user',
          content: visibleCommandText,
          isLocalOnlyMessage: true
        };
        setApiMessages((prev) => [...prev, visibleCommandMessage]);
      }

      setIsCompacting(true);
      try {
        const compactor = new ConversationCompactor(
          async (params: CreateApiMessageParams) => createApiMessage(params),
          intl.locale,
          serverContextLengthRef.current
        );
        const result = await compactor.compactConversation(messagesToCompact, MAX_TOKENS, !manual);
        void trackEvent('superduck.sidebar.conversation_compacted', {
          manual,
          messages_before: messagesToCompact.length
        });
        const visibleCommandMessage = visibleCommandText
          ? ({
              role: 'user',
              content: visibleCommandText,
              isLocalOnlyMessage: true
            } as ApiConversationMessage)
          : null;
        setApiMessages(
          visibleCommandMessage
            ? [visibleCommandMessage, ...result.messagesAfterCompacting]
            : result.messagesAfterCompacting
        );
        setTokensSaved(result.tokensSaved ?? null);
        pushMessage('system', 'Conversation compacted to save context.');
        return visibleCommandMessage
          ? [visibleCommandMessage, ...result.messagesAfterCompacting]
          : result.messagesAfterCompacting;
      } catch (error) {
        const errorText = `Compaction failed: ${getErrorMessage(error)}`;
        pushMessage('system', errorText);
        appendVisibleLocalMessages([{ role: 'assistant', text: errorText }]);
        return apiMessages;
      } finally {
        setIsCompacting(false);
      }
    },
    [
      apiMessages,
      appendVisibleLocalMessages,
      createApiMessage,
      intl.locale,
      isCompacting,
      pushMessage
    ]
  );

  // ─── Send completion notification ─────────────────────────────────────────

  const sendCompletionNotification = useCallback(
    async (tabId?: number, answerText = '') => {
      let notificationPreference = notificationsEnabledRef.current;
      if (notificationPreference === undefined) {
        const storedValue = await getStorageValue(StorageKeys.NOTIFICATIONS_ENABLED);
        notificationPreference =
          storedValue === 'enabled' || storedValue === 'disabled' ? storedValue : undefined;
        notificationsEnabledRef.current = notificationPreference;
      }
      if (notificationPreference !== 'enabled') return;
      if (!generationStartedAtRef.current || completionNotificationSentRef.current) return;
      completionNotificationSentRef.current = true;
      const notificationTabId =
        typeof tabId === 'number' && Number.isFinite(tabId) ? String(tabId) : 'unknown';
      const answerSummary = formatNotificationAnswer(answerText);
      try {
        await chrome.notifications.create(`notification_${notificationTabId}_${Date.now()}`, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icon-128.png'),
          title: intl.formatMessage({
            id: 'superduck_is_done',
            defaultMessage: 'SuperDuck is done'
          }),
          message:
            answerSummary ||
            intl.formatMessage({
              id: 'superduck_completion_no_answer',
              defaultMessage: 'SuperDuck finished without a text response.'
            }),
          priority: 2
        });
      } catch (error) {
        console.warn('Failed to show notification:', error);
      }
    },
    [intl]
  );

  // ─── Generate status summary ──────────────────────────────────────────────

  const generateStatusSummary = useCallback(
    async (text: string) => {
      try {
        if (!text || !text.trim()) return;
        const localeInstruction = getStatusSummaryLanguageInstruction(
          intl.locale as SupportedLocale
        );
        const response = await createApiMessage({
          messages: [
            {
              role: 'user',
              content: `<message>\n${text.slice(0, 500)}\n</message>\n\nBased on this message, generate a 7-word-or-less status describing the high-level task or goal SuperDuck is working on. Put it between <status> tags. ${localeInstruction}`
            },
            {
              role: 'assistant',
              content: 'Here is the status:\n\n<status>'
            }
          ],
          max_tokens: 128,
          system: `Generate ultra-concise status updates describing the current high-level task or goal.\nYour status should describe WHAT SuperDuck is trying to accomplish, not the specific action.\n\nREQUIREMENTS:\n- Maximum 7 words\n- Describe the goal/task, not the action\n- Be high-level and task-oriented\n- No punctuation at the end\n- ${localeInstruction}\n\nExamples of GOOD statuses (goal-oriented):\n- Researching company information\n- Looking up flight options\n- Completing checkout process\n- Finding product details\n- Setting up account\n- Analyzing search results\n- Gathering page content\n\nExamples of BAD statuses (too action-specific):\n- Clicking submit button\n- Reading page content\n- Taking screenshot\n- Typing into form field`
        });
        if (response?.content) {
          const fullText = getTextFromBlockContent(response.content);
          const match =
            fullText.match(/<status>(.*?)<\/status>/s) || fullText.match(/^(.*?)<\/status>/s);
          if (match?.[1]) {
            setCurrentStatus(match[1].trim());
          }
        }
      } catch {
        // silently fail status generation
      }
    },
    [createApiMessage, intl.locale]
  );

  // ─── Generate conversation title ──────────────────────────────────────────

  const generateConversationTitle = useCallback(
    async (userMessage: Pick<ApiConversationMessage, 'content'>, tabId?: number) => {
      const effectiveTabId = tabId ?? queryTabId;
      if (typeof effectiveTabId !== 'number') return;
      try {
        const title = await generateConversationTitleFunction(
          userMessage,
          invokeSessionModel,
          intl.locale as SupportedLocale
        );

        if (title) {
          await updateSidepanelGroupTitle(effectiveTabId, title, true);
        }
      } catch {
        // silently fail title generation
      }
    },
    [invokeSessionModel, queryTabId, intl.locale]
  );

  // ─── Send prompt (main agent loop) ────────────────────────────────────────

  const sendPrompt = useCallback(
    async (text: string, options?: SendPromptOptions) => {
      const trimmed = text.trim();
      const attachments = options?.attachments ?? [];
      if (!trimmed && attachments.length === 0) return;
      if (!effectiveMessagesClient) {
        setRuntimeError('API not configured. Please set up your provider in Settings.');
        return;
      }
      lastFailedBrowserBatchSignatureRef.current = null;
      const reminderState: ReminderState = {
        navigationObserve: false,
        browserBatch: false,
        browserBatchFailure: false
      };

      // Capture the tab ID at the start of execution so that switching tabs
      // doesn't redirect tool calls or indicator messages to a different tab.
      const executionTabId = options?.targetTabId ?? queryTabId;

      // --- System command interception (matching compiled zs/Rs) ---
      const slashCommand = trimmed.startsWith('/') ? trimmed.slice(1) : '';
      const matchedSpecialCommand =
        slashCommand && !slashCommand.includes(' ')
          ? resolveSpecialCommand(slashCommand, intl)
          : undefined;
      const systemCommand =
        matchedSpecialCommand?.command ?? (trimmed === '/share' ? 'share' : null);

      if (systemCommand === 'compact') {
        await compactConversation(true, { visibleCommandText: trimmed });
        return;
      }

      if (systemCommand === 'share') {
        pushMessage(
          'assistant',
          intl.formatMessage({
            id: 'agent.shareNotImplemented',
            defaultMessage: 'Share feature is not yet implemented.'
          })
        );
        return;
      }

      lastSentPayloadRef.current = {
        text: trimmed,
        attachments,
        isAnnotated: !!options?.isAnnotated
      };

      setRuntimeError(null);
      setIsAgentRunning(true);
      let turnCompleted = false;
      let turnHeartbeatInterval: number | null = null;
      // Mark the turn active in the background so the agent-indicator heartbeat
      // (authoritative state lives in the service worker) keeps the mask alive
      // for the duration of the turn. The matching active:false is sent in the
      // finally block below to dismiss the mask when the response completes.
      if (typeof executionTabId === 'number') {
        await ensureSidepanelManagedGroup(executionTabId).catch(() => {});
        const sendTurnActive = () => {
          chrome.runtime
            .sendMessage({ type: 'AGENT_TURN_ACTIVE', tabId: executionTabId, active: true })
            .catch(() => {});
        };
        sendTurnActive();
        turnHeartbeatInterval = window.setInterval(sendTurnActive, 45_000);
      }
      abortControllerRef.current?.abort();
      generationStartedAtRef.current = Date.now();
      completionNotificationSentRef.current = false;

      // Reset plan approval state at start of new message when in follow_a_plan mode
      if (permissionModeRef.current === 'follow_a_plan') {
        hasApprovedPlanRef.current = false;
        const pm = getPermissionManager();
        pm.clearTurnApprovedDomains();
      }
      if (
        apiMessages.length === 0 &&
        notificationsEnabled === undefined &&
        notificationBannerTimerRef.current === null
      ) {
        notificationBannerTimerRef.current = window.setTimeout(() => {
          if (notificationsEnabledRef.current === undefined) {
            setShowNotificationBanner(true);
          }
          notificationBannerTimerRef.current = null;
        }, 30000);
      }

      pushMessage('user', trimmed || '[Image input]');

      try {
        const prepared = await prepareUserMessage({
          trimmed,
          attachments,
          isAnnotated: !!options?.isAnnotated,
          executionTabId,
          apiMessages,
          serverContextLengthRef,
          compactConversation,
          permissionModeRef,
          hasApprovedPlanRef,
          setApiMessages
        });
        let workingMessages = prepared.workingMessages;
        const baseMessages = prepared.baseMessages;

        const MAX_STREAM_RETRIES = 10;
        let continueLoop = true;
        iterationCountRef.current = 0;

        // Add loading prefix to tab group
        if (typeof executionTabId === 'number') {
          tabGroupManager.addLoadingPrefix(executionTabId).catch(() => {});
        }

        // Generate title from first user message
        if (baseMessages.length === 0) {
          if (typeof executionTabId === 'number') {
            const fallbackTitle = deriveSidepanelGroupTitle(trimmed, intl.locale);
            await updateSidepanelGroupTitle(executionTabId, fallbackTitle, true).catch(() => {});
          }
          const lastMsg = workingMessages[workingMessages.length - 1];
          generateConversationTitle(lastMsg, executionTabId).catch(() => {});
        }

        setCurrentStatus('');

        while (continueLoop) {
          continueLoop = false;
          iterationCountRef.current++;
          const controller = new AbortController();
          abortControllerRef.current = controller;

          // Re-check tab URL after first iteration
          if (iterationCountRef.current > 1 && typeof executionTabId === 'number') {
            try {
              await chrome.tabs.get(executionTabId);
            } catch {
              // tab may have been closed
            }
          }

          // Clear streaming store from any previous iteration before adding new placeholder
          streamingTextStoreRef.current.set('');
          // Add a streaming placeholder for the assistant response
          setMessages((prev) => [
            ...prev,
            { id: createId(), role: 'assistant' as ChatRole, text: '' }
          ]);

          const retryState: RetryState = { count: 0 };
          let shouldRetry = false;
          const rafState: RafState = { rafId: null, pending: false };

          do {
            shouldRetry = false;
            try {
              const streamResult = await streamAndProcess({
                workingMessages,
                systemPrompt,
                selectedModel,
                effectiveMessagesClient,
                toolSchemas,
                controller,
                rafState,
                serverContextLengthRef,
                executionTabId,
                updateLastAssistantMessage,
                flushStreamingText,
                setMessages,
                setApiMessages,
                setLastStopReason,
                setMessageLimit,
                setMessageLimitDismissed,
                sendCompletionNotification
              });
              if (streamResult.shouldBreak) break;
              workingMessages = streamResult.workingMessages;
              const { accumulatedText, toolUses } = streamResult;

              const toolResult = await executeToolUses({
                toolUses,
                accumulatedText,
                workingMessages,
                controller,
                executionTabId,
                permissionModeRef,
                hasApprovedPlanRef,
                lastFailedBrowserBatchSignatureRef,
                reminderState,
                executeToolUse,
                getPermissionManager,
                pushMessage,
                setHasInteractiveTools,
                setCurrentStatus,
                generateStatusSummary,
                setApiMessages
              });
              workingMessages = toolResult.workingMessages;

              const compactResult = await compactInLoop({
                workingMessages,
                serverContextLengthRef,
                createApiMessage,
                locale: intl.locale,
                setApiMessages,
                pushMessage
              });
              workingMessages = compactResult.workingMessages;

              continueLoop = true;
            } catch (error) {
              const { shouldRetry: shouldRetryAfterError } = await handleStreamError({
                error,
                retryState,
                maxRetries: MAX_STREAM_RETRIES,
                rafState,
                streamingTextStoreRef,
                setMessages
              });
              if (shouldRetryAfterError) {
                shouldRetry = true;
                continue;
              }
              throw error;
            }
          } while (shouldRetry);
        }
        turnCompleted = true;
      } catch (error) {
        handleSendPromptError({
          error,
          selectedModelRef,
          setMessageLimit,
          pushMessage,
          setRuntimeError
        });
      } finally {
        if (turnHeartbeatInterval) {
          window.clearInterval(turnHeartbeatInterval);
        }
        if (notificationBannerTimerRef.current) {
          window.clearTimeout(notificationBannerTimerRef.current);
          notificationBannerTimerRef.current = null;
        }
        abortControllerRef.current = null;
        setIsAgentRunning(false);
        setHasInteractiveTools(false);
        setCurrentStatus('');
        setAttachmentCount(0);
        setPendingAttachments([]);
        setPreviewAttachmentImage(null);
        generationStartedAtRef.current = null;
        completionNotificationSentRef.current = false;
        // Hide agent indicators and add completion prefix to tab group
        if (typeof executionTabId === 'number') {
          // Tell the background to release the turn: it clears indicator state
          // (authoritative) for the whole group and sends HIDE, so the mask
          // dismisses when the message completes — even if the working tab
          // differs from executionTabId or a per-tool HIDE was dropped.
          const response = await chrome.runtime
            .sendMessage({
              type: 'AGENT_TURN_ACTIVE',
              tabId: executionTabId,
              active: false,
              completed: turnCompleted
            })
            .catch(() => ({ success: false }));
          if (!response?.success) {
            const group = await tabGroupManager.findGroupByTab(executionTabId).catch(() => null);
            if (group && !group.isUnmanaged) {
              await tabGroupManager.clearIndicatorsForGroup(group.mainTabId).catch(() => {});
              if (turnCompleted) {
                await tabGroupManager.addCompletionPrefix(group.mainTabId).catch(() => {});
                await tabGroupManager
                  .setGroupColor(group.mainTabId, chrome.tabGroups.Color.GREEN)
                  .catch(() => {});
              }
            } else {
              await tabGroupManager.hideAgentIndicatorsForTab(executionTabId).catch(() => {});
            }
          }
        }
      }
    },
    [
      effectiveMessagesClient,
      apiMessages,
      compactConversation,
      executeToolUse,
      notificationsEnabled,
      pushMessage,
      queryTabId,
      selectedModel,
      sendCompletionNotification,
      systemPrompt,
      toolSchemas,
      intl,
      updateLastAssistantMessage,
      flushStreamingText
    ]
  );

  return {
    sendPrompt,
    compactConversation,
    sendCompletionNotification,
    generateStatusSummary,
    generateConversationTitle
  };
}
