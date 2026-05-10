import React, { useState, useEffect, useRef, useCallback } from "react";
import { DEFAULT_MODEL } from '../constants/models';
import { useIntl, FormattedMessage } from "react-intl";
import runShortcutSvg from '../assets/IconRunShortcut.svg?raw';
import {
  IconBase,
  cn,
  CircleCheckIcon,
  CloseIcon,
  Button,
  CalendarIcon,
  DropdownMenu,
  DropdownMenuItem,
  PenIcon,
  TrashIcon,
  VerticalDotsIcon,
  Modal,
  ModalFooter,
  TextInput,
  ErrorMessage,
  TextArea
} from './ui';
import { getModelsConfig } from './providers/AppProviders';
import { SchedulingFields } from './scheduling/SchedulingFields';
import {
  PromptService,
  getStorageValue,
  StorageKeys,
  removeStorageValues,
} from "../extensionServices";

// =============================================================================
// Phosphor Icons: ListBulletsIcon & PlusIcon
// =============================================================================

const listBulletsWeights = new Map<string, React.ReactElement>([
  ["bold", React.createElement(React.Fragment, null, React.createElement("path", { d: "M76,64A12,12,0,0,1,88,52H216a12,12,0,0,1,0,24H88A12,12,0,0,1,76,64Zm140,52H88a12,12,0,0,0,0,24H216a12,12,0,0,0,0-24Zm0,64H88a12,12,0,0,0,0,24H216a12,12,0,0,0,0-24ZM44,112a16,16,0,1,0,16,16A16,16,0,0,0,44,112Zm0-64A16,16,0,1,0,60,64,16,16,0,0,0,44,48Zm0,128a16,16,0,1,0,16,16A16,16,0,0,0,44,176Z" }))],
  ["duotone", React.createElement(React.Fragment, null, React.createElement("path", { d: "M216,64V192H88V64Z", opacity: "0.2" }), React.createElement("path", { d: "M80,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H88A8,8,0,0,1,80,64Zm136,56H88a8,8,0,1,0,0,16H216a8,8,0,0,0,0-16Zm0,64H88a8,8,0,1,0,0,16H216a8,8,0,0,0,0-16ZM44,52A12,12,0,1,0,56,64,12,12,0,0,0,44,52Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,116Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,180Z" }))],
  ["fill", React.createElement(React.Fragment, null, React.createElement("path", { d: "M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM68,188a12,12,0,1,1,12-12A12,12,0,0,1,68,188Zm0-48a12,12,0,1,1,12-12A12,12,0,0,1,68,140Zm0-48A12,12,0,1,1,80,80,12,12,0,0,1,68,92Zm124,92H104a8,8,0,0,1,0-16h88a8,8,0,0,1,0,16Zm0-48H104a8,8,0,0,1,0-16h88a8,8,0,0,1,0,16Zm0-48H104a8,8,0,0,1,0-16h88a8,8,0,0,1,0,16Z" }))],
  ["light", React.createElement(React.Fragment, null, React.createElement("path", { d: "M82,64a6,6,0,0,1,6-6H216a6,6,0,0,1,0,12H88A6,6,0,0,1,82,64Zm134,58H88a6,6,0,0,0,0,12H216a6,6,0,0,0,0-12Zm0,64H88a6,6,0,0,0,0,12H216a6,6,0,0,0,0-12ZM44,54A10,10,0,1,0,54,64,10,10,0,0,0,44,54Zm0,128a10,10,0,1,0,10,10A10,10,0,0,0,44,182Zm0-64a10,10,0,1,0,10,10A10,10,0,0,0,44,118Z" }))],
  ["regular", React.createElement(React.Fragment, null, React.createElement("path", { d: "M80,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H88A8,8,0,0,1,80,64Zm136,56H88a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Zm0,64H88a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16ZM44,52A12,12,0,1,0,56,64,12,12,0,0,0,44,52Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,116Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,180Z" }))],
  ["thin", React.createElement(React.Fragment, null, React.createElement("path", { d: "M84,64a4,4,0,0,1,4-4H216a4,4,0,0,1,0,8H88A4,4,0,0,1,84,64Zm132,60H88a4,4,0,0,0,0,8H216a4,4,0,0,0,0-8Zm0,64H88a4,4,0,0,0,0,8H216a4,4,0,0,0,0-8ZM44,120a8,8,0,1,0,8,8A8,8,0,0,0,44,120Zm0-64a8,8,0,1,0,8,8A8,8,0,0,0,44,56Zm0,128a8,8,0,1,0,8,8A8,8,0,0,0,44,184Z" }))],
]);

const plusWeights = new Map<string, React.ReactElement>([
  ["bold", React.createElement(React.Fragment, null, React.createElement("path", { d: "M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z" }))],
  ["duotone", React.createElement(React.Fragment, null, React.createElement("path", { d: "M216,56V200a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V56A16,16,0,0,1,56,40H200A16,16,0,0,1,216,56Z", opacity: "0.2" }), React.createElement("path", { d: "M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z" }))],
  ["fill", React.createElement(React.Fragment, null, React.createElement("path", { d: "M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM184,136H136v48a8,8,0,0,1-16,0V136H72a8,8,0,0,1,0-16h48V72a8,8,0,0,1,16,0v48h48a8,8,0,0,1,0,16Z" }))],
  ["light", React.createElement(React.Fragment, null, React.createElement("path", { d: "M222,128a6,6,0,0,1-6,6H134v82a6,6,0,0,1-12,0V134H40a6,6,0,0,1,0-12h82V40a6,6,0,0,1,12,0v82h82A6,6,0,0,1,222,128Z" }))],
  ["regular", React.createElement(React.Fragment, null, React.createElement("path", { d: "M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z" }))],
  ["thin", React.createElement(React.Fragment, null, React.createElement("path", { d: "M220,128a4,4,0,0,1-4,4H132v84a4,4,0,0,1-8,0V132H40a4,4,0,0,1,0-8h84V40a4,4,0,0,1,8,0v84h84A4,4,0,0,1,220,128Z" }))],
]);

