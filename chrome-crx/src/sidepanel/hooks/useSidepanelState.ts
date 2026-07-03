import React, { useEffect, useRef, useState } from 'react';
import {
  StorageKeys,
  type ModelFallbackConfig,
  type VersionInfoFeatureValue
} from '../../extensionServices';
import { useStorageState } from '@/hooks/useStorageState';
import { useIntlSafe, usePreferredLocale } from '../../index-react-dom-intl';
import { getFirstUsableProvider } from '../../utils/providerConfigStatus';
import { findProvider } from '../../utils/providerStore';
import { useProviderClient } from '../provider';
import { useTabEvent } from './useTabState';
import { isPermissionPromptData } from '@/sidepanel/components/PermissionPrompt';
import { type ScrollContainerHandle } from '@/sidepanel/components/ScrollContainer';
import { useWorkflowRecording } from '../workflowRecording/useWorkflowRecording';
import { useLightningMode } from '../lightningMode/useLightningMode';
import { useAuth } from './useAuth';
import { useModelConfig } from './useModelConfig';
import { useChatActions } from './useChatActions';
import { useAttachmentActions } from './useAttachmentActions';
import { usePermissionActions } from './usePermissionActions';
import { useSessionPersistence } from './useSessionPersistence';
import { useSessionActions } from './useSessionActions';
import { useModelActions } from './useModelActions';
import { useSubmitActions } from './useSubmitActions';
import { useCommandMenu } from './useCommandMenu';
import { useActionCallbacks } from './useActionCallbacks';
import { useUIActions } from './useUIActions';
import { useAgentLoop } from './useAgentLoop';
import { useRuntimeMessages } from './useRuntimeMessages';
import { useInitialization } from './useInitialization';
import { usePermissionEffects } from './usePermissionEffects';
import { useNotificationUIEffects } from './useNotificationUIEffects';
import { useSessionInitialization } from './useSessionInitialization';
import { usePurlModeInitialization } from './usePurlModeInitialization';
import { useVersionCheck } from './useVersionCheck';
import { useProviderConfigLoader } from './useProviderConfigLoader';
import { useInputClear } from './useInputClear';
import { useErrorTracking } from './useErrorTracking';
import { useTabChangeTracking } from './useTabChangeTracking';
import { useTabIdUnlock } from './useTabIdUnlock';
import { useLastActiveSession } from './useLastActiveSession';
import { usePreservedTranscriptCleanup } from './usePreservedTranscriptCleanup';
import { useTabGroupCheck } from './useTabGroupCheck';
import { useModelSync } from './useModelSync';
import { useSidepanelLifecycle } from './useSidepanelLifecycle';
import { useRotatingTips, useNormalizedModelOptions } from './useRotatingTips';
import { usePermissionModeMenuOptions } from './usePermissionModeMenuOptions';
import { useCurrentDomain } from './useCurrentDomain';
import { useSelectedModelLabel } from './useSelectedModelLabel';
import { useRandomStartupKey } from './useRandomStartupKey';
import { useMessageListScrollRefs } from './useMessageListScrollRefs';
import { useMessageLimitBanner } from './useMessageLimitBanner';
import { useActiveBanner } from './useActiveBanner';
import { useContextDebugInfo } from './useContextDebugInfo';
import { useSetupRetry } from './useSetupRetry';
import { useQuery } from './useQuery';
import { useTabGroupActions } from './useTabGroupActions';
import { useEffectiveSendPrompt } from './useEffectiveSendPrompt';
import { useEffectiveCancel } from './useEffectiveCancel';
import { useEffectiveClearError } from './useEffectiveClearError';
import { useClearPreservedTranscript } from './useClearPreservedTranscript';
import { useHandleStartWorkflowRecording } from './useHandleStartWorkflowRecording';
import { useSentinelCallbackRef } from './useSentinelCallbackRef';
import { usePermissionManager } from './usePermissionManager';
import { useStableCreateMessage } from './useStableCreateMessage';
import { useUIStore } from '../stores/uiStore';
import { useAgentStore } from '../stores/agentStore';
import { usePermissionStore } from '../stores/permissionStore';
import { useChatStore } from '../stores/chatStore';
import { useAttachmentStore } from '../stores/attachmentStore';
import { useModelStore } from '../stores/modelStore';
import { useSessionStore } from '../stores/sessionStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useTabStore } from '../stores/tabStore';
import { useChatActionsStore } from '../stores/chatActionsStore';
import { useChatInputStore } from '../stores/chatInputStore';

