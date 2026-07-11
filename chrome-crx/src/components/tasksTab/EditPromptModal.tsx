import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { useIntl, FormattedMessage } from 'react-intl';
import { Slash } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea
} from '../ui';
import { SchedulingFields } from '../scheduling/SchedulingFields';
import { PromptService, type NewSavedPrompt, type SavedPrompt } from '../../extensionServices';
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="overflow-visible rounded-xl sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {editingPrompt && !isNew ? (
              <FormattedMessage defaultMessage="Edit shortcut" id="edit_shortcut" />
            ) : (
              <FormattedMessage defaultMessage="Create shortcut" id="create_shortcut" />
            )}
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage
              defaultMessage="Create a reusable slash command and optionally run it on a schedule."
              id="shortcut_editor_description"
            />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-1.5">
              <FormattedMessage defaultMessage="Name" id="name" />
            </Label>
            <div className="relative">
              <Slash
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                ref={nameInputRef}
                type="text"
                value={command}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const val = event.target.value.replace(/\s/g, '-').replace(/[^a-zA-Z0-9-_]/g, '');
                  setCommand(val);
                  if (error) setError('');
                }}
                placeholder={intl.formatMessage({ defaultMessage: 'task-name', id: 'zfW5u5DbnY' })}
                className="rounded-md pl-8"
                aria-invalid={(submitted && !command.trim()) || error?.includes('already in use')}
              />
            </div>
            {((submitted && !command.trim()) || error?.includes('already in use')) && (
              <p className="mt-1 text-sm text-destructive">
                {submitted && !command.trim() ? (
                  <FormattedMessage defaultMessage="Name is required" id="name_is_required" />
                ) : (
                  error
                )}
              </p>
            )}
          </div>
          <div>
            <Label className="mb-1.5">
              <FormattedMessage defaultMessage="Prompt" id="prompt" />
            </Label>
            <Textarea
              required
              value={promptText}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                setPromptText(event.target.value)
              }
              className="max-h-64 min-h-32 overflow-y-auto rounded-md"
              placeholder={intl.formatMessage({
                defaultMessage: 'Enter your prompt text...',
                id: 'enter_your_prompt_text'
              })}
              aria-invalid={submitted && !promptText.trim()}
            />
            {submitted && !promptText.trim() && (
              <p className="mt-1 text-sm text-destructive">
                <FormattedMessage defaultMessage="Prompt is required" id="prompt_is_required" />
              </p>
            )}
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
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            <FormattedMessage defaultMessage="Cancel" id="cancel" />
          </Button>
          <Button onClick={handleSave}>
            {editingPrompt && !isNew ? (
              <FormattedMessage defaultMessage="Save changes" id="save_changes" />
            ) : (
              <FormattedMessage defaultMessage="Create shortcut" id="create_shortcut" />
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
