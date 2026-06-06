import {
  ChevronDown,
  ChevronRight,
  Check,
  MessageSquarePlus,
  MoreHorizontal,
  Languages,
  Loader2,
  Settings2,
  Workflow,
  Zap
} from 'lucide-react';
import { Tooltip } from '../Tooltip';
import { MemoizedFormattedMessage } from '../../index-react-dom-intl';
import type { SupportedLocale } from '../../index-react-dom-intl';

export interface SidepanelHeaderProps {
  // Model menu
  modelMenuRef: React.RefObject<HTMLDivElement | null>;
  isModelMenuOpen: boolean;
  setIsModelMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedModelLabel: string;
  normalizedModelOptions: Array<{ value: string; label: string }>;
  handleModelChange: (value: string) => void;
  effectiveSelectedModel: string;

  // Header menu
  headerMenuRef: React.RefObject<HTMLDivElement | null>;
  isHeaderMenuOpen: boolean;
  setIsHeaderMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isLanguageSubmenuOpen: boolean;
  setIsLanguageSubmenuOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Quick mode
  purlModeFeatureEnabled: boolean;
  isPurlMode: boolean;
  setPurlModeToggle: (value: boolean) => void;
  effectiveIsAgentRunning: boolean;

  // Actions
  clearConversation: () => void;
  handleConvertToScheduledTask: () => void;
  isConvertingToTask: boolean;
  hasChatMessages: boolean;
  input: string;
  openOptionsPage: () => void;

  // Language
  SUPPORTED_LOCALES: readonly SupportedLocale[];
  LOCALE_DISPLAY_NAMES: Record<SupportedLocale, string>;
  locale: SupportedLocale;
  handleLanguageSelection: (locale: SupportedLocale) => void;

  // Utils
  intl: { formatMessage: (descriptor: { id: string; defaultMessage?: string }) => string };
  trackEvent: (event: string, properties?: any) => void;
}

