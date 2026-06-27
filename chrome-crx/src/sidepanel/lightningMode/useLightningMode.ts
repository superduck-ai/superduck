import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionManager } from '@/permissions/PermissionManager';
import { withTracing } from '../../observability';
import type { Span } from '@opentelemetry/api';
import { MessagesClient } from '../../mcpServersStore';
import { getModelsConfig } from '../../components/providers/AppProviders';
import type { LightningMessage } from './commands';
import { clearTimings, EMPTY_MESSAGE_HISTORY, NOOP_RETRY, WITHIN_LIMIT_RESULT } from './runtime';
import { LightningConfigController } from './config';
import { buildUserMessage } from './buildUserMessage';
import { prepareApiRequest } from './prepareApiRequest';
import { streamResponse } from './streamResponse';
import { parseCommands } from './parseCommands';
import { executeCommands } from './executeCommands';
import { settleAndScreenshot } from './settleAndScreenshot';
import { recordEvent } from '../../debug';
import { synthesizeToolMessages } from './synthesizeToolMessages';
import { buildLightningSystemPrompt } from './systemPrompt';
import type { LightningSystemPromptBlock, LightningCreateApiMessageParams } from '../types';
import { compactLightningMessagesIfNeeded } from './compaction';
import {
  createLightningApiMessage,
  isFastLightningModel,
  resolveLightningContextWindow as resolveLightningContextWindowForModel,
  resolveLightningProviderId
} from './modelResolution';
import { trackLightningToolCall } from './toolAnalytics';

export interface UseLightningModeProps {
  apiKey: string | null;
  modelRef: React.MutableRefObject<string>;
  tabId: number | null;
  sessionId: string | null;
  currentDomain: string | null;
  currentUrl: string | null;
  onShareRequested: (() => Promise<boolean>) | null;
  permissionMode: string;
  onPermissionRequired?: (result: Record<string, unknown>) => Promise<boolean>;
  permissionManager: PermissionManager;
  serverContextLengthRef: React.MutableRefObject<number>;
  locale?: string;
  enabled?: boolean;
}

