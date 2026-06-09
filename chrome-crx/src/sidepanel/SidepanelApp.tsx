import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BorderBeam } from 'border-beam';
import { BUILT_IN_MODELS, DEFAULT_MODEL } from '../constants/models';
import { AnimatePresence } from 'framer-motion';
import { SuperDuckAvatar } from './SuperDuckAvatar';
// Radix Tooltip import removed — replaced with CSS-only tooltip to avoid React 19 crash
import {
  ArrowUp,
  Bell,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Clock,
  Languages,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  Plus,
  Settings2,
  Workflow,
  X,
  Zap
} from 'lucide-react';
import {
  StorageKeys,
  type ModelsConfigFeatureValue,
  PermissionDuration,
  PromptService,
  type SavedPrompt as StoredSavedPrompt,
  type VersionInfoFeatureValue,
  getStorageValue,
  setStorageValue
} from '../extensionServices';
import { useStorageState } from '@/hooks/useStorageState';
import { PermissionManager } from '../PermissionManager';
import {
  LOCALE_DISPLAY_NAMES,
  MemoizedFormattedMessage,
  SUPPORTED_LOCALES,
  type SupportedLocale,
  useIntlSafe,
  usePreferredLocale
} from '../index-react-dom-intl';
import {
  categoryChecker,
  executeTool,
  getToolSchemasForMcp,
  tabGroupManager,
  trackEvent
} from '../mcpRuntime';
import { generateShortcutName, type ModelRequest } from './sessionPool';
import { getMappedModelName } from '../utils/modelMapping';
import { dispatchMessagesClient } from '../utils/providerClient';
import { useProviderClient } from './provider';
import { EmptyState } from './EmptyState';
import { useQueryState, useTabEvent, useActiveTabId } from './hooks';
import { ImagePreviewModal, ScreenshotLightbox } from './MessageViews';
import { MessageList } from './MessageComponents';
import { InlinePermissionPrompt, isPermissionPromptData } from './PermissionPrompt';
import { ScrollContainer, type ScrollContainerHandle } from './ScrollContainer';
import { stripTrailingEllipsis, ThinkingDots } from './StatusDisplay';
import { WorkflowModeSelectionModal } from './WorkflowModeSelectionModal';
import { WorkflowRecordingInterface } from './WorkflowRecordingInterface';
import { CreateShortcutModal } from './CreateShortcutModal';
import { ShortcutsMenu } from './ShortcutsMenu';
import { RotatingTips } from './RotatingTips';
import { RichTextInput, type RichTextInputHandle } from './RichTextInput';
import { PERMISSION_MODE_OPTIONS, PermissionModeMenu } from './PermissionModeMenu';
import { useWorkflowRecording } from './useWorkflowRecording';
import { useLightningMode } from './useLightningMode';
import { useAuth } from './hooks/useAuth';
import { useModelConfig } from './hooks/useModelConfig';
import { useSessionPersistence } from './hooks/useSessionPersistence';
import { useAgentLoop } from './hooks/useAgentLoop';
import { useRuntimeMessages } from './hooks/useRuntimeMessages';
import { Tooltip } from './Tooltip';
import { useUIStore } from './stores';
import { AutoScrollSpacer, LastMessageSentinel } from './AutoScrollSpacer';
import { SessionHistoryPanel, SESSION_HISTORY_PANEL_STYLES } from './SessionHistoryPanel';
import {
  CONTEXT_WINDOW,
  MAX_TOKENS,
  getMessageLimitBannerState,
  type MessageLimitState
} from './messageLimits';
import { compareVersions, formatToolResult, getErrorMessage } from './messageProcessing';
import { resolveShortcutMarkersInMessages } from './shortcutMarkers';
import {
  createId,
  getModelDisplayName,
  getTextFromBlockContent,
  isPermissionMode,
  openOptionsTo,
  readFileAsBase64,
  type PermissionMode,
  type PromptAttachmentPayload
} from './sidepanelUtils';
import {
  createStreamingTextStore,
  getTabSessionKey,
  LAST_ACTIVE_SESSION_KEY,
  normalizeToolResultContent,
  usePrefersReducedMotion
} from './sidepanelGuards';
import type {
  ApiConversationMessage,
  ApiResponseMessage,
  ApiToolResultBlock,
  ApiUsage,
  CreateApiMessageParams
} from '../messageTypes';
import { isRecord } from '../messageTypes';
import type { ToolProviderSchema } from '../mcpRuntime/pageToolsSupport/types';
import {
  AnnouncementIcon,
  BlockedDomainView,
  BrowserPermissionGate,
  CompactBanner,
  ModelFallbackCard,
  SetupGate,
  PermissionPrompt,
  SAFE_USE_TIPS_URL,
  ScrollToBottomButton,
  SecondaryTabView,
  VersionBlockedView
} from './components/SidepanelSupportViews';
import { SidepanelHeader } from './components/SidepanelHeader';
import { SidepanelBanners } from './components/SidepanelBanners';
import { ChatInputArea } from './components/ChatInputArea';
import { CursorClickIcon } from './icons';
import type {
  ChatRole,
  VisibleChatRole,
  NotificationPreference,
  ChatMessage,
  PermissionPromptData,
  PermissionGrantScope,
  PairingPromptState,
  PendingPromptPayload,
  BlockedTabInfo,
  ToolUseBlock,
  AnnouncementConfig
} from './types';

// Module-level constant for useTabEvent's properties. It MUST live at
// the module scope (not be inlined in the call) because useTabEvent's
// internal useEffect lists `properties` as a dependency. An inline
// `['groupId', 'url', 'status']` would create a new array reference on
// every render, causing the effect to re-run subscribe/unsubscribe on
// every render and combining with useActiveTabId's setState to form an
// infinite render loop (SidepanelApp rendered 100/200 times in dev).
const TAB_GROUP_EVENT_PROPERTIES: string[] = ['groupId', 'url', 'status'];

// ─── Plan Mode types and utilities ───

