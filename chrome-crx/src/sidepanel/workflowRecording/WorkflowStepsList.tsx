import React, { useRef, useState, useEffect } from 'react';
import { FormattedMessage } from 'react-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Mic } from 'lucide-react';
import { Button, Textarea } from '../../components/ui';
import { ScreenshotPreview } from '@/sidepanel/components/ScreenshotPreview';

export interface WorkflowStep {
  action: 'click' | 'type' | 'navigate' | 'create_tab' | 'narration';
  selector?: string;
  value?: string;
  screenshot?: string;
  description: string;
  url: string;
  tabId?: number;
  elementText?: string;
  elementAttributes?: Record<string, string>;
  timestamp: number;
  viewportDimensions?: { width: number; height: number };
  clickPosition?: { x: number; y: number };
  isEnhancing?: boolean;
  speechTranscript?: string;
  isPending?: boolean;
}

interface WorkflowStepsListProps {
  steps: WorkflowStep[];
  isVisible: boolean;
  onRemoveStep?: (index: number) => void;
  onUpdateStep?: (index: number, updates: Partial<WorkflowStep>) => void;
  onClose?: () => void;
  fullScreen?: boolean;
  currentInterimTranscript?: string;
  isSpeechRecording?: boolean;
}

export function WorkflowStepsList({
  steps,
  isVisible,
  onRemoveStep,
  onUpdateStep,
  onClose,
  fullScreen = false,
  currentInterimTranscript = '',
  isSpeechRecording = false
}: WorkflowStepsListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastStepRef = useRef<HTMLDivElement>(null);
  const interimRef = useRef<HTMLDivElement>(null);
  const [editingDescriptionIndex, setEditingDescriptionIndex] = useState<number | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [editingTranscriptIndex, setEditingTranscriptIndex] = useState<number | null>(null);
  const [transcriptDraft, setTranscriptDraft] = useState('');
  const skipTranscriptCommitRef = useRef(false);

  // Auto-scroll to latest step or interim transcript
  useEffect(() => {
    if (interimRef.current) {
      interimRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    } else if (lastStepRef.current) {
      lastStepRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'end'
      });
    }
  }, [steps.length, currentInterimTranscript]);

  useEffect(() => {
    if (editingDescriptionIndex !== null && !steps[editingDescriptionIndex]) {
      setEditingDescriptionIndex(null);
      setDescriptionDraft('');
    }
  }, [steps, editingDescriptionIndex]);

  useEffect(() => {
    if (editingTranscriptIndex !== null && !steps[editingTranscriptIndex]?.speechTranscript) {
      setEditingTranscriptIndex(null);
      setTranscriptDraft('');
    }
  }, [steps, editingTranscriptIndex]);

  if (!isVisible) return null;

  return (
    <motion.div
      initial={fullScreen ? { opacity: 0 } : { opacity: 0, x: 300 }}
      animate={fullScreen ? { opacity: 1 } : { opacity: 1, x: 0 }}
      exit={fullScreen ? { opacity: 0 } : { opacity: 0, x: 300 }}
      className={
        fullScreen
          ? 'flex flex-col h-full'
          : 'fixed right-0 top-[60px] bottom-0 z-40 w-80 border-l border-border bg-card shadow-xl'
      }
    >
      {/* Header (only in non-fullscreen mode) */}
      {!fullScreen && (
        <div className="flex flex-col border-b border-border">
          <div className="flex items-center justify-between p-4">
            <h3 className="text-sm font-semibold text-foreground">
              <FormattedMessage
                defaultMessage="Steps ({count})"
                id="steps"
                values={{ count: steps.length }}
              />
            </h3>
            {onClose && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                className="hover:bg-secondary"
              >
                <X size={16} />
              </Button>
            )}
          </div>
          {/* Current interim transcript (non-fullscreen) */}
          {isSpeechRecording && currentInterimTranscript && (
            <div className="px-4 pb-3 flex items-start gap-2">
              <Mic size={12} className="text-brand mt-1 flex-shrink-0 animate-pulse" />
              <p className="text-muted-foreground text-xs italic flex-1">
                <FormattedMessage
                  defaultMessage='"{transcript}"'
                  id="label"
                  values={{ transcript: currentInterimTranscript }}
                />
              </p>
            </div>
          )}
        </div>
      )}

      {/* Steps container */}
      <div
        ref={containerRef}
        className={
          fullScreen
            ? 'flex-1 overflow-y-auto p-2'
            : 'overflow-y-auto h-[calc(100%-60px)] overflow-x-hidden'
        }
      >
        <div className={fullScreen ? 'space-y-1 max-w-3xl mx-auto' : 'p-2 space-y-2'}>
          {/* Empty state */}
          {steps.length === 0 && (
            <div
              className={
                fullScreen
                  ? 'py-8 text-center text-sm leading-[1.4] text-muted-foreground'
                  : 'p-4 text-center text-sm leading-[1.4] text-muted-foreground'
              }
            >
              <FormattedMessage
                defaultMessage="Click through your task to record each step"
                id="click_through_your_task_to_record"
              />
            </div>
          )}

          {/* Steps list */}
          {steps.length > 0 && (
            <AnimatePresence>
              {steps.map((step, index) => (
                <motion.div
                  key={step.timestamp}
                  ref={index === steps.length - 1 ? lastStepRef : null}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  className="group relative"
                >
                  <div className="rounded-2xl overflow-hidden transition-all hover:bg-secondary">
                    {/* Step header */}
                    <div className="flex items-start justify-between px-3 py-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        {/* Step number */}
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold leading-[1.4] text-foreground">
                          {index + 1}
                        </span>

                        {/* Step description */}
                        <div className="min-w-0 flex-1 pt-0.5">
                          {editingDescriptionIndex === index ? (
                            <div className="w-full rounded-md bg-muted px-1">
                              <input
                                type="text"
                                value={descriptionDraft}
                                autoFocus
                                onChange={(event) => setDescriptionDraft(event.target.value)}
                                onBlur={() => {
                                  const nextDescription = descriptionDraft.trim();
                                  if (nextDescription) {
                                    onUpdateStep?.(index, { description: nextDescription });
                                  }
                                  setEditingDescriptionIndex(null);
                                  setDescriptionDraft('');
                                }}
                                onKeyDown={(event) => {
                                  if (event.nativeEvent.isComposing) return;
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    const nextDescription = descriptionDraft.trim();
                                    if (nextDescription) {
                                      onUpdateStep?.(index, { description: nextDescription });
                                    }
                                    setEditingDescriptionIndex(null);
                                    setDescriptionDraft('');
                                  }

                                  if (event.key === 'Escape') {
                                    event.preventDefault();
                                    setEditingDescriptionIndex(null);
                                    setDescriptionDraft('');
                                  }
                                }}
                                className="block w-full min-w-0 appearance-none border-0 bg-transparent px-0.5 py-0.5 text-sm leading-6 text-foreground outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                                style={{
                                  boxShadow: 'none',
                                  outline: 'none',
                                  WebkitAppearance: 'none',
                                  appearance: 'none'
                                }}
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (step.isEnhancing || !onUpdateStep) return;
                                setEditingDescriptionIndex(index);
                                setDescriptionDraft(step.description);
                              }}
                              className="-ml-1 block w-full truncate rounded-md px-1 py-0.5 text-left text-sm leading-6 text-foreground transition-colors hover:bg-secondary/70"
                              title={step.description}
                            >
                              {step.isEnhancing ? (
                                <span className="inline-block bg-gradient-to-r from-muted-foreground via-foreground/85 to-muted-foreground bg-clip-text text-transparent animate-shimmertext bg-[length:400%_100%]">
                                  <FormattedMessage defaultMessage="Loading..." id="loading" />
                                </span>
                              ) : (
                                step.description
                              )}
                            </button>
                          )}
                          {step.tabId && (
                            <p className="mt-0.5 text-xs leading-[1.4] text-muted-foreground">
                              <FormattedMessage
                                defaultMessage="Tab {tabId}"
                                id="tab"
                                values={{ tabId: step.tabId }}
                              />
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Remove button */}
                      {onRemoveStep && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onRemoveStep(index)}
                          className="opacity-0 group-hover:opacity-100 hover:bg-secondary !h-6 !w-6"
                        >
                          <Trash2 size={12} />
                        </Button>
                      )}
                    </div>

                    {/* Screenshot with click position */}
                    {step.screenshot && step.clickPosition && (
                      <div className="px-3 pb-3">
                        <div className="relative w-full h-48 overflow-hidden rounded-xl border-[0.5px] border-border">
                          <ScreenshotPreview
                            screenshot={`data:image/jpeg;base64,${step.screenshot}`}
                            coordinates={[step.clickPosition.x, step.clickPosition.y]}
                            viewportDimensions={step.viewportDimensions}
                            zoomLevel={2.5}
                            className="w-full h-full"
                          />
                        </div>
                      </div>
                    )}

                    {/* Speech transcript */}
                    {step.speechTranscript && (
                      <div className="px-3 pb-3">
                        {editingTranscriptIndex === index ? (
                          <div className="relative w-full rounded-lg bg-muted px-3 py-2">
                            <div className="flex items-start gap-2">
                              <Mic
                                size={12}
                                className="text-muted-foreground mt-1.5 flex-shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <Textarea
                                  value={transcriptDraft}
                                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                                    setTranscriptDraft(event.target.value)
                                  }
                                  rows={1}
                                  autoFocus
                                  className="!min-h-0 !overflow-hidden !resize-none !border-transparent !bg-transparent !px-0 !py-0.5 !text-sm !leading-5 shadow-none hover:!border-transparent focus:!border-transparent"
                                  onBlur={() => {
                                    if (skipTranscriptCommitRef.current) {
                                      skipTranscriptCommitRef.current = false;
                                      return;
                                    }

                                    const nextTranscript = transcriptDraft.trim();
                                    if (nextTranscript) {
                                      onUpdateStep?.(index, { speechTranscript: nextTranscript });
                                    }
                                    setEditingTranscriptIndex(null);
                                    setTranscriptDraft('');
                                  }}
                                  onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
                                    if (event.nativeEvent.isComposing) return;
                                    if (event.key === 'Enter' && !event.shiftKey) {
                                      event.preventDefault();
                                      const nextTranscript = transcriptDraft.trim();
                                      if (!nextTranscript) return;
                                      onUpdateStep?.(index, { speechTranscript: nextTranscript });
                                      setEditingTranscriptIndex(null);
                                      setTranscriptDraft('');
                                    }

                                    if (event.key === 'Escape') {
                                      event.preventDefault();
                                      skipTranscriptCommitRef.current = true;
                                      setEditingTranscriptIndex(null);
                                      setTranscriptDraft('');
                                    }
                                  }}
                                  style={{
                                    boxShadow: 'none',
                                    outline: 'none'
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (!onUpdateStep) return;
                              setEditingTranscriptIndex(index);
                              setTranscriptDraft(step.speechTranscript || '');
                            }}
                            className="w-full flex items-start gap-2 px-3 py-2 bg-muted hover:bg-secondary rounded-lg transition-colors text-left"
                          >
                            <span className="mt-0.5">
                              <Mic size={12} className="text-muted-foreground flex-shrink-0" />
                            </span>
                            <span className="block flex-1 truncate text-muted-foreground text-xs italic leading-5">
                              <FormattedMessage
                                defaultMessage='"{transcript}"'
                                id="label"
                                values={{
                                  transcript:
                                    step.speechTranscript.length > 80
                                      ? `${step.speechTranscript.substring(0, 80)}...`
                                      : step.speechTranscript
                                }}
                              />
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}

          {/* Current interim transcript (fullscreen mode) */}
          {fullScreen && isSpeechRecording && (
            <div
              ref={interimRef}
              className="group relative rounded-2xl overflow-hidden transition-all hover:bg-secondary"
            >
              <div className="flex items-start justify-between px-3 py-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold leading-[1.4] text-foreground">
                    {steps.length + 1}
                  </span>
                  <div className="flex-1 pt-0.5">
                    <p className="flex items-center gap-2 text-sm leading-[1.4] text-foreground">
                      {currentInterimTranscript ? (
                        <span className="inline-block bg-gradient-to-r from-muted-foreground via-foreground/85 to-muted-foreground bg-clip-text text-transparent animate-shimmertext bg-[length:400%_100%]">
                          <FormattedMessage
                            defaultMessage='"{transcript}"'
                            id="label"
                            values={{ transcript: currentInterimTranscript }}
                          />
                        </span>
                      ) : (
                        <span className="inline-block bg-gradient-to-r from-muted-foreground via-foreground/85 to-muted-foreground bg-clip-text text-transparent animate-shimmertext bg-[length:400%_100%]">
                          <FormattedMessage defaultMessage="Listening..." id="listening" />
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save button (non-fullscreen mode) */}
      {!fullScreen && steps.length > 0 && (
        <div className="absolute right-0 bottom-0 left-0 border-t border-border bg-card p-4">
          <button className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
            <FormattedMessage
              defaultMessage="Save as Teach SuperDuck"
              id="save_as_teach_superduck"
            />
          </button>
        </div>
      )}
    </motion.div>
  );
}