export function useLightningMode({
  apiKey,
  modelRef,
  tabId,
  sessionId,
  currentDomain,
  currentUrl,
  onShareRequested,
  permissionMode,
  onPermissionRequired,
  permissionManager,
  locale,
  enabled = true
}: UseLightningModeProps) {
  const [lnMessages, setLnMessages] = useState<LightningMessage[]>([]);
  const [lnIsLoading, setLnIsLoading] = useState(false);
  const [lnIsCompacting, setLnIsCompacting] = useState(false);
  const [lnError, setLnError] = useState<string | null>(null);
  const [lnLastStopReason, setLnLastStopReason] = useState<{
    reason: string;
    messageId?: string;
  } | null>(null);
  const [lnCurrentStatus, setLnCurrentStatus] = useState('');

  const currentDomainRef = useRef(currentDomain);
  currentDomainRef.current = currentDomain;
  const currentUrlRef = useRef(currentUrl);
  currentUrlRef.current = currentUrl;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const planApprovedRef = useRef(false);
  const clientRef = useRef<MessagesClient | null>(null);
  const cancelledRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const systemPromptRef = useRef<LightningSystemPromptBlock[] | null>(null);
  const lnMessagesRef = useRef(lnMessages);
  lnMessagesRef.current = lnMessages;
  const tabContextHashRef = useRef<string | null>(null);

  const purlPromptFeature = '';
  const purlConfigFeature = null;
  const modelsConfigRaw = getModelsConfig();
  const modelsConfigRef = useRef(modelsConfigRaw);
  modelsConfigRef.current = modelsConfigRaw;

  const [config] = useState(() => new LightningConfigController());

  /** Get the effective model (override or main) */
  const getEffectiveModel = useCallback(
    () => config.modelOverride || modelRef.current,
    [modelRef, config]
  );

  /** Check if current model has fast tag */
  const isFastModel = useCallback(() => {
    return isFastLightningModel(getEffectiveModel());
  }, [getEffectiveModel]);

  const resolveProviderIdFor = useCallback(
    async (model: string): Promise<string> => {
      return resolveLightningProviderId(model, modelRef.current);
    },
    [modelRef]
  );

  // Initialize client and load config from storage
  useEffect(() => {
    if (!enabled || !apiKey) return;
    (async () => {
      const baseUrl = await config.load(purlConfigFeature);
      if (apiKey && baseUrl) {
        clientRef.current = new MessagesClient({
          baseURL: baseUrl,
          apiKey,
          dangerouslyAllowBrowser: true
        });
      }
    })();
  }, [enabled, apiKey, purlConfigFeature, config]);

  /** Build the system prompt — bundle's se callback */
  const buildSystemPrompt = useCallback(async () => {
    if (!enabled || !tabId) return;
    systemPromptRef.current = await buildLightningSystemPrompt({
      purlConfigFeature,
      purlPromptFeature,
      getEffectiveModel,
      modelsConfig: modelsConfigRef.current
    });
  }, [enabled, tabId, getEffectiveModel, purlPromptFeature, purlConfigFeature]);

  // Rebuild system prompt when dependencies change
  useEffect(() => {
    buildSystemPrompt();
  }, [buildSystemPrompt]);

  // Listen for PURL_CONFIG storage changes
  useEffect(() => {
    if (!enabled) return;
    config.startStorageListener(() => buildSystemPrompt());
    return () => config.stopStorageListener();
  }, [enabled, buildSystemPrompt, config]);

  /** Create API message (non-streaming, for external callers). */
  const createApiMessage = useCallback(
    async (params: LightningCreateApiMessageParams) => {
      if (!clientRef.current) throw new Error('Client not initialized');
      return createLightningApiMessage({
        client: clientRef.current,
        params,
        effectiveModel: getEffectiveModel(),
        fallbackModel: modelRef.current
      });
    },
    [getEffectiveModel, modelRef]
  );

  const resolveLightningContextWindow = useCallback(async (): Promise<number> => {
    return resolveLightningContextWindowForModel({
      effectiveModel: getEffectiveModel(),
      fallbackModel: modelRef.current
    });
  }, [getEffectiveModel, modelRef]);

  const maybeCompactLightningMessages = useCallback(
    async (messages: LightningMessage[]): Promise<LightningMessage[]> => {
      return compactLightningMessagesIfNeeded({
        messages,
        createApiMessage,
        locale,
        resolveContextWindow: resolveLightningContextWindow,
        setIsCompacting: setLnIsCompacting
      });
    },
    [createApiMessage, locale, resolveLightningContextWindow]
  );

  /** Track analytics event — bundle's i function inside oe */
  const trackToolCall = useCallback(
    (toolName: string, success: boolean, extra?: Record<string, unknown>) => {
      trackLightningToolCall({
        toolName,
        success,
        extra,
        sessionId: sessionIdRef.current,
        permissionMode,
        currentDomain: currentDomainRef.current,
        currentUrl: currentUrlRef.current
      });
    },
    [permissionMode]
  );

  /** Main sendMessage callback — bundle's oe */
  const sendMessage = useCallback(
    async (
      message: string,
      attachments: Array<{ base64: string; mediaType: string }> | undefined,
      _systemPromptOverride: unknown,
      _isContinue: boolean
    ) => {
      const client = clientRef.current;
      const systemPrompt = systemPromptRef.current;
      if (!client || !systemPrompt) {
        setLnError('Chat session not initialized. Check your connection.');
        return;
      }

      setLnIsLoading(true);
      setLnError(null);
      cancelledRef.current = false;

      // In plan mode: reset plan approved state if it's not a continue
      if (permissionMode === 'follow_a_plan' && !_isContinue) {
        planApprovedRef.current = false;
        permissionManager.clearTurnApprovedDomains();
      }

      try {
        const built = await buildUserMessage({
          message,
          attachments,
          tabId,
          config,
          permissionMode,
          planApprovedRef,
          maybeCompactLightningMessages,
          lnMessagesRef,
          setLnMessages,
          cancelledRef,
          tabContextHashRef
        });
        if (!built) return;
        const { allMessages } = built;
        if (tabId == null) {
          setLnError('No active tab. Cannot execute commands.');
          return;
        }
        let activeTabId = tabId;
        let continueLoop = true;
        let iterationCount = 0;

        while (continueLoop && !cancelledRef.current) {
          continueLoop = false;
          iterationCount++;
          const iterationStart = performance.now();
          const lightningIterationId =
            (globalThis.crypto?.randomUUID?.() as string) ??
            `lit-${iterationCount}-${Date.now().toString(36)}`;
          recordEvent({
            domain: 'lightning',
            event: 'lightning.iteration.start',
            ids: { lightningIterationId, tabId: activeTabId },
            data: { iterationCount, model: getEffectiveModel() }
          });

          abortControllerRef.current = new AbortController();

          await withTracing(`lightning_iteration_${iterationCount}`, async (span: Span) => {
            span.setAttribute('iteration', iterationCount);
            span.setAttribute('model', getEffectiveModel());

            const phases = {
              ttfbMs: 0,
              streamingMs: 0,
              commandExecutionMs: 0,
              pageSettleMs: 0,
              screenshotMs: 0
            };

            const { stream } = await prepareApiRequest({
              allMessages,
              setLnMessages,
              config,
              systemPrompt,
              client,
              modelsConfigRef,
              abortControllerRef,
              span,
              getEffectiveModel,
              isFastModel,
              resolveProviderIdFor
            });

            const streamResult = await streamResponse({
              stream,
              allMessages,
              setLnMessages,
              setLnLastStopReason,
              cancelledRef,
              span,
              phases
            });
            if (!streamResult) return;
            const { fullText } = streamResult;

            const parseResult = await parseCommands({
              fullText,
              allMessages,
              setLnMessages,
              setLnCurrentStatus,
              permissionMode,
              planApprovedRef,
              activeTabId,
              span,
              iterationStart,
              phases
            });
            if (parseResult.shouldReturn) {
              continueLoop = parseResult.continueLoop;
              return;
            }
            activeTabId = parseResult.activeTabId;
            const { commands, stError, stIndex, didSwitchTab } = parseResult;

            const execResult = await executeCommands({
              commands,
              stError,
              stIndex,
              activeTabId,
              pageType: parseResult.pageType,
              permissionMode,
              planApprovedRef,
              cancelledRef,
              onPermissionRequired,
              permissionManager,
              trackToolCall,
              span,
              phases
            });
            if (execResult.shouldReturn) return;
            const { cmdResults, commandCount } = execResult;

            const { screenshotBase64, screenshotWidth, screenshotHeight } =
              await settleAndScreenshot({
                commands,
                didSwitchTab,
                activeTabId,
                span,
                phases,
                config
              });

            const synthesizeResult = await synthesizeToolMessages({
              cmdResults,
              screenshotBase64,
              screenshotWidth,
              screenshotHeight,
              allMessages,
              setLnMessages,
              config,
              activeTabId,
              tabContextHashRef,
              iterationStart,
              phases,
              commandCount,
              didSwitchTab,
              maybeCompactLightningMessages,
              cancelledRef
            });
            if (synthesizeResult.shouldReturn) return;
            continueLoop = synthesizeResult.continueLoop;
          });
        }
      } catch (err) {
        if (cancelledRef.current) return;
        const errMsg = err instanceof Error ? err.message : 'An unexpected error occurred.';
        if (errMsg.toLowerCase().includes('extra usage is required for fast mode')) {
          setLnError(
            'Extra usage must be enabled to use this model in quick mode. Open superduck-ai.github.io/superduck/ to enable it.'
          );
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const id = tabs[0]?.id;
            if (id) chrome.tabs.update(id, { url: 'https://superduck-ai.github.io/superduck/' });
          });
        } else {
          setLnError(errMsg);
        }
      } finally {
        abortControllerRef.current = null;
        // Remove trailing empty assistant messages
        const currentMsgs = lnMessagesRef.current;
        const lastMsg = currentMsgs[currentMsgs.length - 1];
        if (
          lastMsg &&
          'role' in lastMsg &&
          lastMsg.role === 'assistant' &&
          Array.isArray(lastMsg.content) &&
          lastMsg.content.length === 1 &&
          lastMsg.content[0].type === 'text' &&
          lastMsg.content[0].text === ''
        ) {
          setLnMessages(currentMsgs.slice(0, -1));
        }
        setLnIsLoading(false);
        setLnCurrentStatus('');
      }
    },
    [
      tabId,
      onShareRequested,
      getEffectiveModel,
      isFastModel,
      resolveProviderIdFor,
      permissionMode,
      onPermissionRequired,
      permissionManager,
      trackToolCall
    ]
  );

  /** Cancel the current operation — bundle's ae */
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    planApprovedRef.current = false;
    setLnIsCompacting(false);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLnIsLoading(false);
    setLnCurrentStatus('');
  }, []);

  /** Clear messages and reset state — bundle's le */
  const clearMessages = useCallback(async () => {
    setLnMessages([]);
    setLnError(null);
    setLnLastStopReason(null);
    setLnCurrentStatus('');
    planApprovedRef.current = false;
    clearTimings();
    await permissionManager.clearOncePermissions();
    permissionManager.clearTurnApprovedDomains();
    await buildSystemPrompt();
  }, [buildSystemPrompt, permissionManager]);

  /** Clear error — bundle's he */
  const clearError = useCallback(() => {
    setLnError(null);
  }, []);

  if (!enabled) return null;

  return {
    messages: lnMessages,
    messageHistory: EMPTY_MESSAGE_HISTORY,
    sendMessage,
    retryLastMessage: NOOP_RETRY,
    cancel,
    clearMessages,
    clearError,
    isLoading: lnIsLoading,
    isInitializing: false,
    hasInteractiveTools: false,
    isCompacting: lnIsCompacting,
    error: lnError,
    messageLimit: WITHIN_LIMIT_RESULT,
    setMessages: setLnMessages,
    tokensSaved: null,
    createApiMessage,
    lastStopReason: lnLastStopReason,
    currentStatus: lnCurrentStatus,
    conversationUuid: null
  };
}
