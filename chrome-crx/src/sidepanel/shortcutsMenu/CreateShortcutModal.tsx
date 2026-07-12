import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { X, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button, ErrorMessage, Input, Label, Textarea, Switch } from '../../components/ui';
import { SchedulingFields } from '../../components/scheduling/SchedulingFields';
import { getTodayLocalDateString } from '../../utils/date';
import type { NewSavedPrompt, PromptType } from '../../extensionServices';
import { type EditableSavedPrompt, type PromptToSave } from './createShortcutHelpers';
import { useScheduleConfig } from './useScheduleConfig';

interface CreateShortcutModalProps {
  prompt?: EditableSavedPrompt | PromptToSave;
  onClose: () => void;
  onSave: (commandName: string) => void;
  onDelete?: () => void;
  generateName?: (prompt: string) => Promise<string>;
  currentModel: string;
}

export function CreateShortcutModal({
  prompt,
  onClose,
  onSave,
  onDelete,
  generateName,
  currentModel
}: CreateShortcutModalProps) {
  const intl = useIntl();

  // Check if editing existing prompt
  const isEditing = !!(prompt && 'id' in prompt);
  const existingPrompt = isEditing ? (prompt as EditableSavedPrompt) : null;
  const pendingPrompt = !isEditing && prompt ? (prompt as PromptToSave) : null;

  // Form state
  const initialPromptText = existingPrompt?.prompt || pendingPrompt?.prompt || '';
  const initialCommand = existingPrompt?.command || pendingPrompt?.command || '';

  const [commandName, setCommandName] = useState(initialCommand);
  const [promptText, setPromptText] = useState(initialPromptText);
  const promptType: PromptType = existingPrompt?.type || 'shortcut';
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isGeneratingName, setIsGeneratingName] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const hasFocusedRef = useRef(false);
  const hasGeneratedNameRef = useRef(false);

  const [url, setUrl] = useState(existingPrompt?.url || '');

  const initialSpecificDate = (() => {
    const date = existingPrompt?.specificDate;
    if (!date) return pendingPrompt?.scheduleEnabled ? getTodayLocalDateString() : '';
    return date >= getTodayLocalDateString() ? date : '';
  })();
  const {
    scheduleEnabled,
    setScheduleEnabled,
    repeatType,
    setRepeatType,
    specificTime,
    setSpecificTime,
    dayOfWeek,
    setDayOfWeek,
    dayOfMonth,
    setDayOfMonth,
    month,
    setMonth,
    day,
    setDay,
    specificDate,
    setSpecificDate,
    model,
    setModel,
    monthLabels,
    daysOfWeekLabels,
    schedulingModelOptions,
    buildConfig
  } = useScheduleConfig({
    initialSchedule: {
      repeatType:
        existingPrompt?.repeatType || (pendingPrompt?.scheduleEnabled ? 'once' : undefined),
      specificTime: existingPrompt?.specificTime,
      dayOfWeek: existingPrompt?.dayOfWeek,
      dayOfMonth: existingPrompt?.dayOfMonth,
      monthAndDay: existingPrompt?.monthAndDay,
      specificDate: initialSpecificDate,
      model: existingPrompt?.model
    },
    currentModel,
    intl
  });

  const urlErrorMessage = useMemo(() => {
    const trimmedUrl = url.trim();

    if (promptType === 'module' && !trimmedUrl) {
      return intl.formatMessage({
        defaultMessage: 'Destination URL is required for module shortcuts',
        id: 'module_url_required'
      });
    }

    if (!trimmedUrl) {
      return '';
    }

    try {
      const parsedUrl = new URL(trimmedUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return intl.formatMessage({
          defaultMessage: 'URL must start with http:// or https://',
          id: 'module_url_protocol'
        });
      }
    } catch {
      return intl.formatMessage({
        defaultMessage: 'Invalid URL format',
        id: 'invalid_url_format'
      });
    }

    return '';
  }, [intl, promptType, url]);

  const urlFieldLabel =
    promptType === 'module'
      ? intl.formatMessage({
          defaultMessage: 'Destination URL',
          id: 'destination_url'
        })
      : intl.formatMessage({
          defaultMessage: 'Start from',
          id: 'start_from'
        });

  // Auto-generate name when modal opens
  const generateShortcutName = useCallback(async () => {
    if (promptText && generateName && !isEditing && !hasGeneratedNameRef.current) {
      setIsGeneratingName(true);
      hasGeneratedNameRef.current = true;

      try {
        const generatedName = await generateName(promptText);
        if (generatedName && !commandName) {
          setCommandName(generatedName);
        }
      } catch (error) {
        console.error('Failed to generate name:', error);
      } finally {
        setIsGeneratingName(false);

        // Focus name input after generation
        if (!hasFocusedRef.current) {
          setTimeout(() => {
            nameInputRef.current?.focus();
            nameInputRef.current?.select();
            hasFocusedRef.current = true;
          }, 100);
        }
      }
    }
  }, [promptText, generateName, commandName, isEditing]);

  // Open animation and auto-generate name
  useEffect(() => {
    setTimeout(() => {
      setIsOpen(true);
    }, 10);

    if (!isEditing && !initialCommand && initialPromptText && generateName) {
      generateShortcutName();
    } else if (!hasFocusedRef.current) {
      setTimeout(() => {
        nameInputRef.current?.focus();
        hasFocusedRef.current = true;
      }, 50);
    }

    // Get current tab URL if creating new shortcut
    if (!isEditing) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.url) {
          try {
            const tabUrl = tabs[0].url;
            if (tabUrl && tabUrl.startsWith('http')) {
              setUrl(tabUrl);
            }
          } catch {
            // Ignore
          }
        }
      });
    }
  }, [isEditing, initialCommand, initialPromptText, generateName, generateShortcutName]);

  // Close more menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };

    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMoreMenu]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 200);
  }, [onClose]);

  const handleSave = useCallback(async () => {
    setHasAttemptedSubmit(true);

    if (commandName.trim() && promptText.trim()) {
      if (urlErrorMessage) {
        return;
      }

      setIsSaving(true);
      setErrorMessage('');

      try {
        // Import PromptService dynamically
        const { PromptService } = await import('../../extensionServices');
        const scheduleConfig = buildConfig();

        if (isEditing && existingPrompt) {
          // Update existing prompt
          const updates: Partial<EditableSavedPrompt> = {
            prompt: promptText.trim(),
            command: commandName.trim(),
            type: promptType,
            url: url.trim() || undefined
          };

          if (scheduleConfig) {
            updates.repeatType = scheduleConfig.repeatType;
            updates.specificTime = scheduleConfig.specificTime;
            updates.model = scheduleConfig.model;
            updates.specificDate = scheduleConfig.specificDate;
            updates.dayOfWeek = scheduleConfig.dayOfWeek;
            updates.dayOfMonth = scheduleConfig.dayOfMonth;
            updates.monthAndDay = scheduleConfig.monthAndDay;
          } else {
            updates.repeatType = 'none';
            updates.specificTime = undefined;
            updates.dayOfWeek = undefined;
            updates.dayOfMonth = undefined;
            updates.monthAndDay = undefined;
            updates.specificDate = undefined;
            updates.model = undefined;
          }

          await PromptService.updatePrompt(existingPrompt.id, updates);
          window.dispatchEvent(new Event('prompts-changed'));
        } else {
          // Create new prompt
          const newPrompt: NewSavedPrompt = {
            prompt: promptText.trim(),
            command: commandName.trim(),
            type: promptType,
            url: url.trim() || undefined,
            createdAt: Date.now(),
            usageCount: 0
          };

          if (scheduleConfig) {
            newPrompt.repeatType = scheduleConfig.repeatType;
            newPrompt.specificTime = scheduleConfig.specificTime;
            newPrompt.model = scheduleConfig.model;
            newPrompt.specificDate = scheduleConfig.specificDate;
            newPrompt.dayOfWeek = scheduleConfig.dayOfWeek;
            newPrompt.dayOfMonth = scheduleConfig.dayOfMonth;
            newPrompt.monthAndDay = scheduleConfig.monthAndDay;
          }

          await PromptService.savePrompt(newPrompt);
          window.dispatchEvent(new Event('prompts-changed'));
        }

        onSave(commandName.trim());
        handleClose();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to save');
        setIsSaving(false);
      }
    }
  }, [
    commandName,
    promptText,
    promptType,
    urlErrorMessage,
    isEditing,
    existingPrompt,
    url,
    onSave,
    handleClose,
    buildConfig
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'Enter') {
        const target = document.activeElement;
        if (
          target?.tagName !== 'INPUT' &&
          target?.tagName !== 'TEXTAREA' &&
          !isSaving &&
          !isDeleting
        ) {
          e.preventDefault();
          handleSave();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, handleSave, isSaving, isDeleting]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${
          isOpen && !isClosing ? 'bg-black/20' : 'bg-black/0'
        }`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={`fixed right-0 bottom-0 left-0 z-50 rounded-t-2xl border-t border-border bg-popover text-popover-foreground shadow-xl transition-transform duration-200 ease-out ${
          isOpen && !isClosing ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="px-4 pb-4 pt-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-foreground">
              {isEditing ? (
                <FormattedMessage defaultMessage="Edit shortcut" id="edit_shortcut" />
              ) : (
                <FormattedMessage defaultMessage="Create shortcut" id="create_shortcut" />
              )}
            </h3>

            <div className="flex items-center gap-2">
              {/* More menu (only for editing) */}
              {isEditing && (
                <div className="relative" ref={moreMenuRef}>
                  <button
                    onClick={() => setShowMoreMenu(!showMoreMenu)}
                    className="p-1 hover:bg-secondary rounded transition-colors"
                    aria-label={intl.formatMessage({
                      defaultMessage: 'More options',
                      id: 'more_options'
                    })}
                  >
                    <MoreHorizontal size={16} className="text-muted-foreground" />
                  </button>

                  {showMoreMenu && (
                    <div className="absolute top-full right-0 z-50 mt-2 min-w-[120px] rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-md backdrop-blur-xl">
                      <button
                        onClick={async () => {
                          setShowMoreMenu(false);
                          if (isEditing && existingPrompt) {
                            setIsDeleting(true);
                            try {
                              const { PromptService } = await import('../../extensionServices');
                              await PromptService.deletePrompt(existingPrompt.id);
                              window.dispatchEvent(new Event('prompts-changed'));
                              onDelete?.();
                              handleClose();
                            } catch (error) {
                              setErrorMessage(
                                error instanceof Error ? error.message : 'Failed to delete prompt'
                              );
                              setIsDeleting(false);
                            }
                          }
                        }}
                        disabled={isDeleting}
                        className="w-full px-2 py-2 text-left rounded-lg hover:bg-secondary flex items-center gap-2 text-destructive hover:text-destructive transition-colors"
                      >
                        {isDeleting ? (
                          <div className="w-4 h-4 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                        <span className="text-sm">
                          <FormattedMessage defaultMessage="Delete" id="delete" />
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Close button */}
              <button
                onClick={handleClose}
                className="p-1 hover:bg-secondary rounded transition-colors"
                aria-label={intl.formatMessage({ defaultMessage: 'Close', id: 'close' })}
              >
                <X size={16} className="text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-4">
            {/* Name field */}
            <div className="relative">
              <Label htmlFor="shortcut-command-name" className="mb-1.5">
                <FormattedMessage defaultMessage="Name" id="name" />
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  /
                </span>
                <Input
                  ref={nameInputRef}
                  id="shortcut-command-name"
                  type="text"
                  value={commandName}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    // Allow Chinese characters, letters, numbers, hyphens, and underscores
                    // Replace spaces with hyphens
                    const sanitized = event.target.value
                      .replace(/\s/g, '-')
                      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9-_]/g, '');
                    setCommandName(sanitized);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder={
                    isGeneratingName
                      ? ''
                      : intl.formatMessage({
                          defaultMessage: 'e.g., summarize',
                          id: 'eg_summarize'
                        })
                  }
                  disabled={isGeneratingName}
                  className="w-full pl-7 text-sm"
                  aria-invalid={
                    (hasAttemptedSubmit && !commandName.trim()) ||
                    errorMessage?.includes('already in use')
                  }
                />
              </div>

              {/* Error message */}
              {((hasAttemptedSubmit && !commandName.trim()) ||
                errorMessage?.includes('already in use')) && (
                <ErrorMessage className="mt-1">
                  {hasAttemptedSubmit && !commandName.trim() ? (
                    <FormattedMessage defaultMessage="Name is required" id="name_is_required" />
                  ) : (
                    errorMessage
                  )}
                </ErrorMessage>
              )}

              {/* Generating shimmer */}
              {isGeneratingName && !commandName && (
                <div className="absolute left-[24px] top-[31px] pointer-events-none">
                  <span
                    className="text-[14px] relative inline-block"
                    style={{
                      color: 'transparent',
                      background:
                        'linear-gradient(90deg, #9ca3af 0%, #9ca3af 35%, #6b7280 50%, #9ca3af 65%, #9ca3af 100%)',
                      backgroundSize: '200% 100%',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      animation: 'shimmerSweep 2s ease-in-out infinite'
                    }}
                  >
                    <FormattedMessage defaultMessage="Generating..." id="generating" />
                  </span>
                  <style>{`
                    @keyframes shimmerSweep {
                      0% { background-position: 200% 0; }
                      100% { background-position: -200% 0; }
                    }
                  `}</style>
                </div>
              )}
            </div>

            {/* Prompt field */}
            <Label htmlFor="shortcut-prompt" className="mb-1.5">
              <FormattedMessage defaultMessage="Prompt" id="prompt" />
            </Label>
            <Textarea
              id="shortcut-prompt"
              required
              value={promptText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setPromptText(e.target.value)
              }
              className="min-h-32 max-h-64 overflow-y-auto text-sm"
              placeholder={intl.formatMessage({
                defaultMessage: 'Enter your prompt text...',
                id: 'enter_your_prompt_text'
              })}
              aria-invalid={hasAttemptedSubmit && !promptText.trim()}
            />
            {hasAttemptedSubmit && !promptText.trim() && (
              <ErrorMessage className="mt-1">
                <FormattedMessage defaultMessage="Prompt is required" id="prompt_is_required" />
              </ErrorMessage>
            )}
            <div>
              <Label htmlFor="shortcut-url" className="mb-1.5">
                {urlFieldLabel}
              </Label>
              <Input
                id="shortcut-url"
                type="url"
                value={url}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setUrl(event.target.value)
                }
                placeholder="https://example.com"
                className="w-full text-sm"
                aria-invalid={hasAttemptedSubmit && !!urlErrorMessage}
              />
              {hasAttemptedSubmit && urlErrorMessage && (
                <ErrorMessage className="mt-1">{urlErrorMessage}</ErrorMessage>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="shortcut-schedule-toggle" className="mb-0 text-sm">
                    <FormattedMessage defaultMessage="Schedule" id="schedule" />
                  </Label>
                  <Switch
                    id="shortcut-schedule-toggle"
                    checked={scheduleEnabled}
                    onCheckedChange={setScheduleEnabled}
                  />
                </div>
              </div>
              {scheduleEnabled && (
                <SchedulingFields
                  scheduleEnabled={scheduleEnabled}
                  setScheduleEnabled={setScheduleEnabled}
                  repeatType={repeatType}
                  setRepeatType={setRepeatType}
                  specificDate={specificDate}
                  setSpecificDate={setSpecificDate}
                  dayOfWeek={dayOfWeek}
                  setDayOfWeek={setDayOfWeek}
                  dayOfMonth={dayOfMonth}
                  setDayOfMonth={setDayOfMonth}
                  month={month}
                  setMonth={setMonth}
                  day={day}
                  setDay={setDay}
                  specificTime={specificTime}
                  setSpecificTime={setSpecificTime}
                  monthLabels={monthLabels}
                  daysOfWeekLabels={daysOfWeekLabels}
                  url={url}
                  setUrl={setUrl}
                  urlError=""
                  model={model}
                  setModel={setModel}
                  availableModels={schedulingModelOptions}
                  compact
                />
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-6">
            <Button onClick={handleClose} variant="secondary">
              <FormattedMessage defaultMessage="Cancel" id="cancel" />
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isEditing ? (
                <FormattedMessage defaultMessage="Save changes" id="save_changes" />
              ) : (
                <FormattedMessage defaultMessage="Create shortcut" id="create_shortcut" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
