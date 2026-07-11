import React from 'react';
import { SuperDuckAvatar } from '@/sidepanel/components/superDuckAvatar';
import { ModalsLayer } from './ModalsLayer';
import { PermissionOverlay } from './PermissionOverlay';
import { RecordingOverlay } from './RecordingOverlay';
import { SidepanelHeader } from './SidepanelHeader';
import { ChatInputArea } from './ChatInputArea';
import { EmptyState } from '@/sidepanel/components/EmptyState';
import { MessageList } from '../MessageComponents';
import { MessageScroller } from '@/sidepanel/components/MessageScroller';
import { trackEvent } from '../../mcpRuntime';
import { stripTrailingEllipsis, ThinkingDots } from '@/sidepanel/components/StatusDisplay';
import { useSidepanelViewState } from '../contexts/SidepanelViewStateContext';

// All state is read from context (avoid prop drilling and store-sync loops).
export function SidepanelView() {
  const state = useSidepanelViewState();

  const handleStartWorkflowRecording = state.handleStartWorkflowRecording;
  const confirmLocaleChange = state.confirmLocaleChange;
  const invokeSessionModel = state.invokeSessionModel;
  const selectedModel = state.selectedModel;
  const hasMicrophonePermission = state.hasMicrophonePermission;
  const intl = state.intl;
  const autoScrollRef = state.autoScrollRef;
  const apiMessagesLength = state.apiMessages.length;
  const effectiveApiMessages = state.apiMessages;
  const streamingTextStoreRef = state.streamingTextStoreRef;
  const effectiveIsAgentRunning = state.effectiveIsAgentRunning;
  const messageListScrollRefs = state.messageListScrollRefs;
  const sentinelCallbackRef = state.sentinelCallbackRef;
  const scrollRefs = state.scrollRefs;
  const effectiveIsCompacting = state.effectiveIsCompacting;
  const permissionPrompt = state.permissionPrompt;
  const effectiveCurrentStatus = state.effectiveCurrentStatus;
  const randomStartupKey = state.randomStartupKey;
  const queryTabId = state.query.tabId;
  const setPopulatedInputTargetTabId = state.setPopulatedInputTargetTabId;
  const setInput = state.setInput;
  const isSpeechRecording = state.isSpeechRecording;
  const isSpeechSupported = state.isSpeechSupported;
  const hasSpeechPermissionFromHook = state.hasSpeechPermissionFromHook;
  const currentInterimTranscript = state.currentInterimTranscript;
  const stopRecording = state.stopRecording;
  const togglePause = state.togglePause;
  const toggleSpeechRecording = state.toggleSpeechRecording;
  const removeStep = state.removeStep;
  const updateStep = state.updateStep;
  const setPromptToSave = state.setPromptToSave;
  const currentPageUrl = state.currentPageUrl;
  const currentPageTitle = state.currentPageTitle;
  const handlePermissionAllow = state.handlePermissionAllow;
  const handlePermissionDeny = state.handlePermissionDeny;
  const permissionMode = state.permissionMode;
  const recordingState = state.recordingState;

  return (
    <div className="relative h-screen bg-background text-foreground superduck-premium-sidebar">
      <div className="relative flex h-full min-h-0 flex-col">
        <SidepanelHeader />

        <ModalsLayer
          handleStartWorkflowRecording={handleStartWorkflowRecording}
          confirmLocaleChange={confirmLocaleChange}
          invokeSessionModel={invokeSessionModel}
          selectedModel={selectedModel}
          hasMicrophonePermission={hasMicrophonePermission}
          intl={intl}
          trackEvent={trackEvent}
        />

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          {effectiveApiMessages.length === 0 ? (
            <div className="superduck-empty-state-layer absolute inset-x-0 top-0 z-10">
              <EmptyState
                tabId={queryTabId}
                onPromptClick={(prompt) => {
                  setPopulatedInputTargetTabId(undefined);
                  setInput(prompt);
                }}
              />
            </div>
          ) : null}

          <div className="relative min-h-0 flex-1">
            <MessageScroller
              ref={autoScrollRef}
              parentClassName={apiMessagesLength === 0 ? '!overflow-hidden' : ''}
              innerClassName="min-h-full"
              isStreaming={effectiveIsAgentRunning}
              hideScrollButton={!!permissionPrompt || recordingState.isRecording}
              pinToBottomConfig={{ disabled: false, initialValue: true }}
            >
              <div className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col px-4 pt-1 pb-4 md:px-2">
                <div className="flex flex-1 flex-col">
                  {effectiveApiMessages.length > 0 ? (
                    <MessageList
                      apiMessages={effectiveApiMessages}
                      streamingTextStore={streamingTextStoreRef.current}
                      isAgentRunning={effectiveIsAgentRunning}
                      scrollRefs={messageListScrollRefs}
                    />
                  ) : null}
                  <div ref={scrollRefs.extras} className="mt-1 min-h-8 pb-1">
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
                        <div className="relative inline-block font-superduck-response text-sm italic text-muted-foreground dark:text-foreground/72">
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
                  <div
                    ref={sentinelCallbackRef}
                    aria-hidden="true"
                    className="h-px w-full pointer-events-none"
                  />
                </div>
              </div>
            </MessageScroller>
          </div>

          <div
            data-testid="chat-composer-dock"
            className="superduck-composer-dock relative z-40 mx-auto w-full max-w-3xl shrink-0 px-4 pt-1.5 pb-3"
          >
            <ChatInputArea />
          </div>

          {/* Workflow Recording Interface — shown when recording, replaces chat interface */}
          <RecordingOverlay
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
              void workflowTitle;
              void trackEvent('superduck.sidebar.workflow_record_stopped', {
                step_count: steps.length,
                saved: true
              });
              setPromptToSave({ prompt: summary });
              stopRecording();
            }}
            createMessage={invokeSessionModel}
            currentUrl={currentPageUrl}
            pageTitle={currentPageTitle}
          />
          {/* Inline permission prompt overlay — matches bundle's absolute bottom-0 positioning */}
          <PermissionOverlay
            handlePermissionAllow={handlePermissionAllow}
            handlePermissionDeny={handlePermissionDeny}
            permissionMode={permissionMode}
          />
        </div>
      </div>
    </div>
  );
}