const ListBulletsIcon = React.forwardRef<any, any>((props, ref) =>
  React.createElement(IconBase, { ref, ...props, weights: listBulletsWeights })
);
ListBulletsIcon.displayName = "ListBulletsIcon";

const PlusIcon = React.forwardRef<any, any>((props, ref) =>
  React.createElement(IconBase, { ref, ...props, weights: plusWeights })
);
PlusIcon.displayName = "PlusIcon";

// =============================================================================
// Types
// =============================================================================

interface ToastData {
  id: string;
  message: string;
  type: "success" | "error";
}

interface SavedPrompt {
  id: string;
  command?: string;
  prompt: string;
  createdAt?: number;
  usageCount?: number;
  repeatType?: string;
  specificTime?: string;
  specificDate?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  monthAndDay?: string;
  url?: string;
  model?: string;
}

declare global {
  interface Window {
    showToast?: (message: string, type?: "success" | "error") => void;
  }
}

function getRunShortcutSvgMarkup(size: number, viewBox = "3 3 18 18") {
  return runShortcutSvg
    .replace(
      "<svg",
      `<svg style="width:${size}px;height:${size}px;color:currentColor;display:block;flex-shrink:0;"`
    )
    .replace(/viewBox="[^"]+"/, `viewBox="${viewBox}"`);
}

// =============================================================================
// Toast Components
// =============================================================================

function ToastItem({ toast, onClose }: { toast: ToastData; onClose: (id: string) => void }) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast.id]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose(toast.id);
    }, 200);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg",
        "bg-bg-000 border-[0.5px] border-border-300",
        "min-w-[300px] transition-all duration-200 ease-out",
        isExiting
          ? ["opacity-0 translate-x-full"]
          : ["animate-toast-slide-in", "opacity-100 translate-x-0"]
      )}
      style={{ animation: isExiting ? undefined : "toast-slide-in 0.3s ease-out" }}
    >
      {toast.type === "success" && (
        <CircleCheckIcon size={16} className="text-accent-secondary-100 flex-shrink-0" />
      )}
      <p className="text-text-200 font-base flex-1">{toast.message}</p>
      <button
        onClick={handleClose}
        className="p-1 hover:bg-bg-100 rounded transition-colors flex-shrink-0"
      >
        <CloseIcon size={14} className="text-text-300" />
      </button>
    </div>
  );
}

function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = (message: string, type: "success" | "error" = "success") => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    window.showToast = addToast;
    return () => {
      delete window.showToast;
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={removeToast} />
      ))}
    </div>
  );
}

function useToast() {
  return {
    showToast: (message: string, type: "success" | "error" = "success") => {
      const win = window as any;
      if (win.showToast) win.showToast(message, type);
    },
  };
}

// =============================================================================
// PromptCard
// =============================================================================

