import {
  ChevronDown,
  Clock,
  MessageSquarePlus,
  MoreHorizontal,
  Languages,
  Loader2,
  Settings2,
  Workflow,
  Zap
} from 'lucide-react';
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
import { useSidepanelViewState } from '../contexts/SidepanelViewStateContext';
import { SessionHistoryPanel } from '../session/SessionHistoryPanel';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SimpleTooltip
} from '@/components/ui';

export function SidepanelHeader() {
  const state = useSidepanelViewState();
  const intl = useIntlSafe();

  // ─── Read state from Zustand stores (no prop drilling) ───────────────────
  const isModelMenuOpen = useUIStore((s) => s.isModelMenuOpen);
  const setIsModelMenuOpen = useUIStore((s) => s.setIsModelMenuOpen);
  const isHeaderMenuOpen = useUIStore((s) => s.isHeaderMenuOpen);
  const setIsHeaderMenuOpen = useUIStore((s) => s.setIsHeaderMenuOpen);
  const isLanguageSubmenuOpen = useUIStore((s) => s.isLanguageSubmenuOpen);
  const setIsLanguageSubmenuOpen = useUIStore((s) => s.setIsLanguageSubmenuOpen);
  const setPurlModeToggle = useUIStore((s) => s.setPurlModeToggle);
  const { locale } = usePreferredLocale();

  return (
    <header className="sticky top-0 z-50 flex shrink-0 items-center justify-between bg-background/60 px-4 py-2 backdrop-blur-md transition-all duration-200">
      <div className="flex items-center gap-3">
        <DropdownMenu open={isModelMenuOpen} onOpenChange={setIsModelMenuOpen}>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="group flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-foreground/85 transition-all duration-150 hover:bg-muted/45 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/45"
                onClick={() => {
                  setIsHeaderMenuOpen(false);
                  setIsLanguageSubmenuOpen(false);
                }}
                aria-label={intl.formatMessage({
                  defaultMessage: 'Select model',
                  id: 'select_model'
                })}
              />
            }
          >
            <span className="flex items-center gap-1.5 font-sans">
              <span className="text-[13px] font-medium leading-5 tracking-[-0.1px]">
                {state.selectedModelLabel}
              </span>
              <ChevronDown
                size={12}
                className="text-muted-foreground/75 transition-transform duration-200 group-aria-expanded:rotate-180"
              />
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="max-h-60 min-w-[240px] overflow-y-auto"
            align="start"
            sideOffset={8}
          >
            <DropdownMenuRadioGroup
              value={state.effectiveSelectedModel}
              onValueChange={(val) => state.handleModelChange(val)}
            >
              {state.normalizedModelOptions.map((option) => (
                <DropdownMenuRadioItem
                  key={option.value}
                  value={option.value}
                  className="flex min-h-8 w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted hover:text-foreground"
                >
                  <span className="flex-1">{option.label}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex items-center gap-1">
        {state.purlModeFeatureEnabled && (
          <SimpleTooltip tooltipContent="Quick mode" side="bottom">
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
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 ${
                state.isPurlMode
                  ? 'bg-warning/10 text-warning hover:bg-warning/20'
                  : 'text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground'
              } ${state.effectiveIsAgentRunning ? 'opacity-40 cursor-not-allowed' : ''}`}
              aria-label="Toggle quick mode"
              data-test-id={state.isPurlMode ? 'lightning-mode-active' : 'lightning-mode-inactive'}
            >
              <Zap
                size={16}
                fill={state.isPurlMode ? 'currentColor' : 'none'}
                className="transition-transform duration-300 hover:scale-105"
              />
            </button>
          </SimpleTooltip>
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
        <Popover open={state.showHistoryPanel} onOpenChange={state.setShowHistoryPanel}>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/85 transition-all duration-150 hover:bg-muted/45 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/45 data-[popup-open]:bg-muted/55 data-[popup-open]:text-foreground"
                aria-label={intl.formatMessage({ defaultMessage: 'History', id: 'history' })}
                title={intl.formatMessage({ defaultMessage: 'History', id: 'history' })}
              />
            }
          >
            <Clock size={16} className="transition-transform duration-200 hover:rotate-12" />
          </PopoverTrigger>
          <PopoverContent
            className="w-[min(290px,calc(100vw-1.5rem))] p-0 backdrop-blur-md"
            align="end"
            sideOffset={8}
          >
            <SessionHistoryPanel
              isOpen={state.showHistoryPanel}
              onClose={() => state.setShowHistoryPanel(false)}
              onLoadSession={state.handleLoadHistorySession}
              activeSessionId={state.activeSessionId}
            />
          </PopoverContent>
        </Popover>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/85 transition-all duration-150 hover:bg-muted/45 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/45"
          onClick={state.clearConversation}
          aria-label={intl.formatMessage({ defaultMessage: 'Clear chat', id: 'clear_chat' })}
          title={intl.formatMessage({ defaultMessage: 'Clear chat', id: 'clear_chat' })}
        >
          <MessageSquarePlus
            size={16}
            className="transition-transform duration-200 hover:scale-105"
          />
        </button>
        <DropdownMenu open={isHeaderMenuOpen} onOpenChange={setIsHeaderMenuOpen}>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/85 transition-all duration-150 hover:bg-muted/45 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/45 data-[popup-open]:bg-muted/55 data-[popup-open]:text-foreground"
                onClick={() => {
                  setIsModelMenuOpen(false);
                }}
                aria-label={intl.formatMessage({ defaultMessage: 'Menu', id: 'menu' })}
                title={intl.formatMessage({ defaultMessage: 'Menu', id: 'menu' })}
                data-test-id="header-menu-toggle"
              />
            }
          >
            <MoreHorizontal
              size={16}
              className="transition-transform duration-200 hover:scale-105"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[240px]" align="end" sideOffset={8}>
            <DropdownMenuItem
              onClick={state.handleConvertToScheduledTask}
              disabled={
                state.isConvertingToTask ||
                state.effectiveIsAgentRunning ||
                (!state.hasChatMessages && !state.input.trim())
              }
              className="flex min-h-8 w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              {state.isConvertingToTask ? (
                <Loader2 size={16} className="animate-spin shrink-0" />
              ) : (
                <Workflow size={16} className="shrink-0" />
              )}
              <span className="flex-1">
                <MemoizedFormattedMessage defaultMessage="Convert to task" id="convert_to_task" />
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={state.openOptionsPage}
              data-test-id="menu-item-settings"
              className="flex min-h-8 w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted hover:text-foreground"
            >
              <Settings2 size={16} className="shrink-0" />
              <span className="flex-1">
                <MemoizedFormattedMessage defaultMessage="Settings" id="settings" />
              </span>
            </DropdownMenuItem>

            <DropdownMenuSub open={isLanguageSubmenuOpen} onOpenChange={setIsLanguageSubmenuOpen}>
              <DropdownMenuSubTrigger className="flex min-h-8 w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted hover:text-foreground">
                <Languages size={16} className="shrink-0" />
                <span className="flex-1">
                  <MemoizedFormattedMessage defaultMessage="Language" id="language" />
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-auto min-w-[120px]">
                <DropdownMenuRadioGroup
                  value={locale}
                  onValueChange={(val) => state.handleLanguageSelection(val as SupportedLocale)}
                >
                  {SUPPORTED_LOCALES.map((entry) => (
                    <DropdownMenuRadioItem
                      key={entry}
                      value={entry}
                      className="flex min-h-8 w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <span className="flex-1 whitespace-nowrap">
                        {LOCALE_DISPLAY_NAMES[entry]}
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {!state.hasChatMessages ? (
              <>
                <DropdownMenuSeparator />
                <p className="px-2 py-1.5 text-[11px] text-muted-foreground select-none">
                  <MemoizedFormattedMessage
                    defaultMessage="Start a chat to convert it into a task."
                    id="start_a_chat_to_convert_it_into_a"
                  />
                </p>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
