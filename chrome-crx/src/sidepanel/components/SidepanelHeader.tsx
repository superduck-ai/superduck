import { useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Check,
  Clock,
  MessageSquarePlus,
  MoreHorizontal,
  Languages,
  Loader2,
  Settings2,
  Workflow,
  Zap
} from 'lucide-react';
import { Tooltip } from '@/sidepanel/components/Tooltip';
import { MemoizedFormattedMessage, useIntlSafe } from '../../index-react-dom-intl';
import type { SupportedLocale } from '../../index-react-dom-intl';
import { NativeHostStatusButton } from './NativeHostStatusButton';
import { useUIStore } from '../stores/uiStore';
import {
  LOCALE_DISPLAY_NAMES,
  SUPPORTED_LOCALES,
  usePreferredLocale
} from '../../index-react-dom-intl';
import { trackEvent } from '../../mcpRuntime';
import { useMenuClickOutside } from '../hooks/useMenuClickOutside';
import { useSidepanelViewState } from '../contexts/SidepanelViewStateContext';

export function SidepanelHeader() {
  const state = useSidepanelViewState();
  const intl = useIntlSafe();
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);

  // ─── Read state from Zustand stores (no prop drilling) ───────────────────
  const isModelMenuOpen = useUIStore((s) => s.isModelMenuOpen);
  const setIsModelMenuOpen = useUIStore((s) => s.setIsModelMenuOpen);
  const isHeaderMenuOpen = useUIStore((s) => s.isHeaderMenuOpen);
  const setIsHeaderMenuOpen = useUIStore((s) => s.setIsHeaderMenuOpen);
  const isLanguageSubmenuOpen = useUIStore((s) => s.isLanguageSubmenuOpen);
  const setIsLanguageSubmenuOpen = useUIStore((s) => s.setIsLanguageSubmenuOpen);
  const setPurlModeToggle = useUIStore((s) => s.setPurlModeToggle);
  const { locale } = usePreferredLocale();

  useMenuClickOutside(isHeaderMenuOpen, headerMenuRef, () => {
    setIsHeaderMenuOpen(false);
    setIsLanguageSubmenuOpen(false);
  });
  useMenuClickOutside(isModelMenuOpen, modelMenuRef, () => setIsModelMenuOpen(false));

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
              setIsModelMenuOpen(!isModelMenuOpen);
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
                {state.selectedModelLabel}
              </span>
              <ChevronDown size={12} className="text-text-300" />
            </span>
          </button>
          {isModelMenuOpen ? (
            <div className="absolute left-0 top-full mt-2 z-50 min-w-[240px] bg-bg-000 border-0.5 border-border-200 backdrop-blur-xl rounded-xl text-text-300 shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] p-1.5 max-h-60 overflow-y-auto">
              {state.normalizedModelOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => state.handleModelChange(option.value)}
                  className="w-full min-h-8 px-2 py-1.5 rounded-lg text-left text-sm flex items-center gap-2 hover:bg-bg-200 hover:text-text-100 transition-colors"
                >
                  <span className="flex-1">{option.label}</span>
                  {option.value === state.effectiveSelectedModel ? (
                    <Check size={14} className="text-accent-secondary-200" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        {state.purlModeFeatureEnabled && (
          <Tooltip tooltipContent="Quick mode" side="bottom">
            <button
              type="button"
              onClick={() => {
                if (state.isPurlMode) {
                  setPurlModeToggle(false);
                  chrome.storage.local.set({ purlMode: false });
                  void trackEvent('superduck.sidebar.quick_mode_toggled', { enabled: false });
                } else {
                  setPurlModeToggle(true);
                  chrome.storage.local.set({ purlMode: true });
                  void trackEvent('superduck.sidebar.quick_mode_toggled', { enabled: true });
                }
              }}
              disabled={state.effectiveIsAgentRunning}
              className={`p-1.5 rounded-md transition-colors ${
                state.isPurlMode
                  ? 'text-accent-main-100 bg-bg-300'
                  : 'text-text-300 hover:bg-bg-300 hover:text-text-100'
              } ${state.effectiveIsAgentRunning ? 'opacity-40 cursor-not-allowed' : ''}`}
              aria-label="Toggle quick mode"
              data-test-id={state.isPurlMode ? 'lightning-mode-active' : 'lightning-mode-inactive'}
            >
              <Zap size={12} fill={state.isPurlMode ? 'currentColor' : 'none'} />
            </button>
          </Tooltip>
        )}
        <NativeHostStatusButton
          intl={intl}
          trackEvent={trackEvent}
          onOpen={() => {
            setIsModelMenuOpen(false);
            setIsHeaderMenuOpen(false);
            setIsLanguageSubmenuOpen(false);
          }}
        />
        <button
          type="button"
          className="p-1.5 rounded-md transition-colors text-text-300 hover:bg-bg-300 hover:text-text-100"
          onClick={() => state.setShowHistoryPanel(true)}
          aria-label={intl.formatMessage({ defaultMessage: 'History', id: 'history' })}
          title={intl.formatMessage({ defaultMessage: 'History', id: 'history' })}
        >
          <Clock size={14} />
        </button>
        <button
          type="button"
          className="p-1.5 rounded-md transition-colors text-text-300 hover:bg-bg-300 hover:text-text-100"
          onClick={state.clearConversation}
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
              if (isHeaderMenuOpen) {
                setIsLanguageSubmenuOpen(false);
              }
              setIsHeaderMenuOpen(!isHeaderMenuOpen);
            }}
            aria-label={intl.formatMessage({ defaultMessage: 'Menu', id: 'menu' })}
            title={intl.formatMessage({ defaultMessage: 'Menu', id: 'menu' })}
            data-test-id="header-menu-toggle"
          >
            <MoreHorizontal size={12} />
          </button>
          {isHeaderMenuOpen ? (
            <div className="absolute right-0 top-full mt-2 z-50 w-[240px] bg-bg-000 border-0.5 border-border-200 backdrop-blur-xl rounded-xl text-text-300 shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] p-1.5">
              <button
                type="button"
                onClick={state.handleConvertToScheduledTask}
                disabled={
                  state.isConvertingToTask ||
                  state.effectiveIsAgentRunning ||
                  (!state.hasChatMessages && !state.input.trim())
                }
                className="w-full min-h-8 px-2 py-1.5 rounded-lg text-left text-sm flex items-center gap-2 hover:bg-bg-200 hover:text-text-100 transition-colors disabled:opacity-40"
              >
                {state.isConvertingToTask ? (
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
                onClick={state.openOptionsPage}
                data-test-id="menu-item-settings"
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
                  onClick={() => setIsLanguageSubmenuOpen(!isLanguageSubmenuOpen)}
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
                        onClick={() => state.handleLanguageSelection(entry as SupportedLocale)}
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
              {!state.hasChatMessages ? (
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