function PromptCard({
  prompt,
  scheduleText,
  onEdit,
  onDelete,
}: {
  prompt: SavedPrompt;
  scheduleText?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onEdit}
      className="relative group bg-bg-000 border-[0.5px] border-border-300 rounded-2xl p-4 hover:border-border-200 transition-all shadow-[0_2px_4px_0_rgba(0,0,0,0.04)] hover:shadow-[0_4px_20px_0_rgba(0,0,0,0.08)] w-full cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0 text-left">
          {prompt.command && (
            <div className="font-large-bold text-text-200 relative overflow-hidden">
              <div className="whitespace-nowrap flex min-h-6 min-w-0 items-center gap-1 leading-tight">
                <span
                  aria-hidden="true"
                  className="inline-flex h-[14px] w-[14px] items-center justify-center shrink-0 text-text-500/50"
                  dangerouslySetInnerHTML={{ __html: getRunShortcutSvgMarkup(14) }}
                />
                <span className="block min-w-0">{prompt.command}</span>
              </div>
              <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-bg-000 to-transparent pointer-events-none" />
            </div>
          )}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu
            unstyledTrigger
            trigger={
              <button className="hide-focus-ring p-1 hover:bg-bg-200 rounded transition-colors relative z-10 opacity-0 group-hover:opacity-100">
                <VerticalDotsIcon size={16} className="text-text-300" />
              </button>
            }
          >
            <DropdownMenuItem
              icon={<PenIcon size={14} />}
              onSelect={() => onEdit()}
            >
              <FormattedMessage defaultMessage="Edit" id="edit_2" />
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<TrashIcon size={14} />}
              danger
              onSelect={() => onDelete()}
            >
              <FormattedMessage defaultMessage="Delete" id="delete" />
            </DropdownMenuItem>
          </DropdownMenu>
        </div>
      </div>
      <div className="bg-bg-100 rounded-lg p-3 w-full text-left">
        <div className="text-sm text-text-300 h-24 overflow-y-auto whitespace-pre-wrap">
          {prompt.prompt}
        </div>
      </div>
      {scheduleText && (
        <div className="mt-3">
          <div className="text-text-300">
            <span className="text-xs">{scheduleText}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// EditPromptModal
// =============================================================================

function EditPromptModal({
  prompt: editingPrompt,
  onClose,
  onSave,
}: {
  prompt: SavedPrompt | null;
  onClose: () => void;
  onSave: (isUpdate: boolean) => void;
}) {
  const intl = useIntl();
  const [command, setCommand] = useState(editingPrompt?.command || "");
  const [promptText, setPromptText] = useState(editingPrompt?.prompt || "");
  const [error, setError] = useState("");
  const [urlError, setUrlError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const isNew = !editingPrompt?.id;
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [scheduleEnabled, setScheduleEnabled] = useState(
    Boolean(editingPrompt?.repeatType && editingPrompt.repeatType !== "none")
  );
  const [repeatType, setRepeatType] = useState(
    editingPrompt?.repeatType && editingPrompt.repeatType !== "none"
      ? editingPrompt.repeatType
      : "once"
  );
  const [specificTime, setSpecificTime] = useState(editingPrompt?.specificTime || "09:00");
  const [dayOfWeek, setDayOfWeek] = useState(editingPrompt?.dayOfWeek ?? 0);
  const [dayOfMonth, setDayOfMonth] = useState(editingPrompt?.dayOfMonth || 1);
  const [month, setMonth] = useState(
    (editingPrompt?.monthAndDay && parseInt(editingPrompt.monthAndDay.split("-")[0])) || 1
  );
  const [day, setDay] = useState(
    (editingPrompt?.monthAndDay && parseInt(editingPrompt.monthAndDay.split("-")[1])) || 1
  );
  const [specificDate, setSpecificDate] = useState(editingPrompt?.specificDate || "");
  const [url, setUrl] = useState(editingPrompt?.url || "");
  const modelConfig = getModelsConfig();
  const [model, setModel] = useState(
    editingPrompt?.model || modelConfig.default || DEFAULT_MODEL
  );

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
            if (origin.startsWith("http")) setUrl(origin);
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
      if (e.key === "Enter") {
        const active = document.activeElement;
        if (active?.tagName === "INPUT" || active?.tagName === "TEXTAREA") return;
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [command, promptText]);

  const handleSave = async () => {
    setSubmitted(true);
    setUrlError("");

    if (!command.trim() || !promptText.trim()) return;

    if (scheduleEnabled && url.trim()) {
      const trimmedUrl = url.trim();
      if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
        setUrlError(
          intl.formatMessage({
            defaultMessage: "URL must start with http:// or https://",
            id: "PMPIVxGCgO",
          })
        );
        return;
      }
      try {
        new URL(trimmedUrl);
      } catch {
        setUrlError(intl.formatMessage({ defaultMessage: "Invalid URL format", id: "Zx2+7F8Kf5" }));
        return;
      }
    }

    try {
      if (editingPrompt && !isNew) {
        const updates: any = {
          prompt: promptText.trim(),
          command: command.trim(),
          url: url.trim() || undefined,
        };
        if (scheduleEnabled) {
          updates.repeatType = repeatType;
          updates.specificTime = specificTime;
          updates.model = model;
          if (repeatType === "once") updates.specificDate = specificDate;
          if (repeatType === "weekly") updates.dayOfWeek = dayOfWeek;
          if (repeatType === "monthly") updates.dayOfMonth = dayOfMonth;
          if (repeatType === "annually") {
            updates.monthAndDay = `${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
          }
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
        const newPrompt: any = {
          prompt: promptText.trim(),
          command: command.trim(),
          url: url.trim() || undefined,
          createdAt: Date.now(),
          usageCount: 0,
        };
        if (scheduleEnabled) {
          newPrompt.repeatType = repeatType;
          newPrompt.specificTime = specificTime;
          newPrompt.model = model;
          if (repeatType === "once") newPrompt.specificDate = specificDate;
          if (repeatType === "weekly") newPrompt.dayOfWeek = dayOfWeek;
          if (repeatType === "monthly") newPrompt.dayOfMonth = dayOfMonth;
          if (repeatType === "annually") {
            newPrompt.monthAndDay = `${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
          }
        }
        await PromptService.savePrompt(newPrompt);
      }
      onSave(!!(editingPrompt && !isNew));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        editingPrompt && !isNew
          ? intl.formatMessage({ defaultMessage: "Edit shortcut", id: "edit_shortcut" })
          : intl.formatMessage({ defaultMessage: "Create shortcut", id: "create_shortcut" })
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
            onChange={(e: any) => {
              const val = e.target.value.replace(/\s/g, "-").replace(/[^a-zA-Z0-9-_]/g, "");
              setCommand(val);
              if (error) setError("");
            }}
            prepend={
              <span
                aria-hidden="true"
                className="inline-flex h-4 w-4 items-center justify-center shrink-0 text-text-300"
                dangerouslySetInnerHTML={{ __html: getRunShortcutSvgMarkup(13) }}
              />
            }
            placeholder={intl.formatMessage({ defaultMessage: "task-name", id: "zfW5u5DbnY" })}
            className="w-full text-sm"
            error={
              (submitted && !command.trim()) || error?.includes("already in use")
            }
          />
          {((submitted && !command.trim()) || error?.includes("already in use")) && (
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
            onChange={(e: any) => setPromptText(e.target.value)}
            className="min-h-32 max-h-64 overflow-y-auto font-large text-sm"
            placeholder={intl.formatMessage({
              defaultMessage: "Enter your prompt text...",
              id: "enter_your_prompt_text",
            })}
            error={
              submitted && !promptText.trim()
                ? intl.formatMessage({ defaultMessage: "Prompt is required", id: "prompt_is_required" })
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
          monthLabels={[
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
          ]}
          daysOfWeekLabels={[
            "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
          ]}
          url={url}
          setUrl={(val: string) => {
            setUrl(val);
            if (urlError) setUrlError("");
          }}
          urlError={submitted ? urlError : undefined}
          compact={false}
          model={model}
          setModel={setModel}
          modelConfig={modelConfig}
        />
        {error && !error.includes("already in use") && (
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

// =============================================================================
// Dark/Light empty state SVGs
// =============================================================================

const EMPTY_STATE_DARK_SVG = "data:image/svg+xml,%3csvg%20width='80'%20height='69'%20viewBox='0%200%2080%2069'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3cg%20filter='url(%23filter0_d_5136_3558)'%3e%3cpath%20d='M5%2019C5%2013.3995%205%2010.5992%206.08993%208.46009C7.04867%206.57847%208.57847%205.04867%2010.4601%204.08993C12.5992%203%2015.3995%203%2021%203H59.0648C64.6654%203%2067.4656%203%2069.6047%204.08993C71.4864%205.04867%2073.0162%206.57847%2073.9749%208.46009C75.0648%2010.5992%2075.0648%2013.3995%2075.0648%2019V46C75.0648%2051.6005%2075.0648%2054.4008%2073.9749%2056.5399C73.0162%2058.4215%2071.4864%2059.9513%2069.6047%2060.9101C67.4656%2062%2064.6654%2062%2059.0648%2062H21C15.3995%2062%2012.5992%2062%2010.4601%2060.9101C8.57847%2059.9513%207.04867%2058.4215%206.08993%2056.5399C5%2054.4008%205%2051.6005%205%2046V19Z'%20fill='%2330302E'%20shape-rendering='crispEdges'/%3e%3cpath%20d='M59.0645%202.75C61.8606%202.75%2063.9733%202.74945%2065.6533%202.88672C67.3361%203.02421%2068.6072%203.30141%2069.7178%203.86719C71.6464%204.84987%2073.2146%206.41806%2074.1973%208.34668C74.7632%209.45736%2075.0402%2010.7291%2075.1777%2012.4121C75.315%2014.0921%2075.3145%2016.2041%2075.3145%2019V46C75.3145%2048.7959%2075.315%2050.9079%2075.1777%2052.5879C75.0402%2054.2709%2074.7632%2055.5426%2074.1973%2056.6533C73.2146%2058.5819%2071.6464%2060.1501%2069.7178%2061.1328C68.6072%2061.6986%2067.3361%2061.9758%2065.6533%2062.1133C63.9733%2062.2505%2061.8606%2062.25%2059.0645%2062.25H21C18.2041%2062.25%2016.0921%2062.2505%2014.4121%2062.1133C12.7292%2061.9758%2011.4573%2061.6987%2010.3467%2061.1328C8.41802%2060.1501%206.84989%2058.582%205.86719%2056.6533C5.30129%2055.5427%205.02422%2054.2708%204.88672%2052.5879C4.74949%2050.9079%204.75%2048.7959%204.75%2046V19C4.75%2016.2041%204.74949%2014.0921%204.88672%2012.4121C5.02422%2010.7292%205.30129%209.45734%205.86719%208.34668C6.84989%206.41802%208.41802%204.84989%2010.3467%203.86719C11.4573%203.30129%2012.7292%203.02422%2014.4121%202.88672C16.0921%202.74949%2018.2041%202.75%2021%202.75H59.0645Z'%20stroke='%23DEDCD1'%20stroke-opacity='0.3'%20stroke-width='0.5'%20shape-rendering='crispEdges'/%3e%3cpath%20d='M14.4844%2019.2899L16.6109%2012.6917L17.5147%2012.7101L15.3882%2019.3083L14.4844%2019.2899Z'%20fill='%23C2C0B6'/%3e%3crect%20x='22.9209'%20y='15'%20width='32.0373'%20height='2'%20rx='1'%20fill='%23DEDCD1'%20fill-opacity='0.15'/%3e%3cpath%20d='M14.4844%2030.2899L16.6109%2023.6917L17.5147%2023.7101L15.3882%2030.3083L14.4844%2030.2899Z'%20fill='%23C2C0B6'/%3e%3crect%20x='22.9209'%20y='26'%20width='44.1435'%20height='2'%20rx='1'%20fill='%23DEDCD1'%20fill-opacity='0.15'/%3e%3cpath%20d='M14.4844%2041.2899L16.6109%2034.6917L17.5147%2034.7101L15.3882%2041.3083L14.4844%2041.2899Z'%20fill='%23C2C0B6'/%3e%3crect%20x='22.9209'%20y='37'%20width='38.9607'%20height='2'%20rx='1'%20fill='%23DEDCD1'%20fill-opacity='0.15'/%3e%3cpath%20d='M14.4844%2052.2899L16.6109%2045.6917L17.5147%2045.7101L15.3882%2052.3083L14.4844%2052.2899Z'%20fill='%23C2C0B6'/%3e%3crect%20x='22.9209'%20y='48'%20width='34.6778'%20height='2'%20rx='1'%20fill='%23DEDCD1'%20fill-opacity='0.15'/%3e%3c/g%3e%3cdefs%3e%3cfilter%20id='filter0_d_5136_3558'%20x='0.5'%20y='0.5'%20width='79.0645'%20height='68'%20filterUnits='userSpaceOnUse'%20color-interpolation-filters='sRGB'%3e%3cfeFlood%20flood-opacity='0'%20result='BackgroundImageFix'/%3e%3cfeColorMatrix%20in='SourceAlpha'%20type='matrix'%20values='0%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%20127%200'%20result='hardAlpha'/%3e%3cfeOffset%20dy='2'/%3e%3cfeGaussianBlur%20stdDeviation='2'/%3e%3cfeComposite%20in2='hardAlpha'%20operator='out'/%3e%3cfeColorMatrix%20type='matrix'%20values='0%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200.05%200'/%3e%3cfeBlend%20mode='normal'%20in2='BackgroundImageFix'%20result='effect1_dropShadow_5136_3558'/%3e%3cfeBlend%20mode='normal'%20in='SourceGraphic'%20in2='effect1_dropShadow_5136_3558'%20result='shape'/%3e%3c/filter%3e%3c/defs%3e%3c/svg%3e";

const EMPTY_STATE_LIGHT_SVG = "data:image/svg+xml,%3csvg%20width='80'%20height='69'%20viewBox='0%200%2080%2069'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3cg%20filter='url(%23filter0_d_5136_3446)'%3e%3cpath%20d='M5%2019C5%2013.3995%205%2010.5992%206.08993%208.46009C7.04867%206.57847%208.57847%205.04867%2010.4601%204.08993C12.5992%203%2015.3995%203%2021%203H59.0648C64.6654%203%2067.4656%203%2069.6047%204.08993C71.4864%205.04867%2073.0162%206.57847%2073.9749%208.46009C75.0648%2010.5992%2075.0648%2013.3995%2075.0648%2019V46C75.0648%2051.6005%2075.0648%2054.4008%2073.9749%2056.5399C73.0162%2058.4215%2071.4864%2059.9513%2069.6047%2060.9101C67.4656%2062%2064.6654%2062%2059.0648%2062H21C15.3995%2062%2012.5992%2062%2010.4601%2060.9101C8.57847%2059.9513%207.04867%2058.4215%206.08993%2056.5399C5%2054.4008%205%2051.6005%205%2046V19Z'%20fill='white'%20shape-rendering='crispEdges'/%3e%3cpath%20d='M59.0645%202.75C61.8606%202.75%2063.9733%202.74945%2065.6533%202.88672C67.3361%203.02421%2068.6072%203.30141%2069.7178%203.86719C71.6464%204.84987%2073.2146%206.41806%2074.1973%208.34668C74.7632%209.45736%2075.0402%2010.7291%2075.1777%2012.4121C75.315%2014.0921%2075.3145%2016.2041%2075.3145%2019V46C75.3145%2048.7959%2075.315%2050.9079%2075.1777%2052.5879C75.0402%2054.2709%2074.7632%2055.5426%2074.1973%2056.6533C73.2146%2058.5819%2071.6464%2060.1501%2069.7178%2061.1328C68.6072%2061.6986%2067.3361%2061.9758%2065.6533%2062.1133C63.9733%2062.2505%2061.8606%2062.25%2059.0645%2062.25H21C18.2041%2062.25%2016.0921%2062.2505%2014.4121%2062.1133C12.7292%2061.9758%2011.4573%2061.6987%2010.3467%2061.1328C8.41802%2060.1501%206.84989%2058.582%205.86719%2056.6533C5.30129%2055.5427%205.02422%2054.2708%204.88672%2052.5879C4.74949%2050.9079%204.75%2048.7959%204.75%2046V19C4.75%2016.2041%204.74949%2014.0921%204.88672%2012.4121C5.02422%2010.7292%205.30129%209.45734%205.86719%208.34668C6.84989%206.41802%208.41802%204.84989%2010.3467%203.86719C11.4573%203.30129%2012.7292%203.02422%2014.4121%202.88672C16.0921%202.74949%2018.2041%202.75%2021%202.75H59.0645Z'%20stroke='%231F1E1D'%20stroke-opacity='0.3'%20stroke-width='0.5'%20shape-rendering='crispEdges'/%3e%3cpath%20d='M14.4844%2019.2899L16.6109%2012.6917L17.5147%2012.7101L15.3882%2019.3083L14.4844%2019.2899Z'%20fill='%233D3D3A'/%3e%3crect%20x='22.9209'%20y='15'%20width='32.0373'%20height='2'%20rx='1'%20fill='%231F1E1D'%20fill-opacity='0.15'/%3e%3cpath%20d='M14.4844%2030.2899L16.6109%2023.6917L17.5147%2023.7101L15.3882%2030.3083L14.4844%2030.2899Z'%20fill='%233D3D3A'/%3e%3crect%20x='22.9209'%20y='26'%20width='44.1435'%20height='2'%20rx='1'%20fill='%231F1E1D'%20fill-opacity='0.15'/%3e%3cpath%20d='M14.4844%2041.2899L16.6109%2034.6917L17.5147%2034.7101L15.3882%2041.3083L14.4844%2041.2899Z'%20fill='%233D3D3A'/%3e%3crect%20x='22.9209'%20y='37'%20width='38.9607'%20height='2'%20rx='1'%20fill='%231F1E1D'%20fill-opacity='0.15'/%3e%3cpath%20d='M14.4844%2052.2899L16.6109%2045.6917L17.5147%2045.7101L15.3882%2052.3083L14.4844%2052.2899Z'%20fill='%233D3D3A'/%3e%3crect%20x='22.9209'%20y='48'%20width='34.6778'%20height='2'%20rx='1'%20fill='%231F1E1D'%20fill-opacity='0.15'/%3e%3c/g%3e%3cdefs%3e%3cfilter%20id='filter0_d_5136_3446'%20x='0.5'%20y='0.5'%20width='79.0645'%20height='68'%20filterUnits='userSpaceOnUse'%20color-interpolation-filters='sRGB'%3e%3cfeFlood%20flood-opacity='0'%20result='BackgroundImageFix'/%3e%3cfeColorMatrix%20in='SourceAlpha'%20type='matrix'%20values='0%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%20127%200'%20result='hardAlpha'/%3e%3cfeOffset%20dy='2'/%3e%3cfeGaussianBlur%20stdDeviation='2'/%3e%3cfeComposite%20in2='hardAlpha'%20operator='out'/%3e%3cfeColorMatrix%20type='matrix'%20values='0%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200.05%200'/%3e%3cfeBlend%20mode='normal'%20in2='BackgroundImageFix'%20result='effect1_dropShadow_5136_3446'/%3e%3cfeBlend%20mode='normal'%20in='SourceGraphic'%20in2='effect1_dropShadow_5136_3446'%20result='shape'/%3e%3c/filter%3e%3c/defs%3e%3c/svg%3e";

// =============================================================================
// TasksTab (main component)
// =============================================================================

function TasksTab({
  showAddForm: externalShowAddForm,
  setShowAddForm: externalSetShowAddForm,
  editingPrompt: externalEditingPrompt,
  setEditingPrompt: externalSetEditingPrompt,
  isInModal = false,
  initialTab = "my-shortcuts",
}: {
  showAddForm?: boolean;
  setShowAddForm?: (v: boolean) => void;
  editingPrompt?: SavedPrompt | null;
  setEditingPrompt?: (v: SavedPrompt | null) => void;
  isInModal?: boolean;
  initialTab?: string;
} = {}) {
  const intl = useIntl();
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [internalEditingPrompt, setInternalEditingPrompt] = useState<SavedPrompt | null>(null);
  const [internalShowAddForm, setInternalShowAddForm] = useState(false);
  const [_activeTab, setActiveTab] = useState(() => {
    if (isInModal || initialTab !== "my-shortcuts") return initialTab;
    const hash = window.location.hash;
    const qIdx = hash.indexOf("?");
    if (qIdx !== -1) {
      return new URLSearchParams(hash.substring(qIdx)).get("tab") === "browse"
        ? "browse"
        : "my-shortcuts";
    }
    return "my-shortcuts";
  });

  const currentEditingPrompt =
    externalEditingPrompt !== undefined ? externalEditingPrompt : internalEditingPrompt;
  const setEditingPrompt = externalSetEditingPrompt || setInternalEditingPrompt;
  const showAddForm = externalShowAddForm !== undefined ? externalShowAddForm : internalShowAddForm;
  const setShowAddForm = externalSetShowAddForm || setInternalShowAddForm;
  const { showToast } = useToast();

  const loadPrompts = async () => {
    const all = await PromptService.getAllPrompts();
    setPrompts(all.sort((a: any, b: any) => b.createdAt - a.createdAt));
  };

  const scheduledPrompts = prompts.filter(
    (p) => p.repeatType && p.repeatType !== "none"
  );
  const otherPrompts = prompts.filter(
    (p) => !p.repeatType || p.repeatType === "none"
  );

  const getScheduleText = (p: SavedPrompt): string => {
    if (!p.repeatType || p.repeatType === "none") return "";
    const timeStr = p.specificTime
      ? intl.formatTime(new Date(`2000-01-01T${p.specificTime}`), {
          hour: "numeric",
          minute: "2-digit",
        })
      : "";
    const withTime = (label: string) =>
      timeStr
        ? intl.formatMessage(
            {
              defaultMessage: "{label} at {time}",
              id: "schedule_label_at_time",
            },
            { label, time: timeStr }
          )
        : label;

    switch (p.repeatType) {
      case "once":
        if (p.specificDate) {
          const [year, mo, d] = p.specificDate.split("-").map(Number);
          const dateStr = intl.formatDate(new Date(year, mo - 1, d), {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
          return timeStr
            ? intl.formatMessage(
                {
                  defaultMessage: "{date} at {time}",
                  id: "schedule_date_at_time",
                },
                { date: dateStr, time: timeStr }
              )
            : dateStr;
        }
        return withTime(
          intl.formatMessage({
            defaultMessage: "Once",
            id: "once",
          })
        );
      case "daily":
        return withTime(
          intl.formatMessage({
            defaultMessage: "Daily",
            id: "daily",
          })
        );
      case "weekly":
        return withTime(
          intl.formatMessage(
            {
              defaultMessage: "{weekly} on {day}",
              id: "schedule_weekly_on_day",
            },
            {
              weekly: intl.formatMessage({
                defaultMessage: "Weekly",
                id: "weekly",
              }),
              day: intl.formatDate(new Date(2020, 5, 7 + (p.dayOfWeek || 0)), {
                weekday: "long",
              }),
            }
          )
        );
      case "monthly":
        return withTime(
          intl.formatMessage(
            {
              defaultMessage: "{monthly} on day {dayOfMonth}",
              id: "schedule_monthly_on_day",
            },
            {
              monthly: intl.formatMessage({
                defaultMessage: "Monthly",
                id: "monthly",
              }),
              dayOfMonth: p.dayOfMonth || 1,
            }
          )
        );
      case "annually":
        if (p.monthAndDay) {
          const [mo, d] = p.monthAndDay.split("-").map(Number);
          return withTime(
            intl.formatMessage(
              {
                defaultMessage: "{annually} on {date}",
                id: "schedule_annually_on_date",
              },
              {
                annually: intl.formatMessage({
                  defaultMessage: "Annually",
                  id: "annually",
                }),
                date: intl.formatDate(new Date(2000, mo - 1, d), {
                  month: "short",
                  day: "numeric",
                }),
              }
            )
          );
        }
        return withTime(
          intl.formatMessage({
            defaultMessage: "Annually",
            id: "annually",
          })
        );
      default:
        return "";
    }
  };

  useEffect(() => {
    loadPrompts();
    (async () => {
      const pending = await getStorageValue(StorageKeys.PENDING_SCHEDULED_TASK);
      if (pending) {
        const today = new Date().toISOString().split("T")[0];
        const date = pending.specificDate;
        setEditingPrompt({
          ...pending,
          command: pending.command || "",
          prompt: pending.prompt || "",
          createdAt: pending.createdAt || Date.now(),
          usageCount: pending.usageCount || 0,
          specificDate: date && date >= today ? date : undefined,
        });
        setShowAddForm(true);
        await removeStorageValues(StorageKeys.PENDING_SCHEDULED_TASK);
      }
    })();
  }, [setEditingPrompt, setShowAddForm]);

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        intl.formatMessage({
          defaultMessage: "Are you sure you want to delete this prompt?",
          id: "eJFbw2HgHp",
        })
      )
    )
      return;
    await PromptService.deletePrompt(id);
    if (currentEditingPrompt?.id === id) {
      setEditingPrompt(null);
      setShowAddForm(false);
    }
    loadPrompts();
    showToast(
      intl.formatMessage({ defaultMessage: "Shortcut deleted", id: "RRFjL3H23m" })
    );
  };

  return (
    <>
      <ToastContainer />
      <div className="space-y-6">
        <div
          className={
            isInModal
              ? "px-6 pt-6 pb-6"
              : "bg-bg-100 border-[0.5px] border-border-300 rounded-xl px-6 pt-6 pb-6 md:px-8 md:pt-8 md:pb-8"
          }
        >
          {!isInModal && (
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-text-100 font-xl-bold">
                  <FormattedMessage defaultMessage="Shortcuts" id="shortcuts" />
                </h3>
                <p className="text-text-300 font-base mt-1">
                  <FormattedMessage
                    defaultMessage="Type / in the chat to use shortcuts or run them on schedule"
                    id="type_in_the_chat_to_use_shortcuts_or"
                  />
                </p>
              </div>
              <Button
                onClick={() => {
                  setEditingPrompt(null);
                  setShowAddForm(true);
                }}
                prepend={<PlusIcon size={16} />}
                size="sm"
                className="ml-2"
              >
                <FormattedMessage defaultMessage="Create shortcut" id="create_shortcut" />
              </Button>
            </div>
          )}
          {isInModal && (
            <p className="text-text-300 font-base mb-6">
              <FormattedMessage
                defaultMessage="Type / to use shortcuts or run them on a schedule"
                id="type_to_use_shortcuts_or_run_them_on"
              />
            </p>
          )}
          <div className="space-y-8 mt-6">
            {scheduledPrompts.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <CalendarIcon size={16} className="text-text-300" />
                  <h4 className="text-text-200 font-base-bold">
                    <FormattedMessage
                      defaultMessage="Scheduled tasks"
                      id="scheduled_tasks"
                    />
                  </h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {scheduledPrompts.map((p) => (
                    <PromptCard
                      key={p.id}
                      prompt={p}
                      scheduleText={getScheduleText(p)}
                      onEdit={() => {
                        setEditingPrompt(p);
                        setShowAddForm(true);
                      }}
                      onDelete={() => handleDelete(p.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            {otherPrompts.length > 0 && (
              <div>
                {scheduledPrompts.length > 0 && (
                  <div className="flex items-center gap-2 mb-4">
                    <ListBulletsIcon size={18} weight="light" className="text-text-300" />
                    <h4 className="text-text-200 font-base-bold">
                      <FormattedMessage
                        defaultMessage="Quick actions"
                        id="quick_actions"
                      />
                    </h4>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {otherPrompts.map((p) => (
                    <PromptCard
                      key={p.id}
                      prompt={p}
                      onEdit={() => {
                        setEditingPrompt(p);
                        setShowAddForm(true);
                      }}
                      onDelete={() => handleDelete(p.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            {prompts.length === 0 && (
              <div className="bg-bg-200 rounded-xl p-12 text-center">
                <picture>
                  <source srcSet={EMPTY_STATE_DARK_SVG} media="(prefers-color-scheme: dark)" />
                  <img
                    src={EMPTY_STATE_LIGHT_SVG}
                    alt={intl.formatMessage({
                      defaultMessage: "Tasks illustration",
                      id: "heKLO07Qz/",
                    })}
                    className="w-24 h-24 mx-auto mb-1"
                  />
                </picture>
                <p className="text-text-300 max-w-[200px] mx-auto">
                  <FormattedMessage
                    defaultMessage="Create your first shortcut to get started"
                    id="create_your_first_shortcut_to_get_started"
                  />
                </p>
              </div>
            )}
          </div>
        </div>
        {showAddForm && (
          <EditPromptModal
            prompt={currentEditingPrompt}
            onClose={() => {
              setShowAddForm(false);
              setEditingPrompt(null);
            }}
            onSave={(isUpdate) => {
              loadPrompts();
              setShowAddForm(false);
              setEditingPrompt(null);
              showToast(
                isUpdate
                  ? intl.formatMessage({ defaultMessage: "Shortcut updated", id: "IV5WU06zbs" })
                  : intl.formatMessage({ defaultMessage: "Shortcut added", id: "wn15NDyLWm" })
              );
            }}
          />
        )}
      </div>
    </>
  );
}

// =============================================================================
// Prompt Templates (static data from bundle)
// =============================================================================

const PROMPT_TEMPLATES = [
  {
    category: "general",
    label: "General",
    prompts: [
      { prompt: "Summarize this page and extract the key insights, main arguments, and important data points.", command: "summarize" },
      { prompt: "Research this topic by visiting multiple authoritative websites and gathering key information. Open each source in a new tab, read through the content, and summarize the main findings from each source.", command: "research" },
      { prompt: "Compare prices and features for this product across at least 5 different websites. Create a comparison table showing: price, shipping costs, delivery time, return policy, and any special features or bundles. Highlight the best overall value and explain why.", command: "compare-prices" },
      { prompt: "Fill out this form or application with the information I provide. Before submitting, show me a screenshot of the completed form for review. If there are multiple steps, take a screenshot at each step so I can verify the information is correct.", command: "fill-form" },
      { prompt: "Extract all the important data from this page (tables, lists, contact info, prices, etc.) and organize it in a clear, structured format that I can easily copy.", command: "extract" },
      { prompt: "Find and click through all the links on this page to discover what's available. Create a summary of what each major section or link leads to.", command: "explore" },
    ],
  },
  {
    category: "email",
    label: "Email",
    prompts: [
      { prompt: "Go through my recent emails and help me unsubscribe from promotional/marketing emails. \n\nFocus on: retail promotions, marketing newsletters, sales emails, and automated promotional content. DO NOT unsubscribe from: transactional emails (receipts, shipping notifications), account security emails, or emails that appear to be personal/conversational. \n\nStart with emails from the last 2 weeks. Before unsubscribing from anything, give me a full list of the different emails you plan to unsubscribe from so I can confirm you're identifying the right types of emails. When you do this, make sure to ask me if there's any of those emails you should not unsubscribe from.\n\nFor each promotional email you find: (1) Look for and click the native \"unsubscribe\" button from google (top of the email, next to sender email address); (2) Keep a running list of what you've unsubscribed from.", command: "unsubscribe" },
      { prompt: "Go through my email inbox and archive all emails where: (A) I don't need to take any actions; AND (B) where the email does not appear to be from an actual human (personal tone, specific to me, conversational).\n\nIf an email only meets one of those two criteria, don't archive it.\n\nEmails to archive covers things like general notifications, calendar invitations / acceptances, promotions etc.\n\nRemember – the archive button is the one that is second on the left. It has a down arrow sign within a folder. Make sure that you are not clicking the 'labels' button (second from the right, rectangular type of button that points right), and don't press \"move to\" as well (third from the right, folder icon with right arrow). DO NOT MARK AS SPAM (which is third button from left, the exclamation mark (\"report spam\" button).\n\nBefore you click to archive the first time, take a screenshot when you hover on the \"archive\" button to confirm that you are taking the action intended.\n\nAfter you click to archive, make sure to take a screenshot before taking any further actions so that you don't get lost.\n\nAlso archive any google automatic reminder emails for following up on emails I've sent in the past that haven't gotten a response.", command: "archive" },
      { prompt: "Go through my inbox and draft thoughtful responses to emails that require my attention. For each email that needs a response: \n\n1) Read the full context and any previous thread messages within that same email chain; (2) Draft a response that maintains my professional tone while being warm and helpful; (3) Save as a draft but DO NOT send. Once you've written the draft, Click on the \"back\" button in the top bar, which is the far left button and directly on left of the archive button, which takes you back to inbox and automatically saves the draft. Focus on emails from the last 3 days.\n\nOnly click into emails that you think need a response when looking at the sender and subject line – don't click into automated notifications, calendar invites etc.\n\nFor an email that needs a response, make sure you click in and expand each of the previous emails within the chain. You can see the collapsed preview state in the middle / top side of the email chain, with the number of how many previous emails are in the thread. Make sure to click into each one to get all the context, don't skip out on this.\n\nAfter you've drafted the email, click on the \"back to inbox\" button (left pointing arrow) that is the far left button on the top bar (the button is on the left of the archive button). This will take you back to inbox, and you can then go onto the next email.", command: "draft-responses" },
      { prompt: "Extract action items and deadlines from all unread emails and create a prioritized task list.", command: "actions" },
      { prompt: "Go through my sent emails from the last week and identify any that haven't received a response. Create a list of who I'm waiting to hear back from and what about.", command: "follow-ups" },
      { prompt: "Review my email drafts folder and help me finish or send any drafts that have been sitting there. Show me each draft and ask what action to take.", command: "review-drafts" },
    ],
  },
  {
    category: "docs",
    label: "Docs",
    prompts: [
      { prompt: "Create a comprehensive document from my outline, researching and writing each section with proper formatting.", command: "create-doc" },
      { prompt: "Review this document for clarity, grammar, structure, and factual accuracy, then implement improvements.", command: "review" },
      { prompt: "Generate an executive summary and key takeaways from this long document.", command: "summarize-doc" },
      { prompt: "Convert this document to different formats while preserving all formatting, images, and data.", command: "convert" },
      { prompt: "Merge multiple documents into one cohesive file, removing duplicates and organizing content logically.", command: "merge" },
      { prompt: "Create a presentation from this document with slides, speaker notes, and visual elements.", command: "present" },
    ],
  },
  {
    category: "calendar",
    label: "Calendar",
    prompts: [
      { prompt: "Find the optimal meeting time for all participants across different time zones and schedule it.", command: "schedule" },
      { prompt: "Analyze my calendar patterns and suggest ways to optimize for productivity and work-life balance.", command: "optimize" },
      { prompt: "Resolve all scheduling conflicts by proposing alternative times and notifying affected parties.", command: "conflicts" },
      { prompt: "Block focus time for deep work based on my priorities and energy patterns throughout the day.", command: "focus" },
      { prompt: "Plan a multi-day event with sessions, breaks, and logistics, sending invites to all participants.", command: "event" },
      { prompt: "Create recurring meetings with smart scheduling that avoids holidays and conflicts.", command: "recurring" },
    ],
  },
  {
    category: "linkedin",
    label: "LinkedIn",
    prompts: [
      { prompt: "Write an engaging LinkedIn post about this topic that will resonate with my professional network.", command: "post" },
      { prompt: "Optimize my entire LinkedIn profile with keywords, compelling descriptions, and strategic positioning.", command: "profile" },
      { prompt: "Identify and connect with relevant professionals in my industry with personalized messages.", command: "network" },
      { prompt: "Search for jobs matching my skills, apply with tailored resumes, and track application status.", command: "jobs" },
      { prompt: "Research this company's culture, recent news, and key employees to prepare for outreach or interviews.", command: "company" },
      { prompt: "Analyze my LinkedIn analytics and suggest content strategies to increase engagement and reach.", command: "analytics" },
    ],
  },
].flatMap((cat) => cat.prompts);

// =============================================================================
// Exports (matching bundle: F as T, T as a, H as n, L as u)
// =============================================================================

export { TasksTab as T, ToastContainer as a, PlusIcon as n, useToast as u };