import { createStreamingTextStore, usePrefersReducedMotion } from '../sidepanelGuards';
import type { ApiResponseMessage, CreateApiMessageParams } from '../../messageTypes';
import type {
  ChatRole,
  NotificationPreference,
  SendPromptOptions,
  AnnouncementConfig
} from '../types';
import { type PermissionMode, type PromptAttachmentPayload } from '../sidepanelUtils';
import type { RichTextInputHandle } from '@/sidepanel/components/RichTextInput';

// Module-level constant for useTabEvent's properties.
const TAB_GROUP_EVENT_PROPERTIES: string[] = ['groupId', 'url', 'status'];
const EMPTY_VERSION_INFO: VersionInfoFeatureValue = {};
const EMPTY_ANNOUNCEMENT_CONFIG: AnnouncementConfig = {};

function parseNotificationPreference(value: unknown): NotificationPreference {
  return value === 'enabled' || value === 'disabled' ? value : undefined;
}

export function useSidepanelState() {
  const intl = useIntlSafe();
  const panelReadyPromiseRef = useRef<Promise<unknown> | null>(null);

  const query = useQuery();
  const dynamicTabId = query.tabId;

  const preservedTranscriptTabId = useTabStore((s) => s.preservedTranscriptTabId);
  const setPreservedTranscriptTabId = useTabStore((s) => s.setPreservedTranscriptTabId);
  const preservedTranscriptActiveTabId = useTabStore((s) => s.preservedTranscriptActiveTabId);
  const setPreservedTranscriptActiveTabId = useTabStore((s) => s.setPreservedTranscriptActiveTabId);
  const sessionTabId = preservedTranscriptTabId ?? dynamicTabId;

  useSidepanelLifecycle({
    panelReadyPromiseRef
  });

  const purlModeFeatureEnabled = false;

  const versionInfo = EMPTY_VERSION_INFO;
  const announcementConfig = EMPTY_ANNOUNCEMENT_CONFIG;

  // Session state
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId);
  const activeConversationUuid = useSessionStore((s) => s.activeConversationUuid);
  const setActiveConversationUuid = useSessionStore((s) => s.setActiveConversationUuid);
  const activeRemoteSessionId = useSessionStore((s) => s.activeRemoteSessionId);
  const setActiveRemoteSessionId = useSessionStore((s) => s.setActiveRemoteSessionId);
  const showHistoryPanel = useSessionStore((s) => s.showHistoryPanel);
  const setShowHistoryPanel = useSessionStore((s) => s.setShowHistoryPanel);

  // Chat state
  const input = useChatStore((s) => s.input);
  const setInput = useChatStore((s) => s.setInput);
  const messages = useChatStore((s) => s.messages);
  const apiMessages = useChatStore((s) => s.apiMessages);

  // Permission state
  const permissionMode = usePermissionStore((s) => s.permissionMode);
  const setPermissionMode = usePermissionStore((s) => s.setPermissionMode);
  const permissionPrompt = usePermissionStore((s) => s.permissionPrompt);
  const setPermissionPrompt = usePermissionStore((s) => s.setPermissionPrompt);
  const hasBrowserControlPermissionAccepted = usePermissionStore(
    (s) => s.hasBrowserControlPermissionAccepted
  );
  const setHasBrowserControlPermissionAccepted = usePermissionStore(
    (s) => s.setHasBrowserControlPermissionAccepted
  );
  const hasApprovedPlan = usePermissionStore((s) => s.hasApprovedPlan);
  const {
    selectedModel,
    selectedModelRef,
    setSelectedModel,
    handleModelChange: _rawHandleModelChange
  } = useModelConfig();

  useSessionInitialization({
    querySessionId: query.sessionId,
    queryModel: query.model,
    activeSessionId,
    setActiveSessionId,
    setSelectedModel
  });

  // Lightning mode toggle
  const purlModeToggle = useUIStore((s) => s.purlModeToggle);
  const setPurlModeToggle = useUIStore((s) => s.setPurlModeToggle);
  const isPurlMode = !!purlModeFeatureEnabled && purlModeToggle;

  // Model state
  const providerConfig = useModelStore((s) => s.providerConfig);
  const setProviderConfig = useModelStore((s) => s.setProviderConfig);
  const setToolSchemas = useModelStore((s) => s.setToolSchemas);

  usePurlModeInitialization({
    purlModeFeatureEnabled,
    setPurlModeToggle
  });

  // Agent state
  const isAgentRunning = useAgentStore((s) => s.isAgentRunning);
  const currentStatus = useAgentStore((s) => s.currentStatus);
  const isCompacting = useAgentStore((s) => s.isCompacting);
  const isConvertingToTask = useAgentStore((s) => s.isConvertingToTask);
  const setIsAgentRunning = useAgentStore((s) => s.setIsAgentRunning);
  const setIsConvertingToTask = useAgentStore((s) => s.setIsConvertingToTask);

  // Attachment state
  const setAttachmentCount = useAttachmentStore((s) => s.setAttachmentCount);
  const pendingAttachments = useAttachmentStore((s) => s.pendingAttachments);
  const setPendingAttachments = useAttachmentStore((s) => s.setPendingAttachments);
  const setPreviewAttachmentImage = useAttachmentStore((s) => s.setPreviewAttachmentImage);
  const prefersReducedMotion = usePrefersReducedMotion();
  const pendingPrompt = useAgentStore((s) => s.pendingPrompt);
  const setPendingPrompt = useAgentStore((s) => s.setPendingPrompt);
  const populatedInputTargetTabId = useTabStore((s) => s.populatedInputTargetTabId);
  const setPopulatedInputTargetTabId = useTabStore((s) => s.setPopulatedInputTargetTabId);
  const runtimeError = useAgentStore((s) => s.runtimeError);
  const setRuntimeError = useAgentStore((s) => s.setRuntimeError);

  const { apiKey, apiBaseUrl, authLoading, authError, refreshAuth } = useAuth({
    queryApiKey: query.apiKey,
    queryApiUrl: query.apiUrl
  });

  const notificationsEnabled = useNotificationStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useNotificationStore((s) => s.setNotificationsEnabled);
  const showNotificationBanner = useUIStore((s) => s.showNotificationBanner);
  const setShowNotificationBanner = useUIStore((s) => s.setShowNotificationBanner);
  const messageLimit = useNotificationStore((s) => s.messageLimit);
  const [debugMode] = useStorageState<boolean>(StorageKeys.DEBUG_MODE, false);

  const randomStartupKey = useRandomStartupKey();

  const messageLimitDismissed = useUIStore((s) => s.isMessageLimitDismissed);
  const setMessageLimitDismissed = useUIStore((s) => s.setIsMessageLimitDismissed);
  const skipWarningDismissed = useUIStore((s) => s.skipPermissionsWarningDismissed);
  const setSkipWarningDismissed = useUIStore((s) => s.setSkipPermissionsWarningDismissed);
  const announcementDismissed = useUIStore((s) => s.announcementDismissed);
  const setAnnouncementDismissed = useUIStore((s) => s.setAnnouncementDismissed);
  const [_refusalFeedbackSent, setRefusalFeedbackSent] = useState(false);
  const lastStopReason = useAgentStore((s) => s.lastStopReason);
  const [versionState, setVersionState] = useState({
    isBlocked: false,
    hasUpdate: false,
    currentVersion: '',
    minSupportedVersion: ''
  });
  const blockedCategory = useAgentStore((s) => s.blockedCategory);
  const setBlockedCategory = useAgentStore((s) => s.setBlockedCategory);
  const blockedTabInfo = useAgentStore((s) => s.blockedTabInfo);
  const setBlockedTabInfo = useAgentStore((s) => s.setBlockedTabInfo);

  const setShowWorkflowModeSelectionModal = useUIStore((s) => s.setShowWorkflowModeSelectionModal);
  const currentPageUrl = useTabStore((s) => s.currentPageUrl);
  const setCurrentPageUrl = useTabStore((s) => s.setCurrentPageUrl);
  const currentPageTitle = useTabStore((s) => s.currentPageTitle);
  const setCurrentPageTitle = useTabStore((s) => s.setCurrentPageTitle);

  const currentDomain = useCurrentDomain({ currentPageUrl });

  const [hasMicrophonePermission, setHasMicrophonePermission] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<RichTextInputHandle | null>(null);

  const hasLoadedSessionRef = useRef(false);
  const activeConversationUuidRef = useRef<string | null>(null);
  activeConversationUuidRef.current = activeConversationUuid;
  const activeRemoteSessionIdRef = useRef<string | null>(null);
  activeRemoteSessionIdRef.current = activeRemoteSessionId;
  const sessionCreatedAtRef = useRef<number>(Date.now());
  const hasLoadedPermissionPreferenceRef = useRef(false);
  const notificationBannerTimerRef = useRef<number | null>(null);
  const notificationsEnabledRef = useRef<NotificationPreference>(undefined);
  const generationStartedAtRef = useRef<number | null>(null);
  const completionNotificationSentRef = useRef(false);
  const lastSentPayloadRef = useRef<{
    text: string;
    attachments: PromptAttachmentPayload[];
    isAnnotated: boolean;
  } | null>(null);
  const iterationCountRef = useRef(0);
  const _lastTabContextJsonRef = useRef<string | null>(null);
  const sendPromptRef = useRef<
    ((text: string, options?: SendPromptOptions) => Promise<void>) | null
  >(null);
  const isAgentRunningRef = useRef(isAgentRunning);
  const lockedTabIdRef = useRef<number | undefined>(undefined);
  const agentStartedTabIdRef = useRef<number | undefined>(undefined);
  const tabChangedDuringAgentRef = useRef(false);
  const wasAgentRunningRef = useRef(false);
  const screenshotActivationTabIdsRef = useRef<Set<number>>(new Set());
  const screenshotActivationSuppressionTokenRef = useRef(0);
  const sessionResolvedForTabRef = useRef<number | undefined>(undefined);
  const hasBrowserControlPermissionAcceptedRef = useRef(hasBrowserControlPermissionAccepted);
  const pushMessageRef = useRef<((role: ChatRole, text: string) => void) | null>(null);
  const _injectedDomainSkillsRef = useRef<Set<string>>(new Set());
  const autoScrollRef = useRef<ScrollContainerHandle | null>(null);
  const streamingTextStoreRef = useRef(createStreamingTextStore());
  const { sentinelElement, sentinelCallbackRef } = useSentinelCallbackRef();

  const permissionResolveRef = useRef<((allowed: boolean) => void) | null>(null);
  const hasApprovedPlanRef = useRef(hasApprovedPlan);

  const { getPermissionManager, permissionManagerRef, permissionModeRef } = usePermissionManager({
    permissionMode
  });
  const scrollRefs = useRef({
    lastAssistantMessage: React.createRef<HTMLDivElement>(),
    lastHumanMessage: React.createRef<HTMLDivElement>(),
    extras: React.createRef<HTMLDivElement>(),
    extraSpace: React.createRef<HTMLDivElement>(),
    chatInput: React.createRef<HTMLDivElement>()
  }).current;

  const messageListScrollRefs = useMessageListScrollRefs({ scrollRefs });

  const _showTopGradient = useUIStore((s) => s.showTopGradient);
  const setShowTopGradient = useUIStore((s) => s.setShowTopGradient);

  const setIsModelMenuOpen = useUIStore((s) => s.setIsModelMenuOpen);
  const setIsHeaderMenuOpen = useUIStore((s) => s.setIsHeaderMenuOpen);
  const setIsLanguageSubmenuOpen = useUIStore((s) => s.setIsLanguageSubmenuOpen);
  const setIsPermissionMenuOpen = useUIStore((s) => s.setIsPermissionMenuOpen);
  const setIsActionsMenuOpen = useUIStore((s) => s.setIsActionsMenuOpen);
  const pendingLocale = useUIStore((s) => s.pendingLocale);
  const setPendingLocale = useUIStore((s) => s.setPendingLocale);
  const { locale, setLocale } = usePreferredLocale();

  const setPromptToSave = useUIStore((state) => state.setPromptToSave);
  const showCommandMenu = useUIStore((state) => state.showCommandMenu);
  const setShowCommandMenu = useUIStore((state) => state.setShowCommandMenu);
  const setCommandSearchTerm = useUIStore((state) => state.setCommandSearchTerm);

  const commandMenuDismissedRef = useRef(false);
  const commandMenuDismissedInputRef = useRef('');
  const commandMenuRef = useRef<HTMLDivElement>(null);
  const inputValueRef = useRef(input);
  inputValueRef.current = input;

  const createApiMessageRef = useRef<
    ((params: CreateApiMessageParams) => Promise<ApiResponseMessage>) | null
  >(null);
  const stableCreateMessage = useStableCreateMessage({ createApiMessageRef });

  const {
    recordingState,
    error: _recordingError,
    isSpeechRecording,
    currentInterimTranscript,
    isSpeechSupported,
    hasSpeechPermission: hasSpeechPermissionFromHook,
    startRecording,
    stopRecording,
    togglePause,
    toggleSpeechRecording,
    removeStep,
    updateStep
  } = useWorkflowRecording({
    tabId: query.tabId || 0,
    onComplete: (_steps) => {
      // TODO: Implement workflow save logic
    },
    createMessage: stableCreateMessage
  });

  useInitialization({
    setToolSchemas,
    notificationsEnabledRef,
    setNotificationsEnabled,
    queryTabId: query.tabId,
    setCurrentPageUrl,
    setCurrentPageTitle,
    setHasMicrophonePermission,
    setVersionState,
    notificationsEnabled,
    setAttachmentCount,
    pendingAttachments,
    setShowNotificationBanner,
    notificationBannerTimerRef,
    parseNotificationPreference,
    announcementConfig,
    setAnnouncementDismissed
  });

  useVersionCheck({
    versionInfo,
    setVersionState
  });

  const {
    effectiveMessagesClient,
    hasProviderConfig,
    serverModelInfo,
    serverContextLengthRef,
    refreshProviderConfig
  } = useProviderClient({ apiKey, apiBaseUrl, selectedModel });

  const { handlePermissionAllow, handlePermissionDeny, onPermissionRequired, executeToolUse } =
    usePermissionActions({
      permissionResolveRef,
      lockedTabIdRef,
      permissionManagerRef,
      permissionModeRef,
      getPermissionManager,
      queryTabId: query.tabId,
      effectiveMessagesClient,
      permissionMode,
      activeSessionId
    });

  const { systemPrompt, createApiMessage, invokeSessionModel } = useModelActions({
    selectedModel,
    permissionMode,
    effectiveMessagesClient
  });

  useProviderConfigLoader({
    setProviderConfig
  });

  const handleSetupRetry = useSetupRetry({ refreshAuth, refreshProviderConfig });

  const lightningResult = useLightningMode({
    apiKey,
    modelRef: selectedModelRef,
    tabId: query.tabId ?? null,
    sessionId: activeSessionId,
    currentDomain,
    currentUrl: currentPageUrl,
    onShareRequested: null,
    permissionMode,
    onPermissionRequired: onPermissionRequired
      ? async (result) => {
          if (!isPermissionPromptData(result)) return false;
          return onPermissionRequired(result);
        }
      : undefined,
    permissionManager: getPermissionManager(),
    serverContextLengthRef,
    locale: intl.locale,
    enabled: isPurlMode
  });

  const shouldDisableSkipPermissions = blockedCategory !== null && blockedCategory !== 'category0';

  const { loadSnapshotForSession, flushSession } = useSessionPersistence({
    activeSessionId,
    selectedModelRef,
    permissionModeRef,
    sessionCreatedAtRef,
    hasLoadedSessionRef,
    activeConversationUuidRef,
    activeRemoteSessionIdRef,
    apiKey,
    apiBaseUrl,
    shouldDisableSkipPermissions
  });

  const {
    clearConversation,
    handleLoadHistorySession,
    pushMessage,
    appendVisibleLocalMessages,
    updateLastAssistantMessage,
    flushStreamingText
  } = useChatActions({
    sessionTabId,
    lockedTabIdRef,
    abortControllerRef,
    permissionResolveRef,
    permissionManagerRef,
    hasApprovedPlanRef,
    hasLoadedSessionRef,
    sessionCreatedAtRef,
    querySessionId: query.sessionId,
    flushSession,
    streamingTextStoreRef,
    lastSentPayloadRef,
    notificationBannerTimerRef
  });

  const { sendPrompt } = useAgentLoop({
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
    queryTabId: query.tabId,
    intl
  });

  const effectiveMessages = isPurlMode && lightningResult ? lightningResult.messages : messages;
  const effectiveApiMessages =
    isPurlMode && lightningResult ? lightningResult.messages : apiMessages;
  const effectiveIsAgentRunning =
    isPurlMode && lightningResult ? lightningResult.isLoading : isAgentRunning;

  useSessionActions({
    activeSessionId,
    dynamicTabId,
    effectiveIsAgentRunning,
    querySessionId: query.sessionId,
    sessionTabId,
    wasAgentRunningRef,
    agentStartedTabIdRef,
    tabChangedDuringAgentRef,
    sessionResolvedForTabRef
  });

  const effectiveCurrentStatus =
    isPurlMode && lightningResult ? lightningResult.currentStatus : currentStatus;
  const effectiveRuntimeError =
    isPurlMode && lightningResult ? lightningResult.error : runtimeError;
  const effectiveIsCompacting =
    isPurlMode && lightningResult ? lightningResult.isCompacting : isCompacting;
  const isChatInputRunning = effectiveIsAgentRunning || effectiveIsCompacting;
  const isChatInputBeamActive = !prefersReducedMotion && isChatInputRunning;
  const chatInputSurfaceClass =
    'bg-bg-000 rounded-2xl relative transition-all focus-within:outline-none cursor-text shadow-[0_0.25rem_1.25rem_hsl(var(--always-black)/3.5%),0_0_0_0.5px_hsla(var(--border-300)/0.15)] hover:shadow-[0_0.25rem_1.25rem_hsl(var(--always-black)/3.5%),0_0_0_0.5px_hsla(var(--border-200)/0.3)] focus-within:shadow-[0_0.25rem_1.25rem_hsl(var(--always-black)/7.5%),0_0_0_0.5px_hsla(var(--border-200)/0.3)]';

  useErrorTracking({
    effectiveRuntimeError,
    isPurlMode,
    lightningResultError: lightningResult?.error
  });

  const effectiveSendPrompt = useEffectiveSendPrompt({
    isPurlMode,
    lightningResult,
    preservedTranscriptTabId,
    queryTabId: query.tabId,
    sendPrompt,
    lockedTabIdRef,
    agentStartedTabIdRef,
    tabChangedDuringAgentRef,
    isAgentRunningRef
  });

  useInputClear({
    input,
    setPopulatedInputTargetTabId
  });

  const effectiveCancel = useEffectiveCancel({
    isPurlMode,
    lightningResult,
    queryTabId: query.tabId,
    abortControllerRef,
    setIsAgentRunning,
    lockedTabIdRef,
    iterationCountRef
  });

  const effectiveClearError = useEffectiveClearError({
    isPurlMode,
    lightningResult,
    setRuntimeError
  });

  sendPromptRef.current = effectiveSendPrompt;
  isAgentRunningRef.current = effectiveIsAgentRunning;
  hasBrowserControlPermissionAcceptedRef.current = hasBrowserControlPermissionAccepted;
  pushMessageRef.current = pushMessage;

  useTabChangeTracking({
    effectiveIsAgentRunning,
    agentStartedTabIdRef,
    dynamicTabId,
    tabChangedDuringAgentRef
  });

  const clearPreservedTranscriptForTarget = useClearPreservedTranscript({
    preservedTranscriptTabId,
    dynamicTabId,
    activeSessionId,
    setPreservedTranscriptTabId,
    setPreservedTranscriptActiveTabId,
    setActiveConversationUuid,
    setActiveRemoteSessionId,
    setActiveSessionId,
    sessionResolvedForTabRef,
    hasLoadedSessionRef,
    sessionCreatedAtRef
  });

  usePreservedTranscriptCleanup({
    dynamicTabId,
    screenshotActivationTabIdsRef,
    preservedTranscriptTabId,
    preservedTranscriptActiveTabId,
    setPreservedTranscriptTabId,
    setPreservedTranscriptActiveTabId
  });

  useTabIdUnlock({
    effectiveIsAgentRunning,
    lockedTabIdRef
  });

  const { ensureCurrentTabIsMainInGroup, refreshBlockedState } = useTabGroupActions({
    queryTabId: query.tabId,
    setBlockedCategory,
    setBlockedTabInfo,
    panelReadyPromiseRef
  });

  useTabEvent(
    query.tabId,
    TAB_GROUP_EVENT_PROPERTIES,
    () => {
      void ensureCurrentTabIsMainInGroup();
      void refreshBlockedState();
    },
    [ensureCurrentTabIsMainInGroup, refreshBlockedState]
  );

  useTabGroupCheck({
    ensureCurrentTabIsMainInGroup,
    refreshBlockedState
  });

  usePermissionEffects({
    querySkipPermissions: query.skipPermissions,
    shouldDisableSkipPermissions,
    setPermissionMode,
    permissionMode: permissionMode as PermissionMode,
    permissionResolveRef,
    setPermissionPrompt,
    hasApprovedPlanRef,
    permissionManagerRef,
    hasLoadedPermissionPreferenceRef,
    setHasBrowserControlPermissionAccepted,
    blockedCategory
  });

  const permissionModeMenuOptions = usePermissionModeMenuOptions({
    shouldDisableSkipPermissions
  });

  useLastActiveSession({
    activeSessionId
  });

  const { handleFileSelection, handlePaste, captureCurrentTabScreenshot } = useAttachmentActions({
    inputRef,
    setIsActionsMenuOpen,
    screenshotActivationTabIdsRef,
    screenshotActivationSuppressionTokenRef,
    preservedTranscriptTabId,
    queryTabId: query.tabId
  });

  const { submit, insertShortcutChip, navigateActiveTabToUrl } = useSubmitActions({
    input,
    setInput,
    pendingAttachments,
    setPendingAttachments,
    setPreviewAttachmentImage,
    setAttachmentCount,
    setIsPermissionMenuOpen,
    setIsActionsMenuOpen,
    effectiveSendPrompt,
    effectiveIsAgentRunning,
    apiKey,
    effectiveMessagesClient,
    populatedInputTargetTabId,
    setPopulatedInputTargetTabId,
    inputRef,
    selectedModelRef,
    permissionModeRef
  });

  useCommandMenu({
    input,
    inputRef,
    inputValueRef,
    commandMenuDismissedRef,
    commandMenuDismissedInputRef,
    showCommandMenu,
    setShowCommandMenu,
    setCommandSearchTerm,
    commandMenuRef,
    effectiveIsAgentRunning,
    effectiveCancel,
    permissionModeMenuOptions,
    permissionMode,
    setPermissionMode
  });

  useRuntimeMessages({
    queryTabId: query.tabId,
    runtimeTabId: lockedTabIdRef.current ?? sessionTabId ?? query.tabId,
    queryMode: query.mode,
    querySessionId: query.sessionId,
    querySkipPermissions: query.skipPermissions,
    activeSessionId,
    loadSnapshotForSession,
    sessionCreatedAtRef,
    hasLoadedSessionRef,
    sendPromptRef,
    isAgentRunningRef,
    hasBrowserControlPermissionAcceptedRef,
    pushMessageRef,
    abortControllerRef,
    shouldDisableSkipPermissions,
    clearPreservedTranscriptForTarget
  });

  useNotificationUIEffects({
    messageLimitType: messageLimit.type,
    setMessageLimitDismissed,
    lastStopReason: lastStopReason?.reason,
    setRefusalFeedbackSent,
    activeSessionId,
    setSkipWarningDismissed,
    notificationBannerTimerRef,
    autoScrollRef,
    apiMessagesLength: apiMessages.length,
    setShowTopGradient
  });

  const rotatingTips = useRotatingTips({ intl });

  const normalizedModelOptions = useNormalizedModelOptions({ providerConfig });

  const selectedProviderExists = Boolean(findProvider(providerConfig, selectedModel));
  const effectiveSelectedModel =
    (selectedProviderExists && selectedModel) || getFirstUsableProvider(providerConfig)?.id || '';

  useModelSync({
    effectiveSelectedModel,
    selectedModel,
    setSelectedModel
  });

  const shouldBlockDomain =
    blockedCategory === 'category1' ||
    blockedCategory === 'category2' ||
    blockedCategory === 'category_org_blocked';
  const hasBlockedSecondaryTabs = blockedTabInfo.blockedTabs.some(
    (item) =>
      item.tabId !== query.tabId &&
      (item.category === 'category1' ||
        item.category === 'category2' ||
        item.category === 'category_org_blocked')
  );

  const fallbackConfig: ModelFallbackConfig | undefined = undefined as
    | ModelFallbackConfig
    | undefined;
  const announcementText = announcementConfig.text || '';
  const messageLimitBanner = useMessageLimitBanner({ messageLimit, selectedModel });

  const {
    handleConvertToScheduledTask,
    acceptBrowserControlPermission,
    closeBlockedSites,
    dismissAnnouncement
  } = useActionCallbacks({
    effectiveIsAgentRunning,
    isConvertingToTask,
    setIsConvertingToTask,
    effectiveApiMessages,
    input,
    permissionMode,
    effectiveSelectedModel,
    setRuntimeError,
    setIsHeaderMenuOpen,
    setIsLanguageSubmenuOpen,
    pendingPrompt,
    setPendingPrompt,
    setInput,
    setPopulatedInputTargetTabId,
    effectiveSendPrompt,
    setHasBrowserControlPermissionAccepted,
    queryTabId: query.tabId,
    blockedTabInfo,
    announcementConfig,
    setAnnouncementDismissed,
    setRefusalFeedbackSent,
    activeSessionId,
    selectedModel,
    fallbackConfig
  });

  const { handleModelChange, openOptionsPage, handleLanguageSelection, confirmLocaleChange } =
    useUIActions({
      selectedModel,
      effectiveIsAgentRunning,
      effectiveCancel,
      effectiveSelectedModel,
      setSelectedModel,
      setIsModelMenuOpen,
      setIsHeaderMenuOpen,
      setIsLanguageSubmenuOpen,
      locale,
      messages,
      setPendingLocale,
      setLocale,
      pendingLocale,
      clearConversation
    });

  const handleStartWorkflowRecording = useHandleStartWorkflowRecording({
    setShowWorkflowModeSelectionModal,
    startRecording
  });

  const activeBanner = useActiveBanner({
    messageLimitBanner,
    versionUpdateBanner: versionState.isBlocked ? 'version_update' : null,
    effectiveRuntimeError,
    lastStopReason,
    fallbackConfig,
    messageLimitDismissed,
    permissionMode: permissionMode as PermissionMode,
    skipWarningDismissed,
    showNotificationBanner,
    notificationsEnabled,
    announcementConfig,
    announcementText,
    announcementDismissed
  });

  const contextDebugInfo = useContextDebugInfo({
    debugMode,
    apiMessages: effectiveApiMessages,
    serverModelInfo
  });

  const selectedModelLabel = useSelectedModelLabel({
    normalizedModelOptions,
    effectiveSelectedModel,
    providerConfig
  });

  const hasChatMessages = effectiveMessages.length > 0;
  const showHighRiskFrame = permissionMode === 'skip_all_permission_checks';

  // Sync action/input refs to external stores for ChatInputArea consumption.
  useEffect(() => {
    useChatActionsStore.setState({
      submit,
      handlePaste,
      handleFileSelection,
      captureCurrentTabScreenshot,
      effectiveCancel,
      sendPrompt,
      effectiveSendPrompt,
      insertShortcutChip,
      navigateActiveTabToUrl,
      effectiveClearError
    });
  }, [
    submit,
    handlePaste,
    handleFileSelection,
    captureCurrentTabScreenshot,
    effectiveCancel,
    sendPrompt,
    effectiveSendPrompt,
    insertShortcutChip,
    navigateActiveTabToUrl,
    effectiveClearError
  ]);

  useEffect(() => {
    useChatInputStore.setState({
      scrollRefs,
      autoScrollRef,
      inputRef,
      sentinelElement,
      isChatInputBeamActive,
      chatInputSurfaceClass,
      recordingState,
      debugMode,
      contextDebugInfo,
      shouldDisableSkipPermissions,
      rotatingTips,
      permissionModeMenuOptions
    });
  }, [
    scrollRefs,
    autoScrollRef,
    inputRef,
    sentinelElement,
    isChatInputBeamActive,
    chatInputSurfaceClass,
    recordingState,
    debugMode,
    contextDebugInfo,
    shouldDisableSkipPermissions,
    rotatingTips,
    permissionModeMenuOptions
  ]);

  return {
    // Query and routing
    query,
    versionState,
    shouldBlockDomain,
    hasBlockedSecondaryTabs,
    blockedCategory,
    blockedTabInfo,
    authLoading,
    authError,
    effectiveMessagesClient,
    hasProviderConfig,
    handleSetupRetry,
    closeBlockedSites,
    hasBrowserControlPermissionAccepted,
    acceptBrowserControlPermission,

    // Mode
    isPurlMode,
    purlModeFeatureEnabled,
    lightningResult,

    // UI refs
    autoScrollRef,
    inputRef,
    sentinelElement,
    sentinelCallbackRef,
    scrollRefs,
    messageListScrollRefs,
    streamingTextStoreRef,

    // Model
    selectedModel,
    selectedModelLabel,
    effectiveSelectedModel,
    normalizedModelOptions,
    handleModelChange,
    providerConfig,

    // Chat
    input,
    setInput,
    messages: effectiveMessages,
    apiMessages: effectiveApiMessages,
    hasChatMessages,
    clearConversation,

    // Agent
    effectiveIsAgentRunning,
    effectiveIsCompacting,
    effectiveCurrentStatus,
    isConvertingToTask,
    isChatInputBeamActive,
    chatInputSurfaceClass,
    effectiveCancel,
    sendPrompt,
    effectiveSendPrompt,

    // Permission
    permissionMode,
    permissionPrompt,
    permissionModeMenuOptions,
    shouldDisableSkipPermissions,
    handlePermissionAllow,
    handlePermissionDeny,

    // Session
    activeSessionId,
    showHistoryPanel,
    setShowHistoryPanel,
    handleLoadHistorySession,

    // Workflow
    recordingState,
    isSpeechRecording,
    isSpeechSupported,
    hasSpeechPermissionFromHook,
    currentInterimTranscript,
    stopRecording,
    togglePause,
    toggleSpeechRecording,
    removeStep,
    updateStep,
    handleStartWorkflowRecording,
    invokeSessionModel,
    setPromptToSave,

    // UI
    randomStartupKey,
    debugMode,
    contextDebugInfo,
    activeBanner,
    messageLimitBanner,
    announcementConfig,
    dismissAnnouncement,
    fallbackConfig,
    rotatingTips,
    effectiveRuntimeError,
    effectiveClearError,

    // Actions
    submit,
    handlePaste,
    handleFileSelection,
    captureCurrentTabScreenshot,
    insertShortcutChip,
    navigateActiveTabToUrl,
    handleConvertToScheduledTask,
    openOptionsPage,
    handleLanguageSelection,
    confirmLocaleChange,

    // Misc
    hasMicrophonePermission,
    currentPageUrl,
    currentPageTitle,
    intl,
    showHighRiskFrame,
    setPopulatedInputTargetTabId
  };
}