export function SidepanelApp() {
  const intl = useIntlSafe();
  // Performance monitoring - remove in production
  const renderCountRef = useRef(0);
  renderCountRef.current++;
  if (renderCountRef.current % 100 === 0) {
    console.warn(`[PERF] SidepanelApp rendered ${renderCountRef.current} times`);
  }

  useEffect(() => {
    void trackEvent('superduck.sidebar.opened', {});
    // Ask the service worker to make sure the active tab is in a SuperDuck
    // group. Runs once per sidepanel open; tabGroupManager.createGroup() is
    // idempotent (skips when the tab is already in a group), so this is
    // safe to call on every open. This is the new home of group creation
    // since chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    // bypasses our chrome.action.onClicked handler.
    chrome.runtime.sendMessage({ type: 'PANEL_READY' }).catch(() => {
      // PANEL_READY is best-effort: if the service worker isn't ready or the
      // user closes the sidepanel before the message roundtrips, that's fine.
    });
  }, []);

  const _query = useQueryState();

  // Dynamically track the active tab so the sidepanel survives tab switches.
  // When the sidepanel is opened as a window-bound panel (not tab-bound),
  // the iframe is NOT destroyed on tab switch — it stays open and this hook
  // updates the target tabId to match the user's active tab.
  const dynamicTabId = useActiveTabId(_query.tabId);
  const query = useMemo(
    () => ({ ..._query, tabId: dynamicTabId ?? _query.tabId }),
    [_query, dynamicTabId]
  );

  // Feature flags removed — all values are defaults (empty)
  const versionInfoRaw = null;
  const modelConfigRaw = null;
  const announcementConfigRaw = null;
  const purlModeFeatureEnabled = false;

  const versionInfo = useMemo<VersionInfoFeatureValue>(
    () => versionInfoRaw || {},
    [versionInfoRaw]
  );
  const modelConfig = useMemo<ModelsConfigFeatureValue>(
    () => modelConfigRaw || {},
    [modelConfigRaw]
  );
  const announcementConfig = useMemo<AnnouncementConfig>(
    () => announcementConfigRaw || {},
    [announcementConfigRaw]
  );

  // Initialize with empty string; resolved via async effect below to restore
  // the last session for this tab (fixes chat history loss on panel reopen).
  const [activeSessionId, setActiveSessionId] = useState(query.sessionId || '');
  const [activeConversationUuid, setActiveConversationUuid] = useState<string | null>(null);
  const [activeRemoteSessionId, setActiveRemoteSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [apiMessages, setApiMessages] = useState<ApiConversationMessage[]>([]);
  const [_messageHistory, setMessageHistory] = useState<ApiConversationMessage[]>([]);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(
    'skip_all_permission_checks'
  );
  const {
    selectedModel,
    selectedModelRef,
    setSelectedModel,
    modelMapping,
    handleModelChange: _rawHandleModelChange
  } = useModelConfig();

  // Lightning (Quick/Purl) mode toggle state — persisted to chrome.storage
  const [purlModeToggle, setPurlModeToggle] = useState(false);
  const isPurlMode = !!purlModeFeatureEnabled && purlModeToggle;
  useEffect(() => {
    if (purlModeFeatureEnabled) {
      chrome.storage.local.get('purlMode').then((result) => {
        if (result.purlMode) setPurlModeToggle(true);
      });
    }
  }, [purlModeFeatureEnabled]);

  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [hasInteractiveTools, setHasInteractiveTools] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('');
  const [isCompacting, setIsCompacting] = useState(false);
  const [isConvertingToTask, setIsConvertingToTask] = useState(false);
  const [attachmentCount, setAttachmentCount] = useState(0);
  const [pendingAttachments, setPendingAttachments] = useState<PromptAttachmentPayload[]>([]);
  const [previewAttachmentImage, setPreviewAttachmentImage] = useState<string | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [pairingPrompt, setPairingPrompt] = useState<PairingPromptState | null>(null);
  const [pairingName, setPairingName] = useState('');
  const [hasBrowserControlPermissionAccepted, setHasBrowserControlPermissionAccepted] = useState<
    boolean | null
  >(null);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPromptPayload | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [toolSchemas, setToolSchemas] = useState<ToolProviderSchema[]>([]);
  const { apiKey, apiBaseUrl, authLoading, authError, refreshAuth } = useAuth({
    queryApiKey: query.apiKey,
    queryApiUrl: query.apiUrl
  });
  const [notificationsEnabled, setNotificationsEnabled] =
    useState<NotificationPreference>(undefined);
  const [showNotificationBanner, setShowNotificationBanner] = useState(false);
  const [messageLimit, setMessageLimit] = useState<MessageLimitState>({ type: 'within_limit' });
  const [debugMode] = useStorageState<boolean>(StorageKeys.DEBUG_MODE, false);

  // 固定随机启动文案的选择，避免每次渲染都重新计算
  const randomStartupKey = useMemo(
    () => `starting_up_${Math.floor(Math.random() * 8) + 1}`,
    [] // 只在组件挂载时计算一次
  );
  const [messageLimitDismissed, setMessageLimitDismissed] = useState(false);
  const [skipWarningDismissed, setSkipWarningDismissed] = useState(false);
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const [_refusalFeedbackSent, setRefusalFeedbackSent] = useState(false);
  const [lastStopReason, setLastStopReason] = useState<{
    reason: string;
    messageId?: string;
  } | null>(null);
  const [tokensSaved, setTokensSaved] = useState<number | null>(null);
  const [versionState, setVersionState] = useState({
    isBlocked: false,
    hasUpdate: false,
    currentVersion: '',
    minSupportedVersion: ''
  });
  const [blockedCategory, setBlockedCategory] = useState<string | null>(null);
  const [blockedTabInfo, setBlockedTabInfo] = useState<{
    isMainTabBlocked: boolean;
    blockedTabs: BlockedTabInfo[];
  }>({ isMainTabBlocked: true, blockedTabs: [] });
  const [secondaryState, setSecondaryState] = useState<{
    checking: boolean;
    isSecondaryTab: boolean;
    mainTabId: number | null;
  }>({
    checking: false,
    isSecondaryTab: false,
    mainTabId: null
  });

  // Workflow mode selection modal state
  const { showWorkflowModeSelectionModal, setShowWorkflowModeSelectionModal } = useUIStore();
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [currentPageUrl, setCurrentPageUrl] = useState('');
  const [currentPageTitle, setCurrentPageTitle] = useState('');
  const currentDomain = useMemo(() => {
    try {
      return currentPageUrl ? new URL(currentPageUrl).hostname : null;
    } catch {
      return null;
    }
  }, [currentPageUrl]);
  const [hasMicrophonePermission, setHasMicrophonePermission] = useState(false);

  const debugTooltipRef = useRef<HTMLSpanElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const permissionMenuRef = useRef<HTMLDivElement | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<RichTextInputHandle | null>(null);
  const hasLoadedSessionRef = useRef(false);
  const activeConversationUuidRef = useRef(activeConversationUuid);
  activeConversationUuidRef.current = activeConversationUuid;
  const activeRemoteSessionIdRef = useRef(activeRemoteSessionId);
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
  // Stable refs for values used in the message listener to avoid re-registering on every change
  const sendPromptRef = useRef<
    | ((
        text: string,
        options?: { attachments?: PromptAttachmentPayload[]; isAnnotated?: boolean }
      ) => Promise<void>)
    | null
  >(null);
  const isAgentRunningRef = useRef(isAgentRunning);
  // Lock the tab ID when the agent starts running so that switching tabs
  // doesn't redirect tool calls to a different tab (which would trigger
  // CDP attach on the new tab → duplicate "debugging" banners and
  // unexpected tab group creation).
  const lockedTabIdRef = useRef<number | undefined>(undefined);
  // Tracks which tab the currently active session belongs to. When the
  // user switches tabs while the sidepanel stays open, the resolver
  // re-runs and compares this ref against the new active tab — if they
  // differ, the previous session no longer applies and we re-resolve
  // against the new tab's getTabSessionKey mapping.
  const sessionResolvedForTabRef = useRef<number | undefined>(undefined);
  const hasBrowserControlPermissionAcceptedRef = useRef(hasBrowserControlPermissionAccepted);
  const pushMessageRef = useRef<((role: ChatRole, text: string) => void) | null>(null);
  const _injectedDomainSkillsRef = useRef<Set<string>>(new Set());
  const autoScrollRef = useRef<ScrollContainerHandle | null>(null);
  // Streaming text store — decouples streaming text updates from React state to avoid
  // re-rendering the entire component tree (~7000 lines) at 60fps during streaming.
  // Only the StreamingTextBlock component subscribes to this store.
  const streamingTextStoreRef = useRef(createStreamingTextStore());
  const [sentinelElement, setSentinelElement] = useState<HTMLDivElement | null>(null);
  const sentinelCallbackRef = useCallback((node: HTMLDivElement | null) => {
    setSentinelElement(node);
  }, []);

  // --- Inline permission prompt state (matches bundle's deferred-Promise pattern) ---
  const [permissionPrompt, setPermissionPrompt] = useState<PermissionPromptData | null>(null);
  const permissionResolveRef = useRef<((allowed: boolean) => void) | null>(null);
  const hasApprovedPlanRef = useRef(false);

  // PermissionManager created once, with dynamic callback reading current permissionMode
  const permissionModeRef = useRef<PermissionMode>(permissionMode);
  permissionModeRef.current = permissionMode;
  const permissionManagerRef = useRef<PermissionManager | null>(null);
  const getPermissionManager = useCallback(() => {
    if (!permissionManagerRef.current) {
      permissionManagerRef.current = new PermissionManager(
        () => permissionModeRef.current === 'skip_all_permission_checks'
      );
    }
    return permissionManagerRef.current;
  }, []);
  const scrollRefs = useRef({
    lastAssistantMessage: React.createRef<HTMLDivElement>(),
    lastHumanMessage: React.createRef<HTMLDivElement>(),
    extras: React.createRef<HTMLDivElement>(),
    extraSpace: React.createRef<HTMLDivElement>(),
    chatInput: React.createRef<HTMLDivElement>()
  }).current;
  // Stable reference for MessageList — avoids breaking React.memo on every parent render
  const messageListScrollRefs = useMemo(
    () => ({
      lastAssistantMessage: scrollRefs.lastAssistantMessage,
      lastHumanMessage: scrollRefs.lastHumanMessage
    }),
    [scrollRefs.lastAssistantMessage, scrollRefs.lastHumanMessage]
  );
  const [_showTopGradient, setShowTopGradient] = useState(false);

  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [isLanguageSubmenuOpen, setIsLanguageSubmenuOpen] = useState(false);
  const [isPermissionMenuOpen, setIsPermissionMenuOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [pendingLocale, setPendingLocale] = useState<SupportedLocale | null>(null);
  const { locale, setLocale } = usePreferredLocale();

  // UI Store for workflow recording and command menu
  const promptToSave = useUIStore((state) => state.promptToSave);
  const setPromptToSave = useUIStore((state) => state.setPromptToSave);
  const promptToEdit = useUIStore((state) => state.promptToEdit);
  const setPromptToEdit = useUIStore((state) => state.setPromptToEdit);
  const showCommandMenu = useUIStore((state) => state.showCommandMenu);
  const setShowCommandMenu = useUIStore((state) => state.setShowCommandMenu);
  const commandSearchTerm = useUIStore((state) => state.commandSearchTerm);
  const setCommandSearchTerm = useUIStore((state) => state.setCommandSearchTerm);
  const screenshotPreviewUrl = useUIStore((state) => state.screenshotPreviewUrl);
  const setScreenshotPreviewUrl = useUIStore((state) => state.setScreenshotPreviewUrl);

  // Track when the user explicitly dismissed the command menu (Escape / click-outside)
  // so the useEffect watching `input` doesn't immediately re-open it.
  const commandMenuDismissedRef = useRef(false);
  const commandMenuDismissedInputRef = useRef('');
  const commandMenuRef = useRef<HTMLDivElement>(null);
  const inputValueRef = useRef(input);
  inputValueRef.current = input;

  // Ref-based stable wrapper for createApiMessage to avoid hook ordering issues.
  // createApiMessage is defined later (after messagesClient), but useWorkflowRecording
  // needs it. We use a ref so the wrapper identity is stable across renders.
  const createApiMessageRef = useRef<
    ((params: CreateApiMessageParams) => Promise<ApiResponseMessage>) | null
  >(null);
  const stableCreateMessage = useCallback(async ({ modelClass, ...request }: ModelRequest) => {
    const fn = createApiMessageRef.current;
    if (!fn) throw new Error('Client not initialized');
    return fn({
      ...request,
      ...(modelClass === 'small_fast' ? { modelClass } : {})
    });
  }, []);

  // Workflow recording hook
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
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
    onComplete: (steps) => {
      // TODO: Implement workflow save logic
    },
    createMessage: stableCreateMessage
  });

  const pushMessage = useCallback((role: ChatRole, text: string) => {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { id: createId(), role, text }]);
  }, []);

  const appendVisibleLocalMessages = useCallback(
    (entries: Array<{ role: VisibleChatRole; text: string }>) => {
      const visibleEntries = entries.filter(({ text }) => text.trim().length > 0);
      if (visibleEntries.length === 0) return;

      setMessages((prev) => [
        ...prev,
        ...visibleEntries.map(({ role, text }) => ({ id: createId(), role, text }))
      ]);
      setApiMessages((prev) => [
        ...prev,
        ...visibleEntries.map(({ role, text }) => ({
          role,
          content: text,
          isLocalOnlyMessage: true
        }))
      ]);
    },
    []
  );

  const updateLastAssistantMessage = useCallback((text: string) => {
    // During streaming, only update the external store — avoids re-rendering the
    // entire SidepanelApp component tree on every rAF frame.
    streamingTextStoreRef.current.set(text);
  }, []);

  // Flush streaming text to messages state (call once at end of streaming)
  const flushStreamingText = useCallback(() => {
    const text = streamingTextStoreRef.current.getSnapshot();
    if (text) {
      setMessages((prev) => {
        // Find the last assistant message — not just the last element — because
        // tool calls insert system messages (e.g. "🔧 tool_name") after the
        // assistant placeholder, which would cause the naive lastIndex check
        // to silently drop the streamed text.
        let lastAssistantIdx = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === 'assistant') {
            lastAssistantIdx = i;
            break;
          }
        }
        if (lastAssistantIdx < 0) return prev;
        const updated = [...prev];
        updated[lastAssistantIdx] = { ...updated[lastAssistantIdx], text };
        return updated;
      });
    }
    streamingTextStoreRef.current.set('');
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const schemas = await getToolSchemasForMcp();
        setToolSchemas(Array.isArray(schemas) ? (schemas as ToolProviderSchema[]) : []);
      } catch {
        setToolSchemas([]);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const value = await getStorageValue(StorageKeys.NOTIFICATIONS_ENABLED);
      if (value === 'enabled' || value === 'disabled') {
        setNotificationsEnabled(value);
      }
    })();
  }, []);

  // Initialize page info for workflow modal
  useEffect(() => {
    if (query.tabId) {
      chrome.tabs.get(query.tabId, (tab) => {
        if (tab) {
          setCurrentPageUrl(tab.url || '');
          setCurrentPageTitle(tab.title || '');
        }
      });
    }
  }, [query.tabId]);

  // Check microphone permission
  useEffect(() => {
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((result) => {
        setHasMicrophonePermission(result.state === 'granted');
        result.onchange = () => {
          setHasMicrophonePermission(result.state === 'granted');
        };
      })
      .catch(() => {
        setHasMicrophonePermission(false);
      });
  }, []);

  useEffect(() => {
    const currentVersion = chrome.runtime.getManifest().version;
    setVersionState((prev) => ({ ...prev, currentVersion }));
    (async () => {
      const hasUpdate = await getStorageValue(StorageKeys.UPDATE_AVAILABLE, false);
      setVersionState((prev) => ({ ...prev, hasUpdate: hasUpdate === true }));
    })();
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local' || !(StorageKeys.UPDATE_AVAILABLE in changes)) return;
      setVersionState((prev) => ({
        ...prev,
        hasUpdate: changes[StorageKeys.UPDATE_AVAILABLE].newValue === true
      }));
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  useEffect(() => {
    notificationsEnabledRef.current = notificationsEnabled;
  }, [notificationsEnabled]);

  useEffect(() => {
    setAttachmentCount(pendingAttachments.length);
  }, [pendingAttachments]);

  useEffect(() => {
    if (!isModelMenuOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (modelMenuRef.current?.contains(event.target as Node)) return;
      setIsModelMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isModelMenuOpen]);

  useEffect(() => {
    if (!isHeaderMenuOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (headerMenuRef.current?.contains(event.target as Node)) return;
      setIsHeaderMenuOpen(false);
      setIsLanguageSubmenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isHeaderMenuOpen]);

  useEffect(() => {
    if (!isPermissionMenuOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (permissionMenuRef.current?.contains(event.target as Node)) return;
      setIsPermissionMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isPermissionMenuOpen]);

  useEffect(() => {
    if (!isActionsMenuOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (actionsMenuRef.current?.contains(event.target as Node)) return;
      setIsActionsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isActionsMenuOpen]);

  useEffect(() => {
    if (notificationsEnabled !== undefined) {
      setShowNotificationBanner(false);
      if (notificationBannerTimerRef.current) {
        window.clearTimeout(notificationBannerTimerRef.current);
        notificationBannerTimerRef.current = null;
      }
    }
  }, [notificationsEnabled]);

  useEffect(() => {
    const announcementId = announcementConfig.id || '';
    if (!announcementId) {
      setAnnouncementDismissed(true);
      return;
    }
    let active = true;
    (async () => {
      const dismissedId = await getStorageValue(StorageKeys.ANNOUNCEMENT_DISMISSED, '');
      if (!active) return;
      setAnnouncementDismissed(dismissedId === announcementId);
    })();
    return () => {
      active = false;
    };
  }, [announcementConfig.id]);

  useEffect(() => {
    const minSupportedVersion =
      typeof versionInfo.min_supported_version === 'string'
        ? versionInfo.min_supported_version
        : '';
    setVersionState((prev) => ({
      ...prev,
      minSupportedVersion,
      isBlocked:
        !!minSupportedVersion &&
        !!prev.currentVersion &&
        compareVersions(prev.currentVersion, minSupportedVersion) < 0
    }));
  }, [versionInfo]);

  const { effectiveMessagesClient, hasProviderConfig, serverModelInfo, serverContextLengthRef } =
    useProviderClient({ apiKey, apiBaseUrl });

  const systemPrompt = useMemo(() => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const modifier = isMac ? 'cmd' : 'ctrl';
    const platform = isMac ? 'Mac' : 'Windows/Linux';
    return [
      {
        type: 'text' as const,
        text: [
          'You are SuperDuck running in the SuperDuck Chrome sidepanel.',
          `Current model: ${selectedModel || 'default'}.`,
          `Permission mode: ${permissionMode}.`,
          `Platform: ${platform}. Use ${modifier} for shortcut modifier keys.`,
          '',
          'CLICK WORKFLOW (IMPORTANT):',
          '1. Call read_page (filter: interactive) to get element refs (ref_1, ref_2, etc.)',
          '2. Identify the target element by its ref from the accessibility tree',
          '3. Call computer with action: left_click and ref: "ref_N" (NOT coordinate)',
          '4. Refs are invalidated after page navigation — call read_page again after clicks that navigate',
          'NEVER use screenshot coordinates for clicking. ALWAYS use ref from read_page.',
          'Only use coordinate as absolute last resort for canvas/image-map elements that have no ref.',
          '',
          'Before your final natural-language response, call turn_answer_start once for that turn.'
        ].join('\n')
      }
    ];
  }, [permissionMode, selectedModel]);

  const createApiMessage = useCallback(
    async (params: CreateApiMessageParams, _parentSpan?: unknown, _spanName?: string) => {
      if (!effectiveMessagesClient) throw new Error('Client not initialized');

      // Destructure fields that need special handling (matching compiled Ze)
      const {
        modelClass,
        maxTokens,
        max_tokens: maxTokensSnake,
        model: paramModel,
        messages: rawMessages,
        ...rest
      } = params;

      // Use camelCase maxTokens (from sessionPool functions) or snake_case max_tokens (from direct callers)
      const effectiveMaxTokens = maxTokens ?? maxTokensSnake ?? MAX_TOKENS;

      // Resolve model: explicit model > modelClass > selectedModel
      let resolvedModel = selectedModel || DEFAULT_MODEL;
      if (paramModel) {
        resolvedModel = paramModel;
      } else if (modelClass === 'small_fast') {
        resolvedModel = modelConfig.small_fast_model || 'claude-haiku-4-5-20251001';
      }

      // Dispatch to per-tier provider (falls back to effectiveMessagesClient).
      const dispatched = await dispatchMessagesClient(resolvedModel, effectiveMessagesClient);

      // Resolve [[shortcut:id:name]] markers in messages (matching compiled mi)
      const messages = rawMessages
        ? await resolveShortcutMarkersInMessages(rawMessages)
        : rawMessages;

      return dispatched.runtime.create(
        {
          ...rest,
          messages,
          max_tokens: effectiveMaxTokens,
          model: dispatched.modelId
        },
        undefined
      );
    },
    [effectiveMessagesClient, selectedModel, modelConfig]
  );

  // Keep the ref in sync so the stable wrapper always calls the latest version
  createApiMessageRef.current = createApiMessage;

  const invokeSessionModel = useCallback(
    async ({ modelClass, ...request }: ModelRequest) =>
      createApiMessage({
        ...request,
        ...(modelClass === 'small_fast' ? { modelClass } : {})
      }),
    [createApiMessage]
  );

  // --- Permission allow/deny handlers (matching bundle's Qt/Xt) ---
  const handlePermissionAllow = useCallback(
    async (duration: PermissionDuration, scope: PermissionGrantScope) => {
      if (!permissionPrompt || !permissionResolveRef.current) return;
      const pm = getPermissionManager();
      await pm.grantPermission(
        scope,
        duration,
        duration === PermissionDuration.ONCE ? permissionPrompt.toolUseId : undefined
      );
      permissionResolveRef.current(true);
      permissionResolveRef.current = null;
      setPermissionPrompt(null);
      // Re-add loading prefix to tab title
      if (query.tabId != null) {
        tabGroupManager.addLoadingPrefix(query.tabId).catch(() => {});
      }
    },
    [permissionPrompt, getPermissionManager, query.tabId]
  );

  const handlePermissionDeny = useCallback(() => {
    if (permissionResolveRef.current) {
      permissionResolveRef.current(false);
      permissionResolveRef.current = null;
    }
    setPermissionPrompt(null);
  }, []);

  // --- onPermissionRequired: deferred-Promise pattern (matching bundle's Ee ref) ---
  const onPermissionRequired = useCallback(
    async (promptData: PermissionPromptData): Promise<boolean> => {
      setPermissionPrompt(promptData);
      // Send a Chrome notification to draw user attention
      try {
        const domain = promptData.url ? new URL(promptData.url).hostname : 'this page';
        chrome.runtime.sendMessage(
          { type: 'SHOW_PERMISSION_NOTIFICATION', action: 'browser_automation', domain },
          () => {
            chrome.runtime.lastError;
          }
        );
      } catch {
        /* ignore */
      }
      return new Promise<boolean>((resolve) => {
        permissionResolveRef.current = resolve;
      });
    },
    []
  );

  // --- Lightning (Quick/Purl) mode hook — bundle's inner function of HV ---
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
    enabled: isPurlMode
  });

  const executeToolUse = useCallback(
    async (toolUse: ToolUseBlock): Promise<ApiToolResultBlock> => {
      // Use the locked tab ID during agent execution to prevent tool calls
      // from being redirected to a different tab when the user switches tabs.
      // This avoids duplicate "debugging" banners and unexpected tab group creation.
      const targetTabId = lockedTabIdRef.current ?? query.tabId;
      if (typeof targetTabId !== 'number') {
        return {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: 'No active tab for tool execution.',
          is_error: true
        };
      }
      const toolStart = Date.now();
      try {
        // Pass the inline permission handler directly to executeTool.
        // processToolResults in mcpRuntime handles the permission flow
        // (prompt → re-execute) using this handler, matching the bundle's
        // deferred-Promise pattern where the sidepanel manages the UI inline.
        const result = await executeTool({
          toolName: toolUse.name,
          args: toolUse.input,
          tabId: targetTabId,
          permissionMode: permissionModeRef.current,
          toolUseId: toolUse.id,
          messagesClient: effectiveMessagesClient,
          onPermissionRequired: async (permissionData: unknown, _permTabId: number) => {
            if (!isPermissionPromptData(permissionData)) return false;
            return onPermissionRequired(permissionData);
          }
        });

        const content = await formatToolResult({
          output: result.output,
          error: result.error,
          base64Image: result.base64Image,
          imageFormat: result.imageFormat,
          content: result.content
        });
        const hasError = isRecord(result) && result.is_error === true;
        void trackEvent('superduck.sidebar.tool_executed', {
          tool_name: toolUse.name,
          success: !hasError,
          duration_ms: Date.now() - toolStart
        });
        return {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: normalizeToolResultContent(content, 'Tool executed.'),
          ...(hasError ? { is_error: true } : {})
        };
      } catch (error) {
        void trackEvent('superduck.sidebar.tool_executed', {
          tool_name: toolUse.name,
          success: false,
          duration_ms: Date.now() - toolStart
        });
        return {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Tool execution failed: ${getErrorMessage(error)}`,
          is_error: true
        };
      }
    },
    [permissionMode, query.tabId, onPermissionRequired, effectiveMessagesClient]
  );

  // ─── Agent loop hook ──────────────────────────────────────────────────────

  const { sendPrompt } = useAgentLoop({
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
    queryTabId: query.tabId,
    intl
  });

  // ─── Lightning/Normal mode routing (bundle's HV pattern) ───
  // When isPurlMode is active and lightningResult is available, route through lightning mode.
  // The effective* variables are used downstream instead of the raw normal-mode state.
  const effectiveMessages = isPurlMode && lightningResult ? lightningResult.messages : messages;
  const effectiveApiMessages =
    isPurlMode && lightningResult ? lightningResult.messages : apiMessages;
  const effectiveIsAgentRunning =
    isPurlMode && lightningResult ? lightningResult.isLoading : isAgentRunning;
  const effectiveCurrentStatus =
    isPurlMode && lightningResult ? lightningResult.currentStatus : currentStatus;
  const effectiveRuntimeError =
    isPurlMode && lightningResult ? lightningResult.error : runtimeError;
  const effectiveIsCompacting = isPurlMode && lightningResult ? false : isCompacting;
  const isChatInputRunning = effectiveIsAgentRunning || effectiveIsCompacting;
  const isChatInputBeamActive = !prefersReducedMotion && isChatInputRunning;
  const chatInputSurfaceClass =
    'bg-bg-000 rounded-2xl relative transition-all focus-within:outline-none cursor-text shadow-[0_0.25rem_1.25rem_hsl(var(--always-black)/3.5%),0_0_0_0.5px_hsla(var(--border-300)/0.15)] hover:shadow-[0_0.25rem_1.25rem_hsl(var(--always-black)/3.5%),0_0_0_0.5px_hsla(var(--border-200)/0.3)] focus-within:shadow-[0_0.25rem_1.25rem_hsl(var(--always-black)/7.5%),0_0_0_0.5px_hsla(var(--border-200)/0.3)]';
  useEffect(() => {
    const msg = effectiveRuntimeError;
    if (!msg) return;
    void trackEvent('superduck.sidebar.error_shown', {
      // Truncate to keep PostHog cardinality bounded and avoid leaking user content.
      message: msg.slice(0, 80),
      source: isPurlMode && lightningResult?.error ? 'chat' : 'runtime'
    });
  }, [effectiveRuntimeError, isPurlMode, lightningResult?.error]);

  // Route sendPrompt: in lightning mode, delegate to lightningResult.sendMessage
  const effectiveSendPrompt = useCallback(
    async (
      text: string,
      options?: { attachments?: PromptAttachmentPayload[]; isAnnotated?: boolean }
    ) => {
      // Lock tab ID synchronously BEFORE starting the agent, so that tool calls
      // always target the tab the user was on when they sent the message.
      // Using useEffect for this creates a race condition where the first tool
      // call could fire before the effect runs.
      if (typeof query.tabId === 'number') {
        lockedTabIdRef.current = query.tabId;
      }
      try {
        if (isPurlMode && lightningResult) {
          return await lightningResult.sendMessage(text, options?.attachments, null, false);
        }
        return await sendPrompt(text, options);
      } finally {
        // If neither the normal agent nor the lightning mode actually
        // transitioned into a "running" state (e.g. sendPrompt hit an
        // early-return for /compact, /share, empty input, or missing
        // client; or lightningResult.sendMessage returned before
        // setting lnIsLoading), the unlock effect would never fire and
        // `lockedTabIdRef` would stay set forever. Clear it ourselves
        // in that case so future calls are not bound to a stale tab.
        const stillRunning = isPurlMode
          ? Boolean(lightningResult?.isLoading)
          : isAgentRunningRef.current;
        if (!stillRunning) {
          lockedTabIdRef.current = undefined;
        }
      }
    },
    [isPurlMode, lightningResult, sendPrompt, query.tabId]
  );

  const effectiveCancel = useCallback(() => {
    void trackEvent('superduck.sidebar.agent_cancelled', {
      mode: isPurlMode ? 'quick' : 'normal',
      iteration_count: iterationCountRef.current
    });
    if (isPurlMode && lightningResult) {
      lightningResult.cancel();
    } else {
      abortControllerRef.current?.abort();
      setIsAgentRunning(false);
    }
    // Ensure indicators are hidden even if no sendPrompt finally-block fires.
    // Use lockedTabId to target the correct tab (the one agent was running on).
    const cancelTabId = lockedTabIdRef.current ?? query.tabId;
    if (typeof cancelTabId === 'number') {
      chrome.tabs.sendMessage(cancelTabId, { type: 'HIDE_AGENT_INDICATORS' }).catch(() => {});
      tabGroupManager.setTabIndicatorState(cancelTabId, 'none').catch(() => {});
    }
  }, [isPurlMode, lightningResult, query.tabId]);

  const effectiveClearError = useCallback(() => {
    if (isPurlMode && lightningResult) {
      lightningResult.clearError();
    }
    setRuntimeError(null);
  }, [isPurlMode, lightningResult]);

  // Keep stable refs in sync with latest EFFECTIVE values
  sendPromptRef.current = effectiveSendPrompt;
  isAgentRunningRef.current = effectiveIsAgentRunning;
  hasBrowserControlPermissionAcceptedRef.current = hasBrowserControlPermissionAccepted;
  pushMessageRef.current = pushMessage;

  // Unlock tab ID when agent stops running. The lock is set synchronously
  // in effectiveSendPrompt (not here) to avoid a race condition where the
  // first tool call fires before this effect runs.
  useEffect(() => {
    if (!effectiveIsAgentRunning) {
      lockedTabIdRef.current = undefined;
    }
  }, [effectiveIsAgentRunning]);

  const retryWithFallback = useCallback(async () => {
    const fallback = modelConfig.modelFallbacks?.[selectedModel];
    const fallbackModel = fallback?.fallbackModelName;
    const payload = lastSentPayloadRef.current;
    if (!fallbackModel || !payload) return;
    void trackEvent('superduck.sidebar.model_fallback', {
      from: selectedModel,
      to: fallbackModel
    });
    setSelectedModel(fallbackModel);
    await setStorageValue(StorageKeys.SELECTED_MODEL, fallbackModel);
    void effectiveSendPrompt(payload.text, {
      attachments: payload.attachments,
      isAnnotated: payload.isAnnotated
    });
  }, [modelConfig, selectedModel, effectiveSendPrompt]);

  const refreshSecondaryState = useCallback(async () => {
    if (typeof query.tabId !== 'number') return;
    try {
      setSecondaryState((prev) => ({ ...prev, checking: true }));
      await tabGroupManager.initialize();
      const inGroup = await tabGroupManager.isInGroup(query.tabId);
      const isMain = tabGroupManager.isMainTab(query.tabId);
      if (inGroup && !isMain) {
        const mainTabId = await tabGroupManager.getMainTabId(query.tabId);
        setSecondaryState({
          checking: false,
          isSecondaryTab: !!mainTabId,
          mainTabId: mainTabId ?? null
        });
      } else {
        // Don't create a group here — group creation should only happen
        // when the user explicitly opens the sidepanel (handleActionClick
        // in sidePanel.ts). Creating groups on tab activation causes
        // unrelated tabs to be pulled into 🦆SuperDuck groups when the
        // user switches tabs while the agent is running.
        setSecondaryState({ checking: false, isSecondaryTab: false, mainTabId: null });
      }
    } catch {
      setSecondaryState({ checking: false, isSecondaryTab: false, mainTabId: null });
    }
  }, [query.tabId]);

  const refreshBlockedState = useCallback(async () => {
    if (typeof query.tabId !== 'number') return;
    try {
      await tabGroupManager.initialize();
      const tab = await chrome.tabs.get(query.tabId);
      const inGroup = await tabGroupManager.isInGroup(query.tabId);
      const isMain = tabGroupManager.isMainTab(query.tabId);
      if (inGroup) {
        const mainTabId = isMain
          ? query.tabId
          : (await tabGroupManager.getMainTabId(query.tabId)) || query.tabId;
        const category = await tabGroupManager.getGroupBlocklistStatus(mainTabId);
        const info = (await tabGroupManager.getBlockedTabsInfo(mainTabId)) as {
          isMainTabBlocked: boolean;
          blockedTabs: BlockedTabInfo[];
        };
        setBlockedCategory(category || null);
        setBlockedTabInfo(info);
      } else if (tab.url) {
        if (tab.url.includes('blocked.html')) {
          setBlockedCategory('category1');
          setBlockedTabInfo({
            isMainTabBlocked: true,
            blockedTabs: [
              {
                tabId: query.tabId,
                title: tab.title || 'Untitled',
                url: tab.url || '',
                category: 'category1'
              }
            ]
          });
        } else {
          const category = await categoryChecker.getCategory(tab.url);
          setBlockedCategory(category || null);
          if (category && category !== 'category0') {
            setBlockedTabInfo({
              isMainTabBlocked: true,
              blockedTabs: [
                {
                  tabId: query.tabId,
                  title: tab.title || 'Untitled',
                  url: tab.url || '',
                  category
                }
              ]
            });
          } else {
            setBlockedTabInfo({ isMainTabBlocked: true, blockedTabs: [] });
          }
        }
      }
    } catch {
      setBlockedCategory(null);
      setBlockedTabInfo({ isMainTabBlocked: true, blockedTabs: [] });
    }
  }, [query.tabId]);

  useTabEvent(
    query.tabId,
    TAB_GROUP_EVENT_PROPERTIES,
    () => {
      void refreshSecondaryState();
      void refreshBlockedState();
    },
    [refreshBlockedState, refreshSecondaryState]
  );

  useEffect(() => {
    void refreshSecondaryState();
    void refreshBlockedState();
  }, [refreshBlockedState, refreshSecondaryState]);

  useEffect(() => {
    let active = true;
    (async () => {
      const accepted = await getStorageValue(
        StorageKeys.BROWSER_CONTROL_PERMISSION_ACCEPTED,
        false
      );
      if (active) setHasBrowserControlPermissionAccepted(accepted === true);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (
      blockedCategory &&
      blockedCategory !== 'category0' &&
      permissionMode === 'skip_all_permission_checks'
    ) {
      setPermissionMode('follow_a_plan');
    }
  }, [blockedCategory, permissionMode]);

  // Live mode-switch handling: skip auto-resolves any pending prompt; follow_a_plan
  // forces the next tool call to re-request plan approval.
  const prevPermissionModeRef = useRef<PermissionMode>(permissionMode);
  useEffect(() => {
    const prev = prevPermissionModeRef.current;
    prevPermissionModeRef.current = permissionMode;
    if (prev === permissionMode) return;

    if (permissionMode === 'skip_all_permission_checks') {
      if (permissionResolveRef.current) {
        permissionResolveRef.current(true);
        permissionResolveRef.current = null;
      }
      setPermissionPrompt(null);
    } else if (permissionMode === 'follow_a_plan') {
      hasApprovedPlanRef.current = false;
      permissionManagerRef.current?.clearTurnApprovedDomains();
    }
  }, [permissionMode]);

  const shouldDisableSkipPermissions = blockedCategory !== null && blockedCategory !== 'category0';
  const permissionModeMenuOptions = useMemo(
    () =>
      PERMISSION_MODE_OPTIONS.filter(
        (option) => !(shouldDisableSkipPermissions && option.value === 'skip_all_permission_checks')
      ),
    [shouldDisableSkipPermissions]
  );
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (query.skipPermissions) {
          if (active) {
            setPermissionMode('skip_all_permission_checks');
          }
          return;
        }
        const savedMode = await getStorageValue(StorageKeys.LAST_PERMISSION_MODE_PREFERENCE);
        if (!active) return;
        if (isPermissionMode(savedMode)) {
          if (shouldDisableSkipPermissions && savedMode === 'skip_all_permission_checks') {
            setPermissionMode('follow_a_plan');
          } else {
            setPermissionMode(savedMode);
          }
        } else {
          setPermissionMode(
            shouldDisableSkipPermissions ? 'follow_a_plan' : 'skip_all_permission_checks'
          );
        }
      } finally {
        if (active) {
          hasLoadedPermissionPreferenceRef.current = true;
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [query.skipPermissions, shouldDisableSkipPermissions]);

  useEffect(() => {
    if (!hasLoadedPermissionPreferenceRef.current) return;
    void setStorageValue(StorageKeys.LAST_PERMISSION_MODE_PREFERENCE, permissionMode);
  }, [permissionMode]);

  // ─── Session ID resolution (restore last session for this tab) ───────────
  // When the sidepanel is opened without an explicit sessionId in the URL,
  // we try to restore the last session ID that was used for this tab.
  // This prevents chat history from being lost on panel close/reopen.
  //
  // We depend on `dynamicTabId` (the live value from useActiveTabId) rather
  // than `query.tabId` (a useMemo derived from it). useActiveTabId resolves
  // the active tab asynchronously, so on first render `dynamicTabId` is
  // `undefined` even when a tab ID will arrive a few frames later. Watching
  // the memoized `query.tabId` would race against that: if we early-returned
  // on `query.tabId` being undefined, the effect would never re-run for the
  // same `activeSessionId` (no `query.tabId` change either) and we'd skip
  // the tab-specific restore and generate a fresh UUID instead.
  //
  // We also re-resolve when the user switches tabs while the sidepanel
  // is window-bound: `dynamicTabId` changes, the previous `activeSessionId`
  // belongs to the old tab, and reading `getTabSessionKey(newTabId)` is
  // the only way to surface the new tab's prior conversation. The
  // `sessionResolvedForTabRef` ref records which tab the active session
  // was last resolved for so we only re-resolve on an actual tab change.
  useEffect(() => {
    // Skip if the current session was already resolved for this tab.
    // This is the hot path: nothing changed, nothing to re-read.
    if (activeSessionId && sessionResolvedForTabRef.current === dynamicTabId) {
      return;
    }

    // Wait for dynamicTabId to be known (a real number) before reading
    // any tab-specific mapping. If we have a URL sessionId, the user
    // is explicitly opening a specific conversation, so we proceed
    // without a tab context.
    if (typeof dynamicTabId !== 'number' && !query.sessionId) return;

    let active = true;
    (async () => {
      const tabId = dynamicTabId;
      const persistTabMapping = async (sessionId: string): Promise<void> => {
        // Only persist the tab→session mapping when we actually have a tab
        // to bind to. Writing under the *current* tab's key (not the
        // previous one the user was on) avoids remapping a tab's prior
        // conversation when the user simply switches tabs while the
        // sidepanel is still open.
        if (typeof tabId === 'number') {
          await setStorageValue(getTabSessionKey(tabId), sessionId);
        }
      };

      // If the active session was opened from a URL (query.sessionId)
      // it overrides any per-tab mapping. The session is bound to the
      // URL, not to the tab — so record it as resolved for the current
      // tab but don't touch the tab→session storage.
      if (query.sessionId) {
        sessionResolvedForTabRef.current = tabId;
        return;
      }

      if (typeof tabId !== 'number') {
        // No tab context — try the global fallback before generating fresh
        const fallbackSessionId = await getStorageValue(LAST_ACTIVE_SESSION_KEY);
        if (!active) return;
        if (typeof fallbackSessionId === 'string' && fallbackSessionId) {
          setActiveSessionId(fallbackSessionId);
        } else {
          setActiveSessionId(crypto.randomUUID());
        }
        sessionResolvedForTabRef.current = tabId;
        return;
      }

      // Try to restore the last session for this tab
      const lastSessionId = await getStorageValue(getTabSessionKey(tabId));
      if (!active) return;

      if (typeof lastSessionId === 'string' && lastSessionId) {
        // The previously-resolved session (activeSessionId) belonged to
        // a different tab. Switch over to whatever the new tab was
        // last bound to, even if the storage write hasn't fully
        // settled. The load effect will hydrate the new conversation
        // from its own snapshot.
        if (lastSessionId !== activeSessionId) {
          setActiveSessionId(lastSessionId);
        }
        // Re-write the mapping so a fresh write happens for the current
        // resolution cycle (cheap, idempotent).
        void persistTabMapping(lastSessionId);
      } else if (sessionResolvedForTabRef.current !== tabId) {
        // Tab-specific session not found AND we are entering a tab that
        // has never been bound before. The currently-active session was
        // inherited from the previous tab, so don't leak it into this
        // tab's storage — fall back to the global last-active session
        // (or generate fresh) and bind that to the new tab.
        const fallbackSessionId = await getStorageValue(LAST_ACTIVE_SESSION_KEY);
        if (!active) return;
        if (
          typeof fallbackSessionId === 'string' &&
          fallbackSessionId &&
          fallbackSessionId !== activeSessionId
        ) {
          setActiveSessionId(fallbackSessionId);
          void persistTabMapping(fallbackSessionId);
        } else if (!activeSessionId) {
          const newId = crypto.randomUUID();
          setActiveSessionId(newId);
          void persistTabMapping(newId);
        } else {
          // The active session has no tab binding yet — record the
          // association now so future tab switches know which tab owns
          // it.
          void persistTabMapping(activeSessionId);
        }
      }
      sessionResolvedForTabRef.current = tabId;
    })();

    return () => {
      active = false;
    };
  }, [activeSessionId, dynamicTabId, query.sessionId]);

  // ─── Tab-session mapping persistence ──────────────────────────────────────
  // The tab→session mapping is written once inside the resolver effect above
  // when a session is actually chosen/created for the current tab. Writing
  // on every `activeSessionId` change would otherwise remap a tab to the
  // previous tab's session whenever the user switches tabs while the
  // sidepanel is open.

  // ─── Global last-active-session persistence ───────────────────────────────
  // Save the active session globally so it can be restored even when the tab
  // ID changes (e.g., sidepanel opened as a new page in e2e tests).
  useEffect(() => {
    if (!activeSessionId) return;
    void setStorageValue(LAST_ACTIVE_SESSION_KEY, activeSessionId);
  }, [activeSessionId]);

  // ─── Session persistence hook ─────────────────────────────────────────────

  const { loadSnapshotForSession } = useSessionPersistence({
    activeSessionId,
    activeConversationUuid,
    activeRemoteSessionId,
    messages,
    apiMessages,
    selectedModel,
    selectedModelRef,
    permissionMode,
    permissionModeRef,
    sessionCreatedAtRef,
    setMessages,
    setApiMessages,
    setMessageHistory,
    setRuntimeError,
    setLastStopReason,
    setTokensSaved,
    setSelectedModel,
    setPermissionMode,
    setActiveConversationUuid,
    setActiveRemoteSessionId,
    hasLoadedSessionRef,
    activeConversationUuidRef,
    activeRemoteSessionIdRef,
    apiKey,
    apiBaseUrl,
    shouldDisableSkipPermissions
  });

  useRuntimeMessages({
    queryTabId: query.tabId,
    queryMode: query.mode,
    querySessionId: query.sessionId,
    querySkipPermissions: query.skipPermissions,
    secondaryState,
    activeSessionId,
    setActiveConversationUuid,
    setActiveRemoteSessionId,
    setActiveSessionId,
    setPairingPrompt,
    setPairingName,
    setInput,
    setPermissionMode,
    setSelectedModel,
    setAttachmentCount,
    setPendingAttachments,
    setPreviewAttachmentImage,
    setPendingPrompt,
    setIsAgentRunning,
    loadSnapshotForSession,
    sessionCreatedAtRef,
    sendPromptRef,
    isAgentRunningRef,
    hasBrowserControlPermissionAcceptedRef,
    pushMessageRef,
    abortControllerRef,
    shouldDisableSkipPermissions
  });

  useEffect(() => {
    if (messageLimit.type === 'within_limit') return;
    setMessageLimitDismissed(false);
  }, [messageLimit.type]);

  useEffect(() => {
    if (lastStopReason?.reason === 'refusal') return;
    setRefusalFeedbackSent(false);
  }, [lastStopReason?.reason]);

  useEffect(() => {
    setSkipWarningDismissed(false);
  }, [activeSessionId]);

  useEffect(
    () => () => {
      if (notificationBannerTimerRef.current) {
        window.clearTimeout(notificationBannerTimerRef.current);
        notificationBannerTimerRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    if (
      !secondaryState.isSecondaryTab ||
      !secondaryState.mainTabId ||
      typeof query.tabId !== 'number'
    ) {
      return;
    }

    let active = true;
    const timeout = setTimeout(async () => {
      if (!active) return;
      try {
        if (query.tabId === undefined) return;
        await tabGroupManager.promoteToMainTab(secondaryState.mainTabId!, query.tabId);
        window.location.reload();
      } catch {
        setSecondaryState((prev) => ({ ...prev, checking: false }));
      }
    }, 3000);

    chrome.runtime.sendMessage(
      {
        type: 'SECONDARY_TAB_CHECK_MAIN',
        secondaryTabId: query.tabId,
        mainTabId: secondaryState.mainTabId,
        timestamp: Date.now()
      },
      async (response) => {
        clearTimeout(timeout);
        if (!active) return;
        if (response?.success) {
          setSecondaryState((prev) => ({ ...prev, checking: false }));
        } else {
          try {
            if (query.tabId === undefined) {
              setSecondaryState((prev) => ({ ...prev, checking: false }));
              return;
            }
            await tabGroupManager.promoteToMainTab(secondaryState.mainTabId!, query.tabId);
            window.location.reload();
          } catch {
            setSecondaryState((prev) => ({ ...prev, checking: false }));
          }
        }
      }
    );

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query.tabId, secondaryState.isSecondaryTab, secondaryState.mainTabId]);

  // Top gradient on scroll
  useEffect(() => {
    const container = autoScrollRef.current?.getScrollContainer();
    if (!container) return;
    const handleScroll = () => {
      setShowTopGradient(container.scrollTop > 10);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [apiMessages.length]);

  const submit = useCallback(async () => {
    const hasAttachments = pendingAttachments.length > 0;
    const value = input.trim();
    if ((!value && !hasAttachments) || effectiveIsAgentRunning) return;
    // Must have an API key
    if (!apiKey && !effectiveMessagesClient) return;

    let finalPrompt = value;

    // Handle shortcut commands (starting with /)
    // Instead of resolving prompt here, convert to [[shortcut:id:name]] marker.
    // The marker is displayed as a visual chip in the chat UI, and resolved to
    // the actual prompt content by resolveShortcutMarkersInMessages before API call.
    if (value.startsWith('/')) {
      const commandName = value.slice(1).split(' ')[0];
      const additionalText = value.slice(1 + commandName.length).trim();

      const savedPrompt = await PromptService.getPromptByCommand(commandName);

      if (savedPrompt) {
        // Use [[shortcut:id:name]] marker — displayed as chip, resolved before API call
        finalPrompt = `[[shortcut:${savedPrompt.id}:${savedPrompt.command || commandName}]]`;
        if (additionalText) {
          finalPrompt = finalPrompt + ' ' + additionalText;
        }
      }
    }

    const attachmentsToSend = pendingAttachments;
    void trackEvent('superduck.sidebar.message_sent', {
      input_length: value.length,
      attachment_count: attachmentsToSend.length,
      has_attachment: attachmentsToSend.length > 0,
      is_shortcut: value.startsWith('/'),
      model: selectedModelRef.current || '',
      permission_mode: permissionModeRef.current
    });
    setInput('');
    setPendingAttachments([]);
    setPreviewAttachmentImage(null);
    setAttachmentCount(0);
    setIsPermissionMenuOpen(false);
    setIsActionsMenuOpen(false);
    void effectiveSendPrompt(finalPrompt, {
      attachments: attachmentsToSend,
      isAnnotated: attachmentsToSend.some((item) => item.isAnnotated)
    });
  }, [input, pendingAttachments, effectiveSendPrompt, effectiveIsAgentRunning, apiKey]);

  const insertShortcutChip = useCallback((command: string, label?: string) => {
    void trackEvent('superduck.sidebar.shortcut_used', { command });
    inputRef.current?.clear();
    inputRef.current?.insertShortcut(command, label || command);
    inputRef.current?.focus();
  }, []);

  const navigateActiveTabToUrl = useCallback(async (url: string) => {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return;
      }

      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });
      if (tabs[0]?.id) {
        await chrome.tabs.update(tabs[0].id, {
          url: parsedUrl.toString()
        });
      }
    } catch (error) {
      console.error('Failed to navigate to URL:', error);
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => {
      const next = prev.filter((item) => item.id !== id);
      setAttachmentCount(next.length);
      if (next.length === 0) setPreviewAttachmentImage(null);
      return next;
    });
  }, []);

  const handleFileSelection = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const nextAttachments: PromptAttachmentPayload[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const base64 = await readFileAsBase64(file);
        nextAttachments.push({
          id: createId(),
          base64,
          mediaType: file.type || 'image/png',
          fileName: file.name || `image-${Date.now()}.png`
        });
      } catch {
        // ignore single-file read errors
      }
    }
    if (nextAttachments.length === 0) return;
    setPendingAttachments((prev) => {
      const merged = [...prev, ...nextAttachments];
      setAttachmentCount(merged.length);
      return merged;
    });
    setIsActionsMenuOpen(false);
    if (!inputRef.current) return;
    inputRef.current.focus();
  }, []);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length === 0) return;
      event.preventDefault();
      void trackEvent('superduck.sidebar.image_pasted', {});
      const dataTransfer = new DataTransfer();
      imageFiles.forEach((f) => dataTransfer.items.add(f));
      void handleFileSelection(dataTransfer.files);
    },
    [handleFileSelection]
  );

  const captureCurrentTabScreenshot = useCallback(async () => {
    try {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = activeTabs[0];
      if (!activeTab?.windowId) {
        throw new Error('No active tab found.');
      }
      const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'png' });
      const marker = 'base64,';
      const markerIndex = dataUrl.indexOf(marker);
      if (markerIndex < 0) {
        throw new Error('Invalid screenshot data.');
      }
      const base64 = dataUrl.slice(markerIndex + marker.length);
      setPendingAttachments((prev) => {
        const next = [
          ...prev,
          {
            id: createId(),
            base64,
            mediaType: 'image/png',
            fileName: `screenshot-${Date.now()}.png`
          }
        ];
        setAttachmentCount(next.length);
        return next;
      });
      setIsActionsMenuOpen(false);
      inputRef.current?.focus();
      void trackEvent('superduck.sidebar.screenshot_captured', {});
    } catch (error) {
      setRuntimeError(`Unable to capture screenshot: ${getErrorMessage(error)}`);
    }
  }, []);

  // Rotating tips for empty input placeholder
  const rotatingTips = useMemo(
    () => [
      intl.formatMessage({ id: 'tip_type_message', defaultMessage: '输入消息开始对话...' }),
      intl.formatMessage({ id: 'tip_slash_command', defaultMessage: '输入 / 调用快捷操作' }),
      intl.formatMessage({ id: 'tip_workflow', defaultMessage: '输入 / 选择录制工作流' }),
      intl.formatMessage({ id: 'tip_schedule', defaultMessage: '输入 / 选择创建定时任务' }),
      intl.formatMessage({ id: 'tip_shortcut', defaultMessage: '输入 / 管理和使用快捷指令' })
    ],
    [intl]
  );

  // Handle command menu when input starts with / or 、(Chinese IME equivalent)
  useEffect(() => {
    // If the user was dismissed but then typed more, reset the dismissed flag
    if (commandMenuDismissedRef.current && input !== commandMenuDismissedInputRef.current) {
      commandMenuDismissedRef.current = false;
    }

    const hasShortcutChip = inputRef.current?.hasShortcutChips() ?? false;
    const startsWithCommandTrigger = input.startsWith('/') || input.startsWith('、');

    if (startsWithCommandTrigger && !hasShortcutChip) {
      const commandName = input.slice(1).split(' ')[0];
      setCommandSearchTerm(commandName);
      if (!showCommandMenu && !commandMenuDismissedRef.current) {
        setShowCommandMenu(true);
      }
    } else {
      // Only keep slash suggestions open for raw slash input, not inserted shortcut chips.
      if (showCommandMenu) {
        setShowCommandMenu(false);
        setCommandSearchTerm('');
      }
      if (!startsWithCommandTrigger) {
        commandMenuDismissedRef.current = false;
      }
    }
  }, [input, showCommandMenu, setShowCommandMenu, setCommandSearchTerm]);

  // Click-outside handler for the command menu (matching compiled lines 37315-37321)
  useEffect(() => {
    if (!showCommandMenu) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (commandMenuRef.current && !commandMenuRef.current.contains(target)) {
        commandMenuDismissedRef.current = true;
        commandMenuDismissedInputRef.current = inputValueRef.current;
        setShowCommandMenu(false);
        setCommandSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [showCommandMenu, setShowCommandMenu, setCommandSearchTerm]);

  // Shift+Tab cycles permission modes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when IME is composing — Escape during CJK input cancels the
      // composition, not the agent.
      if (e.isComposing) return;
      if (e.key === 'Escape' && effectiveIsAgentRunning) {
        effectiveCancel();
      }
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        const modes = permissionModeMenuOptions.map((o) => o.value);
        if (modes.length === 0) return;
        const idx = (modes.indexOf(permissionMode) + 1) % modes.length;
        void trackEvent('superduck.sidebar.permission_mode_changed', {
          from: permissionMode,
          to: modes[idx]
        });
        setPermissionMode(modes[idx]);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [effectiveIsAgentRunning, effectiveCancel, permissionMode, permissionModeMenuOptions]);

  const clearConversation = useCallback(() => {
    const hadMessages = messages.length > 0;
    setMessages([]);
    if (hadMessages) {
      void trackEvent('superduck.sidebar.conversation_cleared', { had_messages: true });
    }
    abortControllerRef.current?.abort();
    setIsAgentRunning(false);
    if (typeof query.tabId === 'number') {
      chrome.tabs.sendMessage(query.tabId, { type: 'HIDE_AGENT_INDICATORS' }).catch(() => {});
      tabGroupManager.setTabIndicatorState(query.tabId, 'none').catch(() => {});
    }
    setApiMessages([]);
    setMessageHistory([]);
    setTokensSaved(null);
    setRuntimeError(null);
    setLastStopReason(null);
    setActiveConversationUuid(null);
    setActiveRemoteSessionId(null);
    // Clear pending permission prompt (matching bundle's resetOnSessionClear)
    if (permissionResolveRef.current) {
      permissionResolveRef.current(false);
      permissionResolveRef.current = null;
    }
    setPermissionPrompt(null);
    // Reset permission state so the new session doesn't inherit the previous
    // session's mode, plan approval, or per-turn approved domains.
    setPermissionMode('skip_all_permission_checks');
    hasApprovedPlanRef.current = false;
    permissionManagerRef.current?.clearTurnApprovedDomains();
    if (!query.sessionId) {
      const nextSessionId = crypto.randomUUID();
      sessionCreatedAtRef.current = Date.now();
      setActiveSessionId(nextSessionId);
    }
  }, [messages, query.sessionId]);

  // Load a historical session: clears current state and switches to the selected session.
  // The useSessionPersistence hook's load effect will pick up the new activeSessionId
  // and restore the snapshot from storage.
  const handleLoadHistorySession = useCallback(
    (sessionId: string, conversationUuid?: string) => {
      if (sessionId === activeSessionId) return;

      void trackEvent('superduck.sidebar.history_session_loaded', {});

      // Abort any running agent
      abortControllerRef.current?.abort();
      setIsAgentRunning(false);
      if (typeof query.tabId === 'number') {
        chrome.tabs.sendMessage(query.tabId, { type: 'HIDE_AGENT_INDICATORS' }).catch(() => {});
        tabGroupManager.setTabIndicatorState(query.tabId, 'none').catch(() => {});
      }

      // Clear current state before switching
      setMessages([]);
      setApiMessages([]);
      setMessageHistory([]);
      setRuntimeError(null);
      setLastStopReason(null);
      setTokensSaved(null);
      // Clear stale streaming text so the new session doesn't briefly show
      // the previous session's last assistant response.
      streamingTextStoreRef.current.set('');

      // Clear attachments and stale retry payload so they don't leak into
      // the new session (Issues 4.3, 4.5 from UX audit).
      setPendingAttachments([]);
      setPreviewAttachmentImage(null);
      setAttachmentCount(0);
      lastSentPayloadRef.current = null;

      // Clear notification banner timer from previous session
      if (notificationBannerTimerRef.current) {
        window.clearTimeout(notificationBannerTimerRef.current);
        notificationBannerTimerRef.current = null;
      }

      // Clear pending permission prompt
      if (permissionResolveRef.current) {
        permissionResolveRef.current(false);
        permissionResolveRef.current = null;
      }
      setPermissionPrompt(null);

      // Gate the persistence save effect BEFORE switching sessionId.
      // Without this, the save effect fires with empty messages/apiMessages
      // (set above) and writes an empty snapshot to the new session's storage
      // key, destroying the historical data before the load effect can read it.
      hasLoadedSessionRef.current = false;

      // Reset conversation UUID (the load effect will restore from snapshot if available)
      setActiveConversationUuid(conversationUuid || null);
      setActiveRemoteSessionId(null);

      // Switch to the historical session — triggers the persistence hook to load snapshot
      sessionCreatedAtRef.current = Date.now();
      setActiveSessionId(sessionId);

      // The resolver only writes the tab→session mapping on its own
      // resolution path, so explicitly switching to a history session
      // would otherwise leave the next reopen pointing at the tab's
      // pre-history session. Persist the alias for the current tab
      // so the user's explicit choice is restored next time.
      if (typeof query.tabId === 'number') {
        void setStorageValue(getTabSessionKey(query.tabId), sessionId);
      }
    },
    [activeSessionId, query.tabId]
  );

  const normalizedModelOptions = useMemo(() => {
    const rawOptions = modelConfig.options;
    const seen = new Set<string>();
    const options: Array<{ value: string; label: string }> = [];

    const pushOption = (value: string, label?: string) => {
      const trimmedValue = value.trim();
      if (!trimmedValue || seen.has(trimmedValue)) return;
      seen.add(trimmedValue);

      // Get base label
      const baseLabel =
        label && label.trim() ? label : getModelDisplayName(trimmedValue, modelConfig);

      // Add mapped model name if configured
      const mappedModelName = getMappedModelName(trimmedValue, modelMapping);

      // If model has a branded label (Deep/Flash), show "Brand (mapped)"
      // If model has no branded label (Sonnet), show just the mapped name
      let finalLabel: string;
      if (mappedModelName) {
        finalLabel = label && label.trim() ? `${baseLabel} (${mappedModelName})` : mappedModelName;
      } else {
        finalLabel = baseLabel;
      }

      options.push({
        value: trimmedValue,
        label: finalLabel
      });
    };

    // 先添加内置的三个模型（Deep, Sonnet, Flash）
    for (const model of BUILT_IN_MODELS) {
      pushOption(model.value, model.label);
    }

    // 然后添加配置中的模型
    if (Array.isArray(rawOptions)) {
      for (const option of rawOptions) {
        if (typeof option === 'string') {
          pushOption(option);
          continue;
        }
        if (option && typeof option === 'object' && typeof option.model === 'string') {
          pushOption(option.model, typeof option.name === 'string' ? option.name : '');
        }
      }
    }

    const defaultModel = typeof modelConfig.default === 'string' ? modelConfig.default : '';
    if (defaultModel) {
      pushOption(defaultModel);
    }
    if (selectedModel) {
      pushOption(selectedModel);
    }

    return options;
  }, [modelConfig, selectedModel, modelMapping]);

  const effectiveSelectedModel =
    selectedModel ||
    (typeof modelConfig.default === 'string' ? modelConfig.default : '') ||
    normalizedModelOptions[0]?.value ||
    DEFAULT_MODEL;

  useEffect(() => {
    if (selectedModel || !effectiveSelectedModel) {
      return;
    }

    setSelectedModel(effectiveSelectedModel);
    void setStorageValue(StorageKeys.SELECTED_MODEL, effectiveSelectedModel);
  }, [effectiveSelectedModel, selectedModel]);

  const handleModelChange = useCallback(
    (nextModel: string) => {
      if (!nextModel) {
        setIsModelMenuOpen(false);
        return;
      }

      if (nextModel === selectedModel) {
        setIsModelMenuOpen(false);
        return;
      }

      void trackEvent('superduck.sidebar.model_switched', {
        from: selectedModel || '',
        to: nextModel
      });

      // If the agent is currently running, abort it so the next request uses the
      // new model. Otherwise the in-flight request would continue with the old
      // model, which is confusing to users who expect the switch to take effect
      // immediately (Issue 7.2/7.3 from UX audit).
      if (effectiveIsAgentRunning) {
        effectiveCancel();
      }

      setSelectedModel(nextModel);
      setIsModelMenuOpen(false);
      void setStorageValue(StorageKeys.SELECTED_MODEL, nextModel);
    },
    [selectedModel, effectiveSelectedModel, effectiveIsAgentRunning, effectiveCancel]
  );

  const openOptionsPage = useCallback(() => {
    setIsHeaderMenuOpen(false);
    setIsLanguageSubmenuOpen(false);
    void chrome.runtime.openOptionsPage();
  }, []);

  const handleLanguageSelection = useCallback(
    (nextLocale: SupportedLocale) => {
      setIsLanguageSubmenuOpen(false);
      setIsHeaderMenuOpen(false);
      if (nextLocale === locale) return;
      if (messages.length > 0) {
        setPendingLocale(nextLocale);
        return;
      }
      void trackEvent('superduck.sidebar.language_changed', {
        from: locale,
        to: nextLocale
      });
      void setLocale(nextLocale);
    },
    [locale, messages.length, setLocale]
  );

  const confirmLocaleChange = useCallback(() => {
    if (!pendingLocale) return;
    const nextLocale = pendingLocale;
    setPendingLocale(null);
    void trackEvent('superduck.sidebar.language_changed', {
      from: locale,
      to: nextLocale
    });
    void (async () => {
      await setLocale(nextLocale);
      clearConversation();
    })();
  }, [clearConversation, locale, pendingLocale, setLocale]);

  const handleConvertToScheduledTask = useCallback(() => {
    if (effectiveIsAgentRunning || isConvertingToTask) return;
    const lastUserPrompt = [...effectiveApiMessages].reverse().find((message) => {
      if (message.role !== 'user') return false;
      const text =
        typeof message.content === 'string'
          ? message.content
          : getTextFromBlockContent(message.content, '');
      return text.trim().length > 0;
    });
    const resolvedLastUserPrompt = lastUserPrompt
      ? typeof lastUserPrompt.content === 'string'
        ? lastUserPrompt.content
        : getTextFromBlockContent(lastUserPrompt.content, '')
      : '';
    const promptToConvert = (resolvedLastUserPrompt || input).trim();
    if (!promptToConvert) {
      setRuntimeError('Nothing to convert yet. Send a message first.');
      setIsHeaderMenuOpen(false);
      setIsLanguageSubmenuOpen(false);
      return;
    }

    setIsConvertingToTask(true);
    setIsHeaderMenuOpen(false);
    setIsLanguageSubmenuOpen(false);
    void (async () => {
      try {
        const taskDraft = {
          id: `prompt_${Date.now()}`,
          command: '',
          prompt: promptToConvert,
          repeatType: 'none',
          skipPermissions: permissionMode === 'skip_all_permission_checks',
          model: effectiveSelectedModel,
          createdAt: Date.now(),
          usageCount: 0
        };
        const response = await chrome.runtime.sendMessage({
          type: 'OPEN_OPTIONS_WITH_TASK',
          task: taskDraft
        });
        if (response && response.success === false) {
          throw new Error(
            typeof response.error === 'string' ? response.error : 'Failed to open task editor.'
          );
        }
      } catch (error) {
        setRuntimeError(`Unable to open task editor: ${getErrorMessage(error)}`);
      } finally {
        setIsConvertingToTask(false);
      }
    })();
  }, [
    effectiveSelectedModel,
    input,
    effectiveIsAgentRunning,
    isConvertingToTask,
    effectiveApiMessages,
    permissionMode
  ]);

  const acceptBrowserControlPermission = useCallback(async () => {
    await setStorageValue(StorageKeys.BROWSER_CONTROL_PERMISSION_ACCEPTED, true);
    setHasBrowserControlPermissionAccepted(true);
    void trackEvent('superduck.sidebar.browser_permission_accepted', {});
    if (pendingPrompt) {
      void effectiveSendPrompt(pendingPrompt.prompt, {
        attachments: pendingPrompt.attachments,
        isAnnotated: pendingPrompt.isAnnotated
      });
      setPendingPrompt(null);
      setInput('');
    }
  }, [pendingPrompt, effectiveSendPrompt]);

  const openMainTabChat = useCallback(async () => {
    if (!secondaryState.mainTabId) return;
    try {
      await chrome.tabs.update(secondaryState.mainTabId, { active: true });
      const tab = await chrome.tabs.get(secondaryState.mainTabId);
      if (tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      await chrome.runtime.sendMessage({
        type: 'open_side_panel',
        tabId: secondaryState.mainTabId
      });
    } catch {
      // ignore
    }
  }, [secondaryState.mainTabId]);

  const closeBlockedSites = useCallback(async () => {
    if (typeof query.tabId !== 'number') return;
    const blockedTabs = blockedTabInfo.blockedTabs.filter((item) => item.tabId !== query.tabId);
    for (const blockedTab of blockedTabs) {
      try {
        await chrome.tabs.remove(blockedTab.tabId);
      } catch {
        // ignore close failures
      }
    }
  }, [blockedTabInfo.blockedTabs, query.tabId]);

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

  const fallbackConfig = selectedModel ? modelConfig.modelFallbacks?.[selectedModel] : undefined;
  const announcementText = announcementConfig.text || '';
  const messageLimitBanner = useMemo(
    () => getMessageLimitBannerState(messageLimit, selectedModel),
    [messageLimit, selectedModel]
  );

  const dismissAnnouncement = useCallback(async () => {
    const announcementId = announcementConfig.id || '';
    setAnnouncementDismissed(true);
    await setStorageValue(StorageKeys.ANNOUNCEMENT_DISMISSED, announcementId);
  }, [announcementConfig.id]);

  const sendRefusalFeedback = useCallback(async () => {
    setRefusalFeedbackSent(true);
    try {
      await chrome.runtime.sendMessage({
        type: 'superduck.chat.feedback',
        category: 'sc/false_positive',
        sentiment: 'negative',
        sessionId: activeSessionId,
        currentModel: selectedModel,
        fallbackModel: fallbackConfig?.fallbackModelName
      });
    } catch {
      // swallow missing listeners
    }
    chrome.tabs.create({
      url: 'https://superduck-ai.github.io/superduck/'
    });
  }, [activeSessionId, fallbackConfig?.fallbackModelName, selectedModel]);

  const handleStartWorkflowRecording = useCallback(async () => {
    setShowWorkflowModeSelectionModal(false);

    void trackEvent('superduck.sidebar.workflow_record_started', {});
    await startRecording(true);
  }, [setShowWorkflowModeSelectionModal, startRecording]);

  const activeBanner = useMemo(() => {
    if (lastStopReason?.reason === 'refusal' && fallbackConfig?.fallbackModelName) {
      return null;
    }
    if (effectiveRuntimeError) return 'error' as const;
    if (lastStopReason?.reason === 'refusal' && !fallbackConfig?.fallbackModelName) {
      return 'refusal' as const;
    }
    if (messageLimitBanner && !messageLimitDismissed) {
      return 'messageLimit' as const;
    }
    if (permissionMode === 'skip_all_permission_checks' && !skipWarningDismissed) {
      return 'highRisk' as const;
    }
    if (showNotificationBanner && notificationsEnabled === undefined) {
      return 'notification' as const;
    }
    if ((announcementConfig.enabled ?? false) && announcementText && !announcementDismissed) {
      return 'announcement' as const;
    }
    return null;
  }, [
    announcementConfig.enabled,
    announcementDismissed,
    announcementText,
    fallbackConfig?.fallbackModelName,
    lastStopReason?.reason,
    messageLimitBanner,
    messageLimitDismissed,
    notificationsEnabled,
    permissionMode,
    effectiveRuntimeError,
    showNotificationBanner,
    skipWarningDismissed
  ]);

  // Compute context window debug info from the last assistant message's usage.
  // - Denominator: real context_length from /v1/models (fallback to CONTEXT_WINDOW)
  // - Cache tokens are intentionally excluded from totalUsed and the UI
  // - input_tokens already represents the cumulative prompt length for that turn,
  //   so no extra summing across messages is needed
  const contextDebugInfo = useMemo(() => {
    if (!debugMode) return null;
    const ctxWindow = serverModelInfo?.contextLength ?? CONTEXT_WINDOW;
    const budget = Math.max(1, ctxWindow - MAX_TOKENS);
    let lastUsage: ApiUsage | null = null;
    for (let i = apiMessages.length - 1; i >= 0; i--) {
      const msg = apiMessages[i];
      if (msg?.role === 'assistant' && msg?.usage) {
        lastUsage = msg.usage;
        break;
      }
    }
    const hasUsage = lastUsage !== null;
    const inputTokens = lastUsage?.input_tokens || 0;
    const outputTokens = lastUsage?.output_tokens || 0;
    const totalUsed = inputTokens + outputTokens;
    const remaining = Math.max(0, budget - totalUsed);
    const percentUsed = Math.round((totalUsed / budget) * 100);
    return {
      hasUsage,
      contextWindow: ctxWindow,
      maxTokens: MAX_TOKENS,
      tokenBudget: budget,
      inputTokens,
      outputTokens,
      totalUsed,
      remaining,
      percentUsed
    };
  }, [debugMode, apiMessages, serverModelInfo]);

  const selectedModelLabel = useMemo(() => {
    return (
      normalizedModelOptions.find((option) => option.value === effectiveSelectedModel)?.label ||
      getModelDisplayName(effectiveSelectedModel, modelConfig)
    );
  }, [normalizedModelOptions, effectiveSelectedModel, modelConfig]);
  const hasChatMessages = effectiveMessages.length > 0;

  if (query.mcpPermissionOnly) {
    return <PermissionPrompt requestId={query.requestId} />;
  }

  if (versionState.isBlocked && versionState.minSupportedVersion) {
    return (
      <VersionBlockedView
        currentVersion={versionState.currentVersion}
        minSupportedVersion={versionState.minSupportedVersion}
      />
    );
  }

  if (secondaryState.isSecondaryTab && secondaryState.mainTabId) {
    return (
      <SecondaryTabView
        mainTabId={secondaryState.mainTabId}
        loading={secondaryState.checking}
        onOpenMain={openMainTabChat}
      />
    );
  }

  if (shouldBlockDomain || hasBlockedSecondaryTabs) {
    const currentCategory =
      blockedTabInfo.blockedTabs.find((item) => item.tabId === query.tabId)?.category ||
      blockedCategory ||
      'category1';
    return (
      <BlockedDomainView
        category={currentCategory}
        isMainTabBlocked={blockedTabInfo.isMainTabBlocked}
        onCloseBlockedSites={closeBlockedSites}
      />
    );
  }

  if (hasBrowserControlPermissionAccepted === false) {
    return <BrowserPermissionGate onAccept={acceptBrowserControlPermission} />;
  }

  if (hasBrowserControlPermissionAccepted === null) {
    return (
      <div className="h-screen bg-bg-100 text-text-300 flex items-center justify-center text-sm">
        Loading sidepanel...
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="h-screen bg-bg-100 text-text-300 flex items-center justify-center text-sm">
        Loading authentication...
      </div>
    );
  }

  if (!effectiveMessagesClient && !hasProviderConfig) {
    return (
      <SetupGate
        authError={authError}
        onRetry={refreshAuth}
        onOpenSettings={() => {
          void openOptionsTo('permissions');
        }}
      />
    );
  }

  const showHighRiskFrame = permissionMode === 'skip_all_permission_checks';

  return (
    <div
      className="relative h-screen bg-bg-100 text-text-100"
      data-theme="superduck"
      style={
        showHighRiskFrame
          ? {
              border: '1.7px dashed #F7CE46',
              borderRadius: '16px',
              boxSizing: 'border-box',
              overflow: 'hidden'
            }
          : undefined
      }
    >
      <div className="relative flex h-full min-h-0 flex-col">
        <SidepanelHeader
          modelMenuRef={modelMenuRef}
          isModelMenuOpen={isModelMenuOpen}
          setIsModelMenuOpen={setIsModelMenuOpen}
          selectedModelLabel={selectedModelLabel}
          normalizedModelOptions={normalizedModelOptions}
          handleModelChange={handleModelChange}
          effectiveSelectedModel={effectiveSelectedModel}
          headerMenuRef={headerMenuRef}
          isHeaderMenuOpen={isHeaderMenuOpen}
          setIsHeaderMenuOpen={setIsHeaderMenuOpen}
          isLanguageSubmenuOpen={isLanguageSubmenuOpen}
          setIsLanguageSubmenuOpen={setIsLanguageSubmenuOpen}
          purlModeFeatureEnabled={purlModeFeatureEnabled}
          isPurlMode={isPurlMode}
          setPurlModeToggle={setPurlModeToggle}
          effectiveIsAgentRunning={effectiveIsAgentRunning}
          clearConversation={clearConversation}
          handleConvertToScheduledTask={handleConvertToScheduledTask}
          isConvertingToTask={isConvertingToTask}
          hasChatMessages={hasChatMessages}
          input={input}
          openOptionsPage={openOptionsPage}
          onShowHistory={() => setShowHistoryPanel(true)}
          SUPPORTED_LOCALES={SUPPORTED_LOCALES}
          LOCALE_DISPLAY_NAMES={LOCALE_DISPLAY_NAMES}
          locale={locale}
          handleLanguageSelection={handleLanguageSelection}
          intl={intl}
          trackEvent={trackEvent}
        />

        {/* Workflow Mode Selection Modal */}
        {showWorkflowModeSelectionModal && (
          <WorkflowModeSelectionModal
            isOpen={showWorkflowModeSelectionModal}
            onVoiceOver={handleStartWorkflowRecording}
            onClose={() => setShowWorkflowModeSelectionModal(false)}
            currentUrl={currentPageUrl}
            pageTitle={currentPageTitle}
            hasMicrophonePermission={hasMicrophonePermission}
          />
        )}

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          <ScrollContainer
            ref={autoScrollRef}
            parentClassName={
              'flex-1 min-h-0 ' + (apiMessages.length === 0 ? '!overflow-hidden' : '')
            }
            innerClassName="h-full"
            pinToBottomConfig={{ disabled: false, initialValue: true }}
          >
            <div className="mx-auto flex size-full max-w-3xl flex-col md:px-2">
              <div className="flex-1 flex flex-col px-4 max-w-3xl mx-auto w-full pt-1">
                {effectiveApiMessages.length === 0 ? (
                  <EmptyState
                    tabId={query.tabId}
                    onPromptClick={(prompt) => {
                      setInput(prompt);
                    }}
                  />
                ) : (
                  <MessageList
                    apiMessages={effectiveApiMessages}
                    streamingTextStore={streamingTextStoreRef.current}
                    isAgentRunning={effectiveIsAgentRunning}
                    scrollRefs={messageListScrollRefs}
                  />
                )}
                <LastMessageSentinel ref={sentinelCallbackRef} />
                <div ref={scrollRefs.extras} className="min-h-8">
                  {(effectiveIsAgentRunning || effectiveIsCompacting) && !permissionPrompt && (
                    <div
                      className={
                        'flex items-center gap-3 ' +
                        (!(effectiveIsAgentRunning || effectiveIsCompacting) ? 'invisible' : '')
                      }
                    >
                      <SuperDuckAvatar
                        state={effectiveIsCompacting ? 'shimmer' : 'thinking'}
                        isInteractive={false}
                        className=""
                      />
                      <div className="text-sm text-text-300 italic font-superduck-response relative inline-block">
                        {(() => {
                          const statusText = effectiveIsCompacting
                            ? intl.formatMessage({
                                id: 'compacting',
                                defaultMessage: 'Compacting...'
                              })
                            : effectiveCurrentStatus ||
                              intl.formatMessage({
                                id: randomStartupKey,
                                defaultMessage: 'Starting up...'
                              });
                          const displayStatusText = stripTrailingEllipsis(statusText);

                          return (
                            <>
                              {displayStatusText}
                              <ThinkingDots />
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
                <AutoScrollSpacer
                  scrollRefs={scrollRefs}
                  autoScrollRef={autoScrollRef}
                  messageCount={apiMessages.length}
                  isStreaming={effectiveIsAgentRunning}
                />
              </div>
              <ChatInputArea
                scrollRefs={scrollRefs}
                autoScrollRef={autoScrollRef}
                inputRef={inputRef}
                sentinelElement={sentinelElement}
                input={input}
                selectedModel={selectedModel}
                permissionMode={permissionMode}
                isChatInputBeamActive={isChatInputBeamActive}
                chatInputSurfaceClass={chatInputSurfaceClass}
                pendingAttachments={pendingAttachments}
                recordingState={recordingState}
                debugMode={debugMode}
                contextDebugInfo={contextDebugInfo}
                setInput={setInput}
                setPermissionMode={setPermissionMode}
                setPreviewAttachmentImage={setPreviewAttachmentImage}
                setShowWorkflowModeSelectionModal={setShowWorkflowModeSelectionModal}
                setPromptToEdit={setPromptToEdit}
                handlePaste={handlePaste}
                submit={submit}
                removeAttachment={removeAttachment}
                handleFileSelection={handleFileSelection}
                captureCurrentTabScreenshot={captureCurrentTabScreenshot}
                effectiveCancel={effectiveCancel}
                sendPrompt={sendPrompt}
                effectiveSendPrompt={sendPrompt}
                insertShortcutChip={insertShortcutChip}
                navigateActiveTabToUrl={navigateActiveTabToUrl}
                activeBanner={activeBanner}
                effectiveRuntimeError={effectiveRuntimeError}
                effectiveClearError={effectiveClearError}
                setRuntimeError={setRuntimeError}
                messageLimitBanner={messageLimitBanner}
                setMessageLimitDismissed={setMessageLimitDismissed}
                setSkipWarningDismissed={setSkipWarningDismissed}
                setNotificationsEnabled={setNotificationsEnabled}
                setShowNotificationBanner={setShowNotificationBanner}
                announcementConfig={announcementConfig}
                dismissAnnouncement={dismissAnnouncement}
                lastStopReason={lastStopReason}
                fallbackConfig={fallbackConfig}
                modelConfig={modelConfig}
                retryWithFallback={retryWithFallback}
                sendRefusalFeedback={sendRefusalFeedback}
                trackEvent={trackEvent}
                effectiveIsAgentRunning={effectiveIsAgentRunning}
                shouldDisableSkipPermissions={shouldDisableSkipPermissions}
                attachmentCount={attachmentCount}
                rotatingTips={rotatingTips}
                permissionModeMenuOptions={permissionModeMenuOptions}
              />
            </div>
          </ScrollContainer>

          {/* Workflow Recording Interface — shown when recording, replaces chat interface */}
          {recordingState.isRecording && (
            <div className="absolute inset-0 z-[5]">
              <WorkflowRecordingInterface
                recordingState={recordingState}
                isSpeechRecording={isSpeechRecording}
                isSpeechSupported={isSpeechSupported}
                hasSpeechPermission={hasSpeechPermissionFromHook}
                currentInterimTranscript={currentInterimTranscript}
                onStop={stopRecording}
                onTogglePause={togglePause}
                onToggleSpeech={toggleSpeechRecording}
                onRemoveStep={removeStep}
                onUpdateStep={updateStep}
                onSave={(steps, summary, workflowTitle) => {
                  // Save the generated prompt. Let the shortcut modal generate its own command name
                  // instead of reusing the recording title or page title.
                  void workflowTitle;
                  void trackEvent('superduck.sidebar.workflow_record_stopped', {
                    step_count: steps.length,
                    saved: true
                  });
                  setPromptToSave({ prompt: summary });
                  stopRecording();
                }}
                createMessage={invokeSessionModel}
                isGeneratingSummary={isGeneratingSummary}
                setIsGeneratingSummary={setIsGeneratingSummary}
                currentUrl={currentPageUrl}
                pageTitle={currentPageTitle}
              />
            </div>
          )}
          {/* Inline permission prompt overlay — matches bundle's absolute bottom-0 positioning */}
          {permissionPrompt && (
            <div className="absolute bottom-0 left-0 right-0 z-[10]">
              <div className="mx-auto max-w-3xl md:px-2">
                <div className="mx-3 md:mx-0 border border-border-300 rounded-[14px] shadow-[0_4px_20px_0_rgba(0,0,0,0.04)] bg-bg-100">
                  <InlinePermissionPrompt
                    prompt={permissionPrompt}
                    onAllow={handlePermissionAllow}
                    onDeny={handlePermissionDeny}
                    disableAlwaysAllow={permissionMode === 'follow_a_plan'}
                  />
                </div>
                <div className="bg-bg-100 h-3" />
              </div>
            </div>
          )}
        </div>

        {pendingLocale ? (
          <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center">
            <div className="w-full max-w-sm rounded-2xl border border-border-300 bg-bg-100 p-4">
              <h3 className="text-base font-medium text-text-100">
                <MemoizedFormattedMessage defaultMessage="Change language" id="change_language" />
              </h3>
              <p className="text-sm text-text-300 mt-4">
                <MemoizedFormattedMessage
                  defaultMessage="Changing the language will start a new chat."
                  id="changing_the_language_will_start_a_new_chat"
                />
              </p>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border border-border-300 text-sm text-text-200 hover:bg-bg-200 transition-colors"
                  onClick={() => setPendingLocale(null)}
                >
                  <MemoizedFormattedMessage defaultMessage="Cancel" id="cancel" />
                </button>
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg bg-text-100 text-bg-100 text-sm hover:bg-text-200 transition-colors"
                  onClick={confirmLocaleChange}
                >
                  <MemoizedFormattedMessage defaultMessage="Continue" id="continue" />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {pairingPrompt ? (
          <div className="fixed inset-0 bg-black/40 p-4 flex items-center justify-center">
            <div className="w-full max-w-md rounded-xl border border-border-300 bg-bg-000 p-4">
              <h3 className="text-base font-medium text-text-100 mb-2">
                <MemoizedFormattedMessage
                  id="wants_to_connect"
                  defaultMessage="{clientLabel} wants to connect"
                  values={{
                    clientLabel: pairingPrompt.clientType.toLowerCase().includes('code')
                      ? 'Code Client'
                      : 'Desktop Client'
                  }}
                />
              </h3>
              <p className="text-sm text-text-300 mb-3">
                <MemoizedFormattedMessage
                  id="name_this_browser_so_you_can_identify_it"
                  defaultMessage="Name this browser so you can identify it later."
                />
              </p>
              <input
                type="text"
                value={pairingName}
                onChange={(event) => setPairingName(event.target.value)}
                placeholder={intl.formatMessage({
                  id: 'eg_work_laptop_personal_chrome',
                  defaultMessage: 'e.g., "Work laptop", "Personal Chrome"'
                })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border-300 bg-bg-100 text-text-100"
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={async () => {
                    await chrome.runtime.sendMessage({
                      type: 'pairing_dismissed',
                      request_id: pairingPrompt.requestId
                    });
                    void trackEvent('superduck.sidebar.pairing_dismissed', {});
                    setPairingPrompt(null);
                    setPairingName('');
                  }}
                  className="px-3 py-2 text-sm rounded-lg border border-border-300 text-text-200"
                >
                  <MemoizedFormattedMessage id="ignore" defaultMessage="Ignore" />
                </button>
                <button
                  type="button"
                  disabled={!pairingName.trim()}
                  onClick={async () => {
                    await chrome.runtime.sendMessage({
                      type: 'pairing_confirmed',
                      request_id: pairingPrompt.requestId,
                      name: pairingName.trim()
                    });
                    void trackEvent('superduck.sidebar.pairing_confirmed', {});
                    setPairingPrompt(null);
                    setPairingName('');
                  }}
                  className="px-3 py-2 text-sm rounded-lg bg-accent-main-100 text-oncolor-100 disabled:opacity-50"
                >
                  <MemoizedFormattedMessage id="connect" defaultMessage="Connect" />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Create Shortcut Modal - shown when promptToSave or promptToEdit is set */}
        {(promptToSave !== null || promptToEdit !== null) && (
          <CreateShortcutModal
            prompt={promptToEdit || promptToSave || undefined}
            currentModel={selectedModel}
            onClose={() => {
              setPromptToSave(null);
              setPromptToEdit(null);
            }}
            onSave={(commandName) => {
              if (promptToSave) {
                // New shortcut saved from recording — show it in input and open command menu
                setPromptToSave(null);
                setInput(`/${commandName}`);
                setShowCommandMenu(true);
                setCommandSearchTerm(commandName);
                setTimeout(() => {
                  if (inputRef.current) {
                    inputRef.current.focus();
                  }
                }, 50);
              } else {
                // Editing existing shortcut — just close the modal
                setPromptToEdit(null);
              }
            }}
            onDelete={() => setPromptToEdit(null)}
            generateName={async (prompt) => {
              try {
                return await generateShortcutName(
                  prompt,
                  invokeSessionModel,
                  intl.locale as SupportedLocale
                );
              } catch (error) {
                return '';
              }
            }}
          />
        )}

        {screenshotPreviewUrl && (
          <ScreenshotLightbox
            imageUrl={screenshotPreviewUrl}
            onClose={() => setScreenshotPreviewUrl(null)}
          />
        )}

        <ImagePreviewModal
          imageUrl={previewAttachmentImage}
          onClose={() => setPreviewAttachmentImage(null)}
        />

        {/* Session history slide-in panel */}
        <SessionHistoryPanel
          isOpen={showHistoryPanel}
          onClose={() => setShowHistoryPanel(false)}
          onLoadSession={handleLoadHistorySession}
          activeSessionId={activeSessionId}
        />
      </div>

      {/* CSS for session history panel animation */}
      <style>{SESSION_HISTORY_PANEL_STYLES}</style>
    </div>
  );
}
