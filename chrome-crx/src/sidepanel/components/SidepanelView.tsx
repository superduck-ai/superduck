import React from 'react';
import { SuperDuckAvatar } from '@/sidepanel/components/superDuckAvatar';
import { ModalsLayer } from './ModalsLayer';
import { PermissionOverlay } from './PermissionOverlay';
import { RecordingOverlay } from './RecordingOverlay';
import { SidepanelHeader } from './SidepanelHeader';
import { ChatInputArea } from './ChatInputArea';
import { SessionHistoryPanel, SESSION_HISTORY_PANEL_STYLES } from '../session/SessionHistoryPanel';
import { EmptyState } from '@/sidepanel/components/EmptyState';
import { MessageList } from '../MessageComponents';
import { ScrollContainer } from '@/sidepanel/components/ScrollContainer';
import { trackEvent } from '../../mcpRuntime';
import { stripTrailingEllipsis, ThinkingDots } from '@/sidepanel/components/StatusDisplay';
import { AutoScrollSpacer, LastMessageSentinel } from '@/sidepanel/components/AutoScrollSpacer';
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
  const showHistoryPanel = state.showHistoryPanel;
  const setShowHistoryPanel = state.setShowHistoryPanel;
  const handleLoadHistorySession = state.handleLoadHistorySession;
  const activeSessionId = state.activeSessionId;
  const showHighRiskFrame = state.showHighRiskFrame;
  const recordingState = state.recordingState;

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
          <ScrollContainer
            ref={autoScrollRef}
            parentClassName={
              'flex-1 min-h-0 ' + (apiMessagesLength === 0 ? '!overflow-hidden' : '')
            }
            innerClassName="h-full"
            pinToBottomConfig={{ disabled: false, initialValue: true }}
          >
            <div className="mx-auto flex size-full max-w-3xl flex-col md:px-2">
              <div className="flex-1 flex flex-col px-4 max-w-3xl mx-auto w-full pt-1">
                {effectiveApiMessages.length === 0 ? (
                  <EmptyState
                    tabId={queryTabId}
                    onPromptClick={(prompt) => {
                      setPopulatedInputTargetTabId(undefined);
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
                  messageCount={apiMessagesLength}
                  isStreaming={effectiveIsAgentRunning}
                />
              </div>
              <ChatInputArea />
            </div>
          </ScrollContainer>

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
