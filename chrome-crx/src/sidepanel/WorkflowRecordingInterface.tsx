import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { type SupportedLocale } from './prompts';
import { GlobeIcon } from './icons';
import { Button, TextInput } from '../components/ui';
import { Trash2, Play, Pause, Mic, MicOff, X } from 'lucide-react';
import { WorkflowStepsList, WorkflowStep } from './WorkflowStepsList';
import { Tooltip } from './Tooltip';
import { generateWorkflowSummary, type ModelInvoker } from './sessionPool';

interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  steps: WorkflowStep[];
}

interface WorkflowRecordingInterfaceProps {
  recordingState: RecordingState;
  isSpeechRecording: boolean;
  isSpeechSupported: boolean;
  hasSpeechPermission: boolean;
  currentInterimTranscript?: string;
  onStop: () => void;
  onTogglePause: () => void;
  onToggleSpeech: () => void;
  onRemoveStep: (index: number) => void;
  onUpdateStep: (index: number, updates: Partial<WorkflowStep>) => void;
  onSave: (steps: WorkflowStep[], summary: string, workflowTitle?: string) => void;
  createMessage: ModelInvoker;
  isGeneratingSummary: boolean;
  setIsGeneratingSummary: (value: boolean) => void;
  currentUrl?: string;
  pageTitle?: string;
}