export function SidepanelHeader({
  modelMenuRef,
  isModelMenuOpen,
  setIsModelMenuOpen,
  selectedModelLabel,
  normalizedModelOptions,
  handleModelChange,
  effectiveSelectedModel,
  headerMenuRef,
  isHeaderMenuOpen,
  setIsHeaderMenuOpen,
  isLanguageSubmenuOpen,
  setIsLanguageSubmenuOpen,
  purlModeFeatureEnabled,
  isPurlMode,
  setPurlModeToggle,
  effectiveIsAgentRunning,
  clearConversation,
  handleConvertToScheduledTask,
  isConvertingToTask,
  hasChatMessages,
  input,
  openOptionsPage,
  SUPPORTED_LOCALES,
  LOCALE_DISPLAY_NAMES,
  locale,
  handleLanguageSelection,
  intl,
  trackEvent
}: SidepanelHeaderProps) {
  return (
    <header className="shrink-0 flex justify-between items-center px-4 pt-3 pb-3">
      <div className="flex items-center gap-3">
        <div ref={modelMenuRef} className="relative">
          <button
            type="button"
            className="hide-focus-ring py-1 px-2 rounded-md transition-colors text-text-200 hover:bg-bg-300 hover:text-text-100"
            onClick={() => {
              setIsHeaderMenuOpen(false);
              setIsLanguageSubmenuOpen(false);
              setIsModelMenuOpen((value) => !value);
            }}
            aria-haspopup="menu"
            aria-expanded={isModelMenuOpen}
            aria-label={intl.formatMessage({
              defaultMessage: 'Select model',
              id: 'select_model'
            })}
          >
            <span className="flex items-center gap-1.5">
              <span className="text-[12px] font-ui font-normal leading-[140%] tracking-[-0.2px]">
                {selectedModelLabel}
              </span>
              <ChevronDown size={12} className="text-text-300" />
            </span>
          </button>
          {isModelMenuOpen ? (
            <div className="absolute left-0 top-full mt-2 z-50 min-w-[240px] bg-bg-000 border-0.5 border-border-200 backdrop-blur-xl rounded-xl text-text-300 shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] p-1.5 max-h-60 overflow-y-auto">
              {normalizedModelOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleModelChange(option.value)}
                  className="w-full min-h-8 px-2 py-1.5 rounded-lg text-left text-sm flex items-center gap-2 hover:bg-bg-200 hover:text-text-100 transition-colors"
                >
                  <span className="flex-1">{option.label}</span>
                  {option.value === effectiveSelectedModel ? (
                    <Check size={14} className="text-accent-secondary-200" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        {purlModeFeatureEnabled && (
          <Tooltip tooltipContent="Quick mode" side="bottom">
            <button
              type="button"
              onClick={() => {
                if (isPurlMode) {
                  setPurlModeToggle(false);
                  chrome.storage.local.set({ purlMode: false });
                  void trackEvent('superduck.sidebar.quick_mode_toggled', { enabled: false });
                } else {
                  setPurlModeToggle(true);
                  chrome.storage.local.set({ purlMode: true });
                  void trackEvent('superduck.sidebar.quick_mode_toggled', { enabled: true });
                }
              }}
              disabled={effectiveIsAgentRunning}
              className={`p-1.5 rounded-md transition-colors ${
                isPurlMode
                  ? 'text-accent-main-100 bg-bg-300'
                  : 'text-text-300 hover:bg-bg-300 hover:text-text-100'
              } ${effectiveIsAgentRunning ? 'opacity-40 cursor-not-allowed' : ''}`}
              aria-label="Toggle quick mode"
              data-test-id={isPurlMode ? 'lightning-mode-active' : 'lightning-mode-inactive'}
            >
              <Zap size={12} fill={isPurlMode ? 'currentColor' : 'none'} />
            </button>
          </Tooltip>
        )}
        <button
          type="button"
          className="p-1.5 rounded-md transition-colors text-text-300 hover:bg-bg-300 hover:text-text-100"
          onClick={clearConversation}
          aria-label={intl.formatMessage({ defaultMessage: 'Clear chat', id: 'clear_chat' })}
          title={intl.formatMessage({ defaultMessage: 'Clear chat', id: 'clear_chat' })}
        >
          <MessageSquarePlus size={14} />
        </button>
        <div ref={headerMenuRef} className="relative">
          <button
            type="button"
            className="hide-focus-ring p-1.5 rounded-md transition-colors text-text-300 hover:bg-bg-300 hover:text-text-100"
            onClick={() => {
              setIsModelMenuOpen(false);
              setIsHeaderMenuOpen((value) => {
                if (value) {
                  setIsLanguageSubmenuOpen(false);
                }
                return !value;
              });
            }}
            aria-label={intl.formatMessage({ defaultMessage: 'Menu', id: 'menu' })}
            title={intl.formatMessage({ defaultMessage: 'Menu', id: 'menu' })}
          >
            <MoreHorizontal size={12} />
          </button>
          {isHeaderMenuOpen ? (
            <div className="absolute right-0 top-full mt-2 z-50 w-[240px] bg-bg-000 border-0.5 border-border-200 backdrop-blur-xl rounded-xl text-text-300 shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] p-1.5">
              <button
                type="button"
                onClick={handleConvertToScheduledTask}
                disabled={
                  isConvertingToTask ||
                  effectiveIsAgentRunning ||
                  (!hasChatMessages && !input.trim())
                }
                className="w-full min-h-8 px-2 py-1.5 rounded-lg text-left text-sm flex items-center gap-2 hover:bg-bg-200 hover:text-text-100 transition-colors disabled:opacity-40"
              >
                {isConvertingToTask ? (
                  <Loader2 size={16} className="animate-spin shrink-0" />
                ) : (
                  <Workflow size={16} className="shrink-0" />
                )}
                <span className="flex-1">
                  <MemoizedFormattedMessage defaultMessage="Convert to task" id="convert_to_task" />
                </span>
              </button>
              <button
                type="button"
                onClick={openOptionsPage}
                className="w-full min-h-8 px-2 py-1.5 rounded-lg text-left text-sm flex items-center gap-2 hover:bg-bg-200 hover:text-text-100 transition-colors"
              >
                <Settings2 size={16} className="shrink-0" />
                <span className="flex-1">
                  <MemoizedFormattedMessage defaultMessage="Settings" id="settings" />
                </span>
              </button>
              <div>
                <button
                  type="button"
                  onClick={() => setIsLanguageSubmenuOpen((value) => !value)}
                  aria-expanded={isLanguageSubmenuOpen}
                  aria-controls="language-submenu"
                  className="w-full min-h-8 px-2 py-1.5 rounded-lg text-left text-sm flex items-center gap-2 hover:bg-bg-200 hover:text-text-100 transition-colors"
                >
                  <Languages size={16} className="shrink-0" />
                  <span className="flex-1">
                    <MemoizedFormattedMessage defaultMessage="Language" id="language" />
                  </span>
                  {isLanguageSubmenuOpen ? (
                    <ChevronDown size={16} className="text-text-300 shrink-0" />
                  ) : (
                    <ChevronRight size={16} className="text-text-300 shrink-0" />
                  )}
                </button>
                {isLanguageSubmenuOpen ? (
                  <div id="language-submenu" className="pl-4">
                    {SUPPORTED_LOCALES.map((entry) => (
                      <button
                        key={entry}
                        type="button"
                        onClick={() => handleLanguageSelection(entry as SupportedLocale)}
                        className="w-full min-h-8 px-2 py-1.5 rounded-lg text-left text-sm flex items-center gap-2 hover:bg-bg-200 hover:text-text-100 transition-colors"
                      >
                        <span className="flex-1 whitespace-nowrap">
                          {LOCALE_DISPLAY_NAMES[entry]}
                        </span>
                        {locale === entry ? (
                          <Check size={14} className="text-accent-secondary-200" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {!hasChatMessages ? (
                <p className="px-2 pt-2 text-[11px] text-text-300">
                  <MemoizedFormattedMessage
                    defaultMessage="Start a chat to convert it into a task."
                    id="start_a_chat_to_convert_it_into_a"
                  />
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
