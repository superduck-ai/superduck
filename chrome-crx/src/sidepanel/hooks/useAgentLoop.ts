import { useCallback } from 'react';
import { DEFAULT_MODEL } from '../../constants/models';
import { type SupportedLocale, useIntlSafe } from '../../index-react-dom-intl';
import {
  tabGroupManager,
  shouldShowPlanMode,
  getPlanModeSystemReminder,
  filterAndApproveDomains,
  trackEvent
} from '../../mcpRuntime';
import {
  generateConversationTitle as generateConversationTitleFunction,
  resolveSpecialCommand,
  type ModelInvoker
} from '../sessionPool';
import { ConversationCompactor } from '../conversationCompaction';
import { dispatchMessagesClient } from '../../utils/providerClient';
import { MessagesClient } from '../../mcpServersStore';
import {
  MAX_TOKENS,
  calculateMessageLimitFromUsage,
  parseMessageLimit,
  parseRateLimitFromError,
  parseRateLimitHeaders,
  shouldUpdateMessageLimit,
  type MessageLimitState
} from '../messageLimits';
import { getErrorMessage, prepareMessagesForApi } from '../messageProcessing';
import { resolveShortcutMarkersInMessages } from '../shortcutMarkers';
import { extractTextFromContent } from '../sessionHistory';
import {
  createId,
  getTextFromBlockContent,
  type PermissionMode,
  type PromptAttachmentPayload
} from '../sidepanelUtils';
import {
  getStreamHeaders,
  normalizeImageMediaType,
  createStreamingTextStore
} from '../sidepanelGuards';
import type {
  ApiConversationMessage,
  ApiInputContentBlock,
  ApiResponseMessage,
  ApiToolResultBlock,
  CreateApiMessageParams
} from '../../messageTypes';
import { isToolUseContentBlock } from '../../messageTypes';
import { checkToolAllowed, getPageType } from '../planMode';
import { manageScreenshotHistory } from '../lightningCommands';
import { getStatusSummaryLanguageInstruction } from '../StatusDisplay';
import type { PermissionManager } from '../../PermissionManager';
import type { ToolProviderSchema } from '../../mcpRuntime/pageToolsSupport/types';
import type {
  ChatRole,
  VisibleChatRole,
  NotificationPreference,
  ChatMessage,
  ResponseWithMessageLimit,
  ToolUseBlock
} from '../types';

// ─── Hook interface ────────────────────────────────────────────────────────────

export interface UseAgentLoopProps {
  // Messages state
  apiMessages: ApiConversationMessage[];
  setApiMessages: React.Dispatch<React.SetStateAction<ApiConversationMessage[]>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setMessageHistory: React.Dispatch<React.SetStateAction<ApiConversationMessage[]>>;

  // UI state setters
  setIsAgentRunning: React.Dispatch<React.SetStateAction<boolean>>;
  setHasInteractiveTools: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentStatus: React.Dispatch<React.SetStateAction<string>>;
  setAttachmentCount: React.Dispatch<React.SetStateAction<number>>;
  setPendingAttachments: React.Dispatch<React.SetStateAction<PromptAttachmentPayload[]>>;
  setPreviewAttachmentImage: React.Dispatch<React.SetStateAction<string | null>>;
  setRuntimeError: React.Dispatch<React.SetStateAction<string | null>>;
  setMessageLimit: React.Dispatch<React.SetStateAction<MessageLimitState>>;
  setMessageLimitDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  setLastStopReason: React.Dispatch<
    React.SetStateAction<{ reason: string; messageId?: string } | null>
  >;
  setShowNotificationBanner: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCompacting: React.Dispatch<React.SetStateAction<boolean>>;
  setTokensSaved: React.Dispatch<React.SetStateAction<number | null>>;

  // State values
  selectedModel: string;
  notificationsEnabled: NotificationPreference;
  toolSchemas: ToolProviderSchema[];
  systemPrompt: string | Array<{ type: string; text: string; cache_control?: unknown }>;
  isCompacting: boolean;