export function WorkflowRecordingInterface({
  recordingState,
  isSpeechRecording,
  isSpeechSupported,
  hasSpeechPermission,
  currentInterimTranscript,
  onStop,
  onTogglePause,
  onToggleSpeech,
  onRemoveStep,
  onUpdateStep,
  onSave,
  createMessage,
  isGeneratingSummary,
  setIsGeneratingSummary,
  currentUrl,
  pageTitle
}: WorkflowRecordingInterfaceProps) {
  const intl = useIntl();
  const [faviconError, setFaviconError] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [hasEditedTitle, setHasEditedTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const previousTitleRef = useRef('');
  const skipTitleCommitRef = useRef(false);

  // Extract domain from URL
  const domain = useMemo(() => {
    if (!currentUrl) return '';
    try {
      return new URL(currentUrl).hostname;
    } catch {
      return '';
    }
  }, [currentUrl]);

  const fallbackTitle =
    pageTitle || domain || intl.formatMessage({ defaultMessage: 'Untitled', id: 'untitled' });
  const [workflowTitle, setWorkflowTitle] = useState(fallbackTitle);

  useEffect(() => {
    if (!hasEditedTitle) {
      setWorkflowTitle(fallbackTitle);
    }
  }, [fallbackTitle, hasEditedTitle]);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  // Get high-quality favicon from active tab
  const [faviconUrl, setFaviconUrl] = useState('');

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.favIconUrl && !tab.favIconUrl.startsWith('chrome://')) {
        setFaviconUrl(tab.favIconUrl);
      } else if (domain) {
        setFaviconUrl(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`);
      }
    });
  }, [domain]);

  const commitWorkflowTitle = useCallback(() => {
    if (skipTitleCommitRef.current) {
      skipTitleCommitRef.current = false;
      return;
    }

    const nextTitle = workflowTitle.trim() || fallbackTitle;
    setWorkflowTitle(nextTitle);
    setHasEditedTitle(nextTitle !== fallbackTitle);
    setIsEditingTitle(false);
  }, [fallbackTitle, workflowTitle]);

  const cancelWorkflowTitleEdit = useCallback(() => {
    skipTitleCommitRef.current = true;
    setWorkflowTitle(previousTitleRef.current || fallbackTitle);
    setIsEditingTitle(false);
  }, [fallbackTitle]);

  // Handle save/done
  const handleSave = useCallback(async () => {
    // Pause recording and mute speech since we're done
    if (!recordingState.isPaused) {
      onTogglePause();
    }
    if (isSpeechRecording) {
      onToggleSpeech();
    }

    setIsGeneratingSummary(true);
    let summary = '';

    if (recordingState.steps.length > 0) {
      try {
        summary = await generateWorkflowSummary(
          recordingState.steps,
          createMessage,
          true,
          intl.locale as SupportedLocale
        );
      } catch (error) {
        console.error('[WorkflowRecording] generateWorkflowSummary failed:', error);
      }

      // Fallback: if AI summary failed or returned empty, use step descriptions as prompt
      if (!summary) {
        console.warn('[WorkflowRecording] Summary is empty, using step descriptions as fallback');
        summary = recordingState.steps
          .map((step, index) => `${index + 1}. ${step.description}`)
          .join('\n');
      }
    }

    setIsGeneratingSummary(false);

    let steps = recordingState.steps;

    // Add interim transcript as final narration if exists
    if (currentInterimTranscript && currentInterimTranscript.trim()) {
      const narrationStep: WorkflowStep = {
        action: 'narration',
        description: intl.formatMessage(
          { id: 'workflow_note', defaultMessage: 'Note: "{text}"' },
          { text: currentInterimTranscript }
        ),
        speechTranscript: currentInterimTranscript,
        timestamp: Date.now(),
        url: ''
      };
      steps = [...steps, narrationStep];
    }

    // Remove screenshots from steps before saving
    const stepsWithoutScreenshots = steps.map((step) => ({
      ...step,
      screenshot: undefined
    }));

    onSave(stepsWithoutScreenshots, summary, workflowTitle.trim() || fallbackTitle);
  }, [
    recordingState.steps,
    recordingState.isPaused,
    isSpeechRecording,
    onTogglePause,
    onToggleSpeech,
    createMessage,
    currentInterimTranscript,
    setIsGeneratingSummary,
    onSave,
    workflowTitle,
    fallbackTitle
  ]);

  return (
    <div className="flex flex-col h-full bg-bg-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-3">
        <div className="flex items-center gap-2">
          {faviconUrl && !faviconError ? (
            <img
              src={faviconUrl}
              className="w-4 h-4"
              alt=""
              onError={() => setFaviconError(true)}
            />
          ) : (
            <GlobeIcon size={16} className="text-text-300" />
          )}
          {isEditingTitle ? (
            <div className="min-w-0 flex-1 max-w-[240px]">
              <TextInput
                ref={titleInputRef}
                size="sm"
                value={workflowTitle}
                onValueChange={setWorkflowTitle}
                onBlur={commitWorkflowTitle}
                onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitWorkflowTitle();
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelWorkflowTitleEdit();
                  }
                }}
                className="!h-8 !rounded-md !border-border-300 !bg-bg-000 !px-2 !text-sm"
                aria-label="Workflow title"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                previousTitleRef.current = workflowTitle;
                setIsEditingTitle(true);
              }}
              className="min-w-0 max-w-[240px] rounded-md px-2 py-1 -mx-2 -my-1 text-left text-text-200 font-base-sm truncate transition-colors hover:bg-bg-300"
              aria-label="Edit workflow title"
            >
              {workflowTitle}
            </button>
          )}
        </div>
        <button
          onClick={onStop}
          className="p-1.5 rounded-md transition-colors text-text-300 hover:bg-bg-300 hover:text-text-100"
          aria-label={intl.formatMessage({ defaultMessage: 'Close', id: 'close' })}
        >
          <X size={12} />
        </button>
      </div>

      {/* Steps List */}
      <div className="flex-1 overflow-y-auto">
        <WorkflowStepsList
          steps={recordingState.steps}
          isVisible={true}
          onRemoveStep={onRemoveStep}
          onUpdateStep={onUpdateStep}
          fullScreen={true}
          currentInterimTranscript={currentInterimTranscript}
          isSpeechRecording={isSpeechRecording}
        />
      </div>

      {/* Control Buttons */}
      <div className="mx-auto mb-3 max-w-3xl w-full px-3">
        <div
          className="bg-bg-000 border-[0.5px] border-border-300 hover:border-border-200 rounded-[14px] relative z-30 transition-colors focus-within:outline-none"
          style={{ boxShadow: '0 4px 20px 0 rgba(0, 0, 0, 0.04)', outline: 'none' }}
        >
          <div className="flex flex-col gap-2 px-3 py-3">
            {/* Action buttons row */}
            <div className="grid grid-cols-3 gap-2">
              {/* Discard button */}
              <Tooltip
                tooltipContent={intl.formatMessage({ defaultMessage: 'Discard', id: 'discard' })}
                side="top"
              >
                <Button
                  variant="secondary"
                  size="default"
                  onClick={() => onStop()}
                  aria-label={intl.formatMessage({ defaultMessage: 'Discard', id: 'discard' })}
                  className="w-full px-0 min-w-0"
                >
                  <Trash2 size={20} />
                </Button>
              </Tooltip>

              {/* Pause/Resume button */}
              <Tooltip
                tooltipContent={
                  recordingState.isPaused
                    ? intl.formatMessage({ defaultMessage: 'Resume', id: 'resume' })
                    : intl.formatMessage({ defaultMessage: 'Pause', id: 'pause' })
                }
                side="top"
              >
                <Button
                  variant="secondary"
                  size="default"
                  onClick={onTogglePause}
                  aria-label={
                    recordingState.isPaused
                      ? intl.formatMessage({ defaultMessage: 'Resume', id: 'resume' })
                      : intl.formatMessage({ defaultMessage: 'Pause', id: 'pause' })
                  }
                  className="w-full px-0 min-w-0"
                >
                  {recordingState.isPaused ? <Play size={20} /> : <Pause size={20} />}
                </Button>
              </Tooltip>

              {/* Voice narration toggle (if supported) */}
              {isSpeechSupported && (
                <Tooltip
                  tooltipContent={
                    isSpeechRecording
                      ? intl.formatMessage({
                          defaultMessage: 'Turn off voice narration',
                          id: 'turn_off_voice_narration'
                        })
                      : hasSpeechPermission
                        ? intl.formatMessage({
                            defaultMessage: 'Turn on voice narration',
                            id: 'turn_on_voice_narration'
                          })
                        : intl.formatMessage({
                            defaultMessage: 'Microphone permission needed',
                            id: 'microphone_permission_needed'
                          })
                  }
                  side="top"
                >
                  <Button
                    variant="secondary"
                    size="default"
                    onClick={onToggleSpeech}
                    aria-label={intl.formatMessage({
                      defaultMessage: 'Toggle voice narration',
                      id: 'toggle_voice_narration'
                    })}
                    className={
                      'w-full px-0 min-w-0 ' +
                      (isSpeechRecording
                        ? 'bg-accent-main-100 text-oncolor-100 border-accent-main-100'
                        : '')
                    }
                  >
                    {isSpeechRecording ? <Mic size={20} /> : <MicOff size={20} />}
                  </Button>
                </Tooltip>
              )}
            </div>

            {/* Done button */}
            <Button
              variant="primary"
              size="default"
              onClick={handleSave}
              disabled={isGeneratingSummary || recordingState.steps.length === 0}
              aria-label={intl.formatMessage({ defaultMessage: 'Done', id: 'done' })}
              className="w-full"
            >
              {isGeneratingSummary ? (
                <FormattedMessage defaultMessage="Generating shortcut..." id="generating_shortcut" />
              ) : (
                <FormattedMessage defaultMessage="Done" id="done" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
