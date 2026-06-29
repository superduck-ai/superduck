import { useState, useEffect, useRef } from 'react';
import { useIntl, FormattedMessage } from 'react-intl';
import { Button, Modal, ModalFooter, TextInput, ErrorMessage, TextArea } from '../ui';
import { SchedulingFields } from '../scheduling/SchedulingFields';
import { PromptService, type NewSavedPrompt, type SavedPrompt } from '../../extensionServices';
import { getRunShortcutSvgMarkup } from './icons';
import { useScheduleConfig } from '../../sidepanel/shortcutsMenu/useScheduleConfig';

export function EditPromptModal({
  prompt: editingPrompt,
  onClose,
  onSave
}: {
  prompt: SavedPrompt | null;
  onClose: () => void;
  onSave: (isUpdate: boolean) => void;
}) {
  const intl = useIntl();
  const [command, setCommand] = useState(editingPrompt?.command || '');
  const [promptText, setPromptText] = useState(editingPrompt?.prompt || '');
  const [error, setError] = useState('');
  const [urlError, setUrlError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const isNew = !editingPrompt?.id;
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [url, setUrl] = useState(editingPrompt?.url || '');

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
      repeatType: editingPrompt?.repeatType,
      specificTime: editingPrompt?.specificTime,
      dayOfWeek: editingPrompt?.dayOfWeek,
      dayOfMonth: editingPrompt?.dayOfMonth,
      monthAndDay: editingPrompt?.monthAndDay,
      specificDate: editingPrompt?.specificDate,
      model: editingPrompt?.model
    },
    currentModel: '',
    intl
  });

  useEffect(() => {
    setTimeout(() => {
      nameInputRef.current?.focus();
    }, 100);
    if (editingPrompt && !isNew) return;
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) return;
        if (tabs[0]?.url) {
          try {
            const origin = new URL(tabs[0].url).origin;
            if (origin.startsWith('http')) setUrl(origin);
          } catch {
            // ignore
          }
        }
      });
    } catch {
      // chrome.tabs may not be available in all contexts
    }
  }, [editingPrompt, isNew]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const active = document.activeElement;
        if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [command, promptText]);

  const handleSave = async () => {
    setSubmitted(true);
    setUrlError('');

    if (!command.trim() || !promptText.trim()) return;

    if (scheduleEnabled && url.trim()) {
      const trimmedUrl = url.trim();
      if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
        setUrlError(
          intl.formatMessage({
            defaultMessage: 'URL must start with http:// or https://',
            id: 'PMPIVxGCgO'
          })
        );
        return;
      }
      try {
        new URL(trimmedUrl);
      } catch {
        setUrlError(intl.formatMessage({ defaultMessage: 'Invalid URL format', id: 'Zx2+7F8Kf5' }));
        return;
      }
    }

    try {
      const scheduleConfig = buildConfig();
      if (editingPrompt && !isNew) {
        const updates: Partial<SavedPrompt> = {
          prompt: promptText.trim(),
          command: command.trim(),
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
          updates.repeatType = undefined;
          updates.specificTime = undefined;
          updates.specificDate = undefined;
          updates.dayOfWeek = undefined;
          updates.dayOfMonth = undefined;
          updates.monthAndDay = undefined;
          updates.model = undefined;
        }
        await PromptService.updatePrompt(editingPrompt.id, updates);
      } else {
        const newPrompt: NewSavedPrompt = {
          prompt: promptText.trim(),
          command: command.trim(),
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
      }
      onSave(!!(editingPrompt && !isNew));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        editingPrompt && !isNew
          ? intl.formatMessage({ defaultMessage: 'Edit shortcut', id: 'edit_shortcut' })
          : intl.formatMessage({ defaultMessage: 'Create shortcut', id: 'create_shortcut' })
      }
      modalSize="lg"
      hasCloseButton
      placement="center-locked"
      overlayClassName="[background-color:hsl(var(--always-black)/0.5)!important]"
    >
      <div className="space-y-4 mt-4">
        <div>
          <span className="font-base text-text-200 block mb-1">
            <FormattedMessage defaultMessage="Name" id="name" />
          </span>
          <TextInput
            ref={nameInputRef}
            type="text"
            value={command}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const val = e.target.value.replace(/\s/g, '-').replace(/[^a-zA-Z0-9-_]/g, '');
              setCommand(val);
              if (error) setError('');
            }}
            prepend={
              <span
                aria-hidden="true"
                className="inline-flex h-4 w-4 items-center justify-center shrink-0 text-text-300"
                dangerouslySetInnerHTML={{ __html: getRunShortcutSvgMarkup(13) }}
              />
            }
            placeholder={intl.formatMessage({ defaultMessage: 'task-name', id: 'zfW5u5DbnY' })}
            className="w-full text-sm"
            error={(submitted && !command.trim()) || error?.includes('already in use')}
          />
          {((submitted && !command.trim()) || error?.includes('already in use')) && (
            <ErrorMessage className="mt-1">
              {submitted && !command.trim() ? (
                <FormattedMessage defaultMessage="Name is required" id="name_is_required" />
              ) : (
                error
              )}
            </ErrorMessage>
          )}
        </div>
        <div>
          <span className="font-base text-text-200 block mb-1">
            <FormattedMessage defaultMessage="Prompt" id="prompt" />
          </span>
          <TextArea
            required
            value={promptText}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPromptText(e.target.value)}
            className="min-h-32 max-h-64 overflow-y-auto font-large text-sm"
            placeholder={intl.formatMessage({
              defaultMessage: 'Enter your prompt text...',
              id: 'enter_your_prompt_text'
            })}
            error={
              submitted && !promptText.trim()
                ? intl.formatMessage({
                    defaultMessage: 'Prompt is required',
                    id: 'prompt_is_required'
                  })
                : undefined
            }
          />
        </div>
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
          setUrl={(val: string) => {
            setUrl(val);
            if (urlError) setUrlError('');
          }}
          urlError={submitted ? urlError : undefined}
          compact={false}
          model={model}
          setModel={setModel}
          availableModels={schedulingModelOptions}
        />
        {error && !error.includes('already in use') && (
          <div className="text-danger-000 text-sm">{error}</div>
        )}
      </div>
      <ModalFooter>
        <Button onClick={onClose} variant="secondary">
          <FormattedMessage defaultMessage="Cancel" id="cancel" />
        </Button>
        <Button onClick={handleSave}>
          {editingPrompt && !isNew ? (
            <FormattedMessage defaultMessage="Save changes" id="save_changes" />
          ) : (
            <FormattedMessage defaultMessage="Create shortcut" id="create_shortcut" />
          )}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