  // Refs
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
  permissionModeRef: React.MutableRefObject<PermissionMode>;
  hasApprovedPlanRef: React.MutableRefObject<boolean>;
  streamingTextStoreRef: React.MutableRefObject<ReturnType<typeof createStreamingTextStore>>;

  // Callbacks
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
  sendPrompt: (
    text: string,
    options?: { attachments?: PromptAttachmentPayload[]; isAnnotated?: boolean }
  ) => Promise<void>;
  compactConversation: (
    manual?: boolean,
    options?: { visibleCommandText?: string }
  ) => Promise<ApiConversationMessage[]>;
  sendCompletionNotification: () => Promise<void>;
  generateStatusSummary: (text: string) => Promise<void>;
  generateConversationTitle: (
    userMessage: Pick<ApiConversationMessage, 'content'>
  ) => Promise<void>;
}

// ─── Hook implementation ─────────────────────────────────────────────────────

export function useAgentLoop({
  apiMessages,
  setApiMessages,
  setMessages,
  setMessageHistory,
  setIsAgentRunning,
  setHasInteractiveTools,
  setCurrentStatus,
  setAttachmentCount,
  setPendingAttachments,
  setPreviewAttachmentImage,
  setRuntimeError,
  setMessageLimit,
  setMessageLimitDismissed,
  setLastStopReason,
  setShowNotificationBanner,
  setIsCompacting,
  setTokensSaved,
  selectedModel,
  notificationsEnabled,
  toolSchemas,
  systemPrompt,
  isCompacting,
  abortControllerRef,
  generationStartedAtRef,
  completionNotificationSentRef,
  iterationCountRef,
  lastSentPayloadRef,
  serverContextLengthRef,
  notificationBannerTimerRef,
  notificationsEnabledRef,
  selectedModelRef,
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
        setMessageHistory(messagesToCompact);
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

  const sendCompletionNotification = useCallback(async () => {
    if (notificationsEnabled !== 'enabled') return;
    const startedAt = generationStartedAtRef.current;
    if (!startedAt || Date.now() - startedAt <= 60000 || completionNotificationSentRef.current)
      return;
    completionNotificationSentRef.current = true;
    try {
      await chrome.notifications.create(`notification_${Date.now()}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icon-128.png'),
        title: 'Task Completed',
        message: 'Your Claude task has finished running.'
      });
    } catch (error) {
      console.warn('Failed to show notification:', error);
    }
  }, [notificationsEnabled]);

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
          system: `Generate ultra-concise status updates describing the current high-level task or goal.\nYour status should describe WHAT SuperDuck is trying to accomplish, not the specific action.\n\nREQUIREMENTS:\n- Maximum 7 words\n- Describe the goal/task, not the action\n- Be high-level and task-oriented\n- No punctuation at the end\n- ${localeInstruction}\n\nExamples of GOOD statuses (goal-oriented):\n- Researching company information\n- Looking up flight options\n- Completing checkout process\n- Finding product details\n- Setting up account\n- Analyzing search results\n- Gathering page content\n\nExamples of BAD statuses (too action-specific):\n- Clicking submit button\n- Reading page content\n- Taking screenshot\n- Typing into form field`,
          model: 'claude-haiku-4-5-20251001'
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
    async (userMessage: Pick<ApiConversationMessage, 'content'>) => {
      if (typeof queryTabId !== 'number') return;
      try {
        const title = await generateConversationTitleFunction(
          userMessage,
          invokeSessionModel,
          intl.locale as SupportedLocale
        );

        if (title) {
          await tabGroupManager.initialize();
          await tabGroupManager.updateGroupTitle(queryTabId, title, true);
        }
      } catch {
        // silently fail title generation
      }
    },
    [invokeSessionModel, queryTabId, intl.locale]
  );

  // ─── Send prompt (main agent loop) ────────────────────────────────────────

  const sendPrompt = useCallback(
    async (
      text: string,
      options?: { attachments?: PromptAttachmentPayload[]; isAnnotated?: boolean }
    ) => {
      const trimmed = text.trim();
      const attachments = options?.attachments ?? [];
      if (!trimmed && attachments.length === 0) return;
      if (!effectiveMessagesClient) {
        setRuntimeError('API not configured. Please set up your provider in Settings.');
        return;
      }

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
        let baseMessages = apiMessages;
        if (
          calculateMessageLimitFromUsage(
            baseMessages[baseMessages.length - 1]?.usage,
            serverContextLengthRef.current
          ).type === 'exceeded_limit'
        ) {
          baseMessages = await compactConversation(false);
        }

        const userContent: ApiInputContentBlock[] = [];
        if (trimmed) {
          userContent.push({ type: 'text', text: trimmed });
        }
        for (const attachment of attachments) {
          userContent.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: normalizeImageMediaType(attachment.mediaType),
              data: attachment.base64
            }
          });
        }
        if (attachments.length > 0 && options?.isAnnotated) {
          userContent.push({
            type: 'text',
            text: "<system-reminder>\nCONTEXT ABOUT ANNOTATIONS IN USER SCREENSHOTS:\n\nThe GLOWING BLUE OUTLINES you see are USER-SELECTED REGIONS on the user's screenshot. These markings:\n- Are regions selected by the user to point out specific areas\n- Are NOT part of the website/interface/UI\n- Will NOT appear in screenshots you take yourself\n- Have white outlines for visibility on all backgrounds\n\nUser screenshots may show a different viewport/responsive layout than what you see. Page elements may be in different positions due to:\n- Different screen sizes or browser window dimensions\n- Responsive design breakpoints\n- Mobile vs desktop views\n- Zoom levels or scaling\n\nINSTRUCTIONS FOR HANDLING ANNOTATED USER SCREENSHOTS:\n1. FIRST, take your own screenshot to see the current page state and layout\n2. Compare the user's annotated screenshot with your view to identify layout differences\n3. The blue outlines indicate regions the user selected - focus on what's inside or near these areas\n4. Look for what UI element the annotation is highlighting based on visual context\n5. Account for responsive changes - an element marked on the right might be below on your screen\n6. Use the user's description combined with the annotation to determine intent\n7. Find and interact with the actual UI element being indicated\n\nFor example: If a blue outline highlights a menu item that appears horizontally in the user's screenshot but is in a hamburger menu on your view, open the hamburger menu first to find the item.\n</system-reminder>"
          });
        }

        // Inject system-reminder tab context on the user's message
        if (typeof queryTabId === 'number') {
          try {
            const availableTabs = await tabGroupManager.getValidTabsWithMetadata(queryTabId);
            if (availableTabs && availableTabs.length > 0) {
              const tabInfo = {
                availableTabs: availableTabs.map((t) => ({
                  id: t.id,
                  title: t.title,
                  url: t.url
                })),
                ...(baseMessages.length === 0 ? { initialTabId: queryTabId } : {})
              };
              userContent.push({
                type: 'text',
                text: `<system-reminder>${JSON.stringify(tabInfo)}</system-reminder>`
              });
            }
          } catch {
            // silently fail tab context injection
          }
        }

        // Inject plan mode system reminder if in follow_a_plan mode and no plan approved yet
        if (shouldShowPlanMode(permissionModeRef.current, hasApprovedPlanRef.current)) {
          userContent.push({
            type: 'text',
            text: getPlanModeSystemReminder()
          });
        }

        const nextUserMessage: ApiConversationMessage = { role: 'user', content: userContent };
        let workingMessages: ApiConversationMessage[] = [...baseMessages, nextUserMessage];
        setApiMessages(workingMessages);

        const MAX_STREAM_RETRIES = 10;
        let continueLoop = true;
        iterationCountRef.current = 0;

        // Add loading prefix to tab group
        if (typeof queryTabId === 'number') {
          tabGroupManager.addLoadingPrefix(queryTabId).catch(() => {});
        }

        // Generate title from first user message
        if (baseMessages.length === 0) {
          const lastMsg = workingMessages[workingMessages.length - 1];
          generateConversationTitle(lastMsg).catch(() => {});
        }

        setCurrentStatus('');

        while (continueLoop) {
          continueLoop = false;
          iterationCountRef.current++;
          const controller = new AbortController();
          abortControllerRef.current = controller;

          // Re-check tab URL after first iteration
          if (iterationCountRef.current > 1 && typeof queryTabId === 'number') {
            try {
              await chrome.tabs.get(queryTabId);
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

          let retryCount = 0;
          let shouldRetry = false;

          do {
            shouldRetry = false;
            try {
              let accumulatedText = '';

              // Prepare messages with cache_control on last assistant msg
              const preparedMessagesRaw = prepareMessagesForApi(workingMessages);
              // Strip old screenshots — keep only the 2 most recent to prevent 413 payload bloat
              const preparedMessagesPruned = manageScreenshotHistory(preparedMessagesRaw, 2);
              // Resolve [[shortcut:id:name]] markers to actual prompt content before sending
              const preparedMessages =
                await resolveShortcutMarkersInMessages(preparedMessagesPruned);

              // Add cache_control to the last tool schema
              let preparedTools = toolSchemas.length ? [...toolSchemas] : undefined;
              if (preparedTools && preparedTools.length > 0) {
                const lastToolIndex = preparedTools.length - 1;
                preparedTools = preparedTools.map((t, idx) =>
                  idx === lastToolIndex ? { ...t, cache_control: { type: 'ephemeral' } } : t
                );
              }

              // Dispatch to per-tier provider (falls back to effectiveMessagesClient).
              const dispatched = await dispatchMessagesClient(
                selectedModel || DEFAULT_MODEL,
                effectiveMessagesClient
              );

              const stream = dispatched.runtime.stream(
                {
                  model: dispatched.modelId,
                  max_tokens: MAX_TOKENS,
                  system: systemPrompt,
                  messages: preparedMessages,
                  tools: preparedTools
                },
                { signal: controller.signal }
              );

              // Parse rate limit headers from connect event
              stream.on('connect', () => {
                const headersFromStream = getStreamHeaders(stream);
                if (headersFromStream) {
                  const headers: Record<string, string> = {};
                  headersFromStream.forEach((value, name) => {
                    if (name.startsWith('anthropic-ratelimit-')) {
                      headers[name] = value;
                    }
                  });
                  if (Object.keys(headers).length > 0) {
                    const parsed = parseRateLimitHeaders(headers);
                    if (parsed) {
                      setMessageLimit((prev) => {
                        if (shouldUpdateMessageLimit(prev, parsed)) return parsed;
                        return prev;
                      });
                    }
                  }
                }
              });

              // Stream text to UI in real-time (throttled to rAF to avoid re-render storms)
              let streamingRafId: number | null = null;
              let streamingRafPending = false;
              stream.on('text', (delta: string) => {
                accumulatedText += delta;
                if (!streamingRafPending) {
                  streamingRafPending = true;
                  streamingRafId = requestAnimationFrame(() => {
                    streamingRafPending = false;
                    streamingRafId = null;
                    updateLastAssistantMessage(accumulatedText);
                  });
                }
              });

              const response: ResponseWithMessageLimit = await stream.finalMessage();

              // Cancel any pending RAF and flush final accumulated text
              if (streamingRafId !== null) {
                cancelAnimationFrame(streamingRafId);
                streamingRafId = null;
                streamingRafPending = false;
              }
              // Ensure the last accumulated text is applied before final update
              if (accumulatedText) {
                updateLastAssistantMessage(accumulatedText);
              }

              // Update with final extracted text (handles turn_answer_start filtering)
              const assistantContent = Array.isArray(response.content) ? response.content : [];
              const finalText = extractTextFromContent(assistantContent);
              if (finalText) {
                updateLastAssistantMessage(finalText);
              }
              // Flush streaming text store → messages state (single React state update)
              flushStreamingText();
              if (!finalText) {
                // Remove empty assistant message placeholder
                setMessages((prev) => {
                  const lastIndex = prev.length - 1;
                  if (
                    lastIndex >= 0 &&
                    prev[lastIndex].role === 'assistant' &&
                    !prev[lastIndex].text.trim()
                  ) {
                    return prev.slice(0, lastIndex);
                  }
                  return prev;
                });
              }

              const assistantMessage: ApiConversationMessage = {
                role: 'assistant',
                content: assistantContent,
                usage: response.usage,
                id: response.id,
                stop_reason: response.stop_reason
              };
              workingMessages = [...workingMessages, assistantMessage];

              // 实时更新状态，让 UI 能看到 tool_use
              setApiMessages(workingMessages);

              setLastStopReason({
                reason: response.stop_reason || 'end_turn',
                messageId: response.id
              });
              const parsedMessageLimit = parseMessageLimit(response.message_limit);
              setMessageLimit(
                parsedMessageLimit ??
                  calculateMessageLimitFromUsage(
                    response.usage || {},
                    serverContextLengthRef.current
                  )
              );
              setMessageLimitDismissed(false);

              if (response.stop_reason !== 'tool_use') {
                await sendCompletionNotification();
                break;
              }

              const toolUses = assistantContent.filter(isToolUseContentBlock);
              if (toolUses.length === 0) {
                break;
              }

              // Separate turn_answer_start from real tool calls
              const realToolUses = toolUses.filter((t) => t.name !== 'turn_answer_start');
              const answerStartTools = toolUses.filter((t) => t.name === 'turn_answer_start');

              const toolResults: ApiToolResultBlock[] = [];

              // Return empty results for turn_answer_start
              for (const toolUse of answerStartTools) {
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: toolUse.id,
                  content: ''
                });
              }

              if (realToolUses.length > 0) {
                // Set hasInteractiveTools for non-readonly tools
                const readonlyTools = ['read_page', 'get_page_text', 'find', 'turn_answer_start'];
                if (realToolUses.some((t) => !readonlyTools.includes(t.name))) {
                  setHasInteractiveTools(true);
                }

                const toolNames = realToolUses.map((t) => t.name).join(', ');
                pushMessage('system', `🔧 ${toolNames}`);

                // Generate status summary from accumulated text
                if (accumulatedText && !accumulatedText.toLowerCase().includes('<answer>')) {
                  generateStatusSummary(accumulatedText).catch(() => {});
                } else if (accumulatedText && accumulatedText.toLowerCase().includes('<answer>')) {
                  setCurrentStatus('');
                }

                // Check if user cancelled before executing tools
                if (controller.signal.aborted) {
                  for (const toolUse of realToolUses) {
                    toolResults.push({
                      type: 'tool_result',
                      tool_use_id: toolUse.id,
                      content: 'Tool execution cancelled by user',
                      is_error: true
                    });
                  }
                } else {
                  // Determine page type for checkToolAllowed
                  let currentPageType = 'regular';
                  if (typeof queryTabId === 'number') {
                    try {
                      const tab = await chrome.tabs.get(queryTabId);
                      currentPageType = getPageType(tab.url);
                    } catch {
                      // tab may have been closed
                    }
                  }

                  for (const toolUse of realToolUses) {
                    // Check cancellation between individual tool executions
                    if (controller.signal.aborted) {
                      toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: 'Tool execution cancelled by user',
                        is_error: true
                      });
                      continue;
                    }

                    // checkToolAllowed
                    const toolCheck = checkToolAllowed(
                      toolUse.name,
                      currentPageType,
                      permissionModeRef.current,
                      hasApprovedPlanRef.current
                    );
                    if (!toolCheck.allowed) {
                      toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: `${toolCheck.errorMessage}\n\n${toolCheck.suggestedGuidance}`,
                        is_error: true
                      });
                      continue;
                    }

                    // Special handling for update_plan
                    if (toolUse.name === 'update_plan') {
                      const { approach, domains } = toolUse.input as {
                        approach?: string[];
                        domains?: string[];
                      };

                      if (permissionModeRef.current !== 'follow_a_plan') {
                        // Auto-approve update_plan when not in follow_a_plan mode
                        let approvalMessage =
                          'User has approved your plan. You can now start executing the plan.';
                        if (approach && approach.length > 0) {
                          approvalMessage +=
                            '\n\nPlan steps:\n' +
                            approach.map((step, i) => `${i + 1}. ${step}`).join('\n') +
                            '\n\nStart by using the TodoWrite tool to track your progress through these steps.';
                        } else {
                          approvalMessage += ' Start with updating your todo list if applicable.';
                        }
                        hasApprovedPlanRef.current = true;
                        if (domains) {
                          const pm = getPermissionManager();
                          await filterAndApproveDomains(domains, pm);
                        }
                        toolResults.push({
                          type: 'tool_result',
                          tool_use_id: toolUse.id,
                          content: approvalMessage
                        });
                      } else {
                        // In follow_a_plan mode, go through normal permission flow
                        const result = await executeToolUse(toolUse);
                        if (!result.is_error) {
                          hasApprovedPlanRef.current = true;
                          if (domains) {
                            const pm = getPermissionManager();
                            await filterAndApproveDomains(domains, pm);
                          }
                          let approvalMessage =
                            'User has approved your plan. You can now start executing the plan.';
                          if (approach && approach.length > 0) {
                            approvalMessage +=
                              '\n\nPlan steps:\n' +
                              approach.map((step, i) => `${i + 1}. ${step}`).join('\n') +
                              '\n\nStart by using the TodoWrite tool to track your progress through these steps.';
                          } else {
                            approvalMessage += ' Start with updating your todo list if applicable.';
                          }
                          toolResults.push({
                            type: 'tool_result',
                            tool_use_id: toolUse.id,
                            content: approvalMessage
                          });
                        } else {
                          toolResults.push(result);
                        }
                      }
                      continue;
                    }

                    toolResults.push(await executeToolUse(toolUse));
                  }
                }
              }

              const toolResultMessage: ApiConversationMessage = {
                role: 'user',
                content: toolResults
              };
              workingMessages = [...workingMessages, toolResultMessage];

              // 实时更新状态，让 UI 能看到 tool_result
              setApiMessages(workingMessages);

              // In-loop auto compaction: prevent token overflow during long agentic runs
              const lastAssistantMsg = [...workingMessages]
                .reverse()
                .find((m): m is ApiConversationMessage => m.role === 'assistant' && !!m.usage);
              if (lastAssistantMsg?.usage) {
                const limitState = calculateMessageLimitFromUsage(
                  lastAssistantMsg.usage,
                  serverContextLengthRef.current
                );
                if (
                  limitState.type === 'exceeded_limit' ||
                  limitState.type === 'approaching_limit'
                ) {
                  try {
                    const compactor = new ConversationCompactor(
                      async (params: CreateApiMessageParams) => createApiMessage(params),
                      intl.locale,
                      serverContextLengthRef.current
                    );
                    const compactResult = await compactor.compactConversation(
                      workingMessages,
                      MAX_TOKENS,
                      true
                    );
                    workingMessages = compactResult.messagesAfterCompacting;
                    setApiMessages(workingMessages);
                    pushMessage('system', 'Conversation compacted to save context.');
                  } catch (compactError) {
                    console.warn('[Agentic Loop] In-loop compaction failed:', compactError);
                  }
                }
              }

              continueLoop = true;
            } catch (error) {
              const message = getErrorMessage(error);
              const lowerMessage = message.toLowerCase();

              // Retry on transient errors with exponential backoff
              if (
                retryCount < MAX_STREAM_RETRIES &&
                (lowerMessage.startsWith('overloaded') ||
                  lowerMessage.startsWith('internal server error') ||
                  lowerMessage.includes('network error') ||
                  lowerMessage.includes('connection error') ||
                  lowerMessage.includes('failed to fetch') ||
                  lowerMessage.startsWith('499') ||
                  lowerMessage.includes('this request would exceed the rate limit'))
              ) {
                retryCount++;
                let delay = Math.pow(2, retryCount);
                delay += Math.random() * delay;
                void trackEvent('superduck.sidebar.api_retried', {
                  attempt: retryCount,
                  error_type: lowerMessage.startsWith('overloaded')
                    ? 'overloaded'
                    : lowerMessage.includes('rate limit')
                      ? 'rate_limit'
                      : 'network',
                  delay_ms: Math.round(delay * 1000)
                });
                await new Promise((resolve) => setTimeout(resolve, delay * 1000));
                shouldRetry = true;
                // Clear streaming store and remove the empty streaming placeholder before retry
                streamingTextStoreRef.current.set('');
                setMessages((prev) => {
                  const lastIndex = prev.length - 1;
                  if (lastIndex >= 0 && prev[lastIndex].role === 'assistant') {
                    return prev.slice(0, lastIndex);
                  }
                  return prev;
                });
                continue;
              }

              throw error;
            }
          } while (shouldRetry);
        }

        setApiMessages(workingMessages);
      } catch (error) {
        const message = getErrorMessage(error);
        const lowerMessage = message.toLowerCase();
        const rateLimitState = parseRateLimitFromError(error);
        if (rateLimitState) {
          setMessageLimit(rateLimitState);
        }
        const errorType = lowerMessage.includes('abort')
          ? 'abort'
          : rateLimitState
            ? 'rate_limit'
            : lowerMessage.includes('connection error') ||
                lowerMessage.includes('failed to fetch') ||
                lowerMessage.includes('network error')
              ? 'network'
              : lowerMessage.startsWith('overloaded')
                ? 'overloaded'
                : 'other';
        if (errorType !== 'abort') {
          void trackEvent('superduck.sidebar.api_error', {
            error_type: errorType,
            model: selectedModelRef.current || ''
          });
        }
        if (lowerMessage.includes('abort') || lowerMessage === 'request was aborted.') {
          pushMessage('system', 'Generation stopped.');
        } else {
          let runtimeMessage = message;
          const isNetworkLikeError =
            lowerMessage.includes('connection error') ||
            lowerMessage.includes('failed to fetch') ||
            lowerMessage.includes('network error');
          if (isNetworkLikeError) {
            runtimeMessage = 'Network error — please check your internet connection and try again.';
          } else if (lowerMessage.startsWith('overloaded')) {
            runtimeMessage = 'Claude is currently overloaded. Please try again in a moment.';
          } else if (rateLimitState) {
            const retryText = rateLimitState.resetsAt
              ? ` Please wait ~${Math.ceil((rateLimitState.resetsAt - Date.now()) / 1000)}s.`
              : '';
            runtimeMessage = `Rate limit reached.${retryText}`;
          }
          setRuntimeError(runtimeMessage);
          pushMessage('system', `Error: ${runtimeMessage}`);
        }
      } finally {
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
        if (typeof queryTabId === 'number') {
          chrome.tabs.sendMessage(queryTabId, { type: 'HIDE_AGENT_INDICATORS' }).catch(() => {});
          tabGroupManager.setTabIndicatorState(queryTabId, 'none').catch(() => {});
          tabGroupManager.addCompletionPrefix(queryTabId).catch(() => {});
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
