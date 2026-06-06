import React, { useRef, useState } from 'react';
import { BorderBeam } from 'border-beam';
import { ArrowUp, Camera, CircleStop, Paperclip, Plus, X } from 'lucide-react';
import { MemoizedFormattedMessage } from '../../index-react-dom-intl';
import { useIntlSafe } from '../../index-react-dom-intl';
import { PromptService, type SavedPrompt as StoredSavedPrompt } from '../../extensionServices';
import { ScrollToBottomButton } from './SidepanelSupportViews';
import { Tooltip } from '../Tooltip';
import { useUIStore } from '../stores';
import { SidepanelBanners } from './SidepanelBanners';
import { ShortcutsMenu } from '../ShortcutsMenu';
import { RotatingTips } from '../RotatingTips';
import { RichTextInput, type RichTextInputHandle } from '../RichTextInput';
import { PermissionModeMenu, type PermissionModeOption } from '../PermissionModeMenu';
import { CursorClickIcon } from '../icons';
import type { ScrollContainerHandle } from '../ScrollContainer';
import type { ModelFallbackConfig, ModelsConfigFeatureValue } from '../../extensionServices';
import type { AnnouncementConfig, NotificationPreference } from '../types';
import type { PermissionMode } from '../sidepanelUtils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChatInputAreaProps {
  // Refs
  scrollRefs: { chatInput: React.RefObject<HTMLDivElement | null> };
  autoScrollRef: React.RefObject<ScrollContainerHandle | null>;
  inputRef: React.RefObject<RichTextInputHandle | null>;
  sentinelElement: HTMLDivElement | null;

  // State
  input: string;
  selectedModel: string;
  permissionMode: PermissionMode;
  isChatInputBeamActive: boolean;
  chatInputSurfaceClass: string;
  pendingAttachments: Array<{
    id: string;
    fileName: string;
    mediaType: string;
    base64: string;
  }>;
  recordingState: { isRecording: boolean };
  debugMode: boolean;
  contextDebugInfo: {
    percentUsed: number;
    totalUsed: number;
    remaining: number;
    hasUsage: boolean;
    inputTokens: number;
    outputTokens: number;
  } | null;

  // Setters
  setInput: (value: string) => void;
  setPermissionMode: React.Dispatch<React.SetStateAction<PermissionMode>>;
  setPreviewAttachmentImage: (src: string | null) => void;
  setShowWorkflowModeSelectionModal: (show: boolean) => void;
  setPromptToEdit: (prompt: { id: string; prompt: string; command: string } | null) => void;

  // Callbacks
  handlePaste: (event: React.ClipboardEvent) => void;
  submit: () => void;
  removeAttachment: (id: string) => void;
  handleFileSelection: (files: FileList | null) => Promise<void>;
  captureCurrentTabScreenshot: () => Promise<void>;
  effectiveCancel: () => void;
  sendPrompt: (text: string) => Promise<void>;
  effectiveSendPrompt: (text: string) => Promise<void>;
  insertShortcutChip: (command: string, label: string) => void;
  navigateActiveTabToUrl: (url: string) => Promise<void>;

  // Banners props (passed through to SidepanelBanners)
  activeBanner: string | null;
  effectiveRuntimeError: string | null;
  effectiveClearError: () => void;
  setRuntimeError: React.Dispatch<React.SetStateAction<string | null>>;
  messageLimitBanner: {
    text: string;
    isBlocking: boolean;
    dismissible: boolean;
    actionLabel?: string;
    actionUrl?: string;
  } | null;
  setMessageLimitDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  setSkipWarningDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  setNotificationsEnabled: React.Dispatch<React.SetStateAction<NotificationPreference>>;
  setShowNotificationBanner: React.Dispatch<React.SetStateAction<boolean>>;
  announcementConfig: AnnouncementConfig;
  dismissAnnouncement: () => void;
  lastStopReason: { reason: string; messageId?: string } | null;
  fallbackConfig: ModelFallbackConfig | undefined;
  modelConfig: ModelsConfigFeatureValue;
  retryWithFallback: () => Promise<void>;
  sendRefusalFeedback: () => void;
  trackEvent: (event: string, properties?: Record<string, unknown>) => void;

  // Flags
  effectiveIsAgentRunning: boolean;
  shouldDisableSkipPermissions: boolean;
  attachmentCount: number;

  // Config
  rotatingTips: string[];
  permissionModeMenuOptions: PermissionModeOption[];
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ChatInputArea({
  scrollRefs,
  autoScrollRef,
  inputRef,
  sentinelElement,
  input,
  selectedModel,
  permissionMode,
  isChatInputBeamActive,
  chatInputSurfaceClass,
  pendingAttachments,
  recordingState,
  debugMode,
  contextDebugInfo,
  setInput,
  setPermissionMode,
  setPreviewAttachmentImage,
  setShowWorkflowModeSelectionModal,
  setPromptToEdit,
  handlePaste,
  submit,
  removeAttachment,
  handleFileSelection,
  captureCurrentTabScreenshot,
  effectiveCancel,
  sendPrompt,
  effectiveSendPrompt,
  insertShortcutChip,
  navigateActiveTabToUrl,
  activeBanner,
  effectiveRuntimeError,
  effectiveClearError,
  setRuntimeError,
  messageLimitBanner,
  setMessageLimitDismissed,
  setSkipWarningDismissed,
  setNotificationsEnabled,
  setShowNotificationBanner,
  announcementConfig,
  dismissAnnouncement,
  lastStopReason,
  fallbackConfig,
  modelConfig,
  retryWithFallback,
  sendRefusalFeedback,
  trackEvent,
  effectiveIsAgentRunning,
  shouldDisableSkipPermissions,
  attachmentCount,
  rotatingTips,
  permissionModeMenuOptions
}: ChatInputAreaProps) {
  const intl = useIntlSafe();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commandMenuRef = useRef<HTMLDivElement>(null);
  const permissionMenuRef = useRef<HTMLDivElement>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const debugTooltipRef = useRef<HTMLSpanElement>(null);
  const commandMenuDismissedRef = useRef(false);
  const commandMenuDismissedInputRef = useRef('');

  // Internal state
  const [isPermissionMenuOpen, setIsPermissionMenuOpen] = React.useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = React.useState(false);
  const showCommandMenu = useUIStore((state) => state.showCommandMenu);
  const setShowCommandMenu = useUIStore((state) => state.setShowCommandMenu);
  const commandSearchTerm = useUIStore((state) => state.commandSearchTerm);
  const setCommandSearchTerm = useUIStore((state) => state.setCommandSearchTerm);

  return (
    <div ref={scrollRefs.chatInput} className="sticky bottom-0 mx-auto w-full z-[5]">
      <div className="mx-3 md:mx-0">
        {/* Scroll-to-bottom button */}
        <ScrollToBottomButton
          autoscrollRef={autoScrollRef}
          sentinelElement={sentinelElement}
          isStreaming={effectiveIsAgentRunning}
        />
        <div className="bg-bg-100">
          {/* Banner area — matches bundle placement inside input area */}
          <SidepanelBanners
            activeBanner={activeBanner as any}
            effectiveRuntimeError={effectiveRuntimeError}
            effectiveClearError={effectiveClearError}
            setRuntimeError={setRuntimeError}
            messageLimitBanner={messageLimitBanner}
            setMessageLimitDismissed={setMessageLimitDismissed}
            setSkipWarningDismissed={setSkipWarningDismissed}
            setNotificationsEnabled={setNotificationsEnabled as any}
            setShowNotificationBanner={setShowNotificationBanner}
            announcementConfig={announcementConfig}
            dismissAnnouncement={dismissAnnouncement}
            lastStopReason={lastStopReason}
            fallbackConfig={fallbackConfig}
            selectedModel={selectedModel}
            modelConfig={modelConfig}
            retryWithFallback={retryWithFallback}
            sendRefusalFeedback={sendRefusalFeedback}
            trackEvent={trackEvent}
          />
          {/* Chat input — hidden when fallback card is shown or when recording */}
          {!(lastStopReason?.reason === 'refusal' && fallbackConfig) &&
            !recordingState.isRecording && (
              <>
                <BorderBeam
                  size="line"
                  colorVariant="ocean"
                  theme="auto"
                  duration={2.8}
                  strength={0.6}
                  brightness={1.1}
                  saturation={0.9}
                  hueRange={20}
                  active={isChatInputBeamActive}
                  borderRadius={16}
                  className="relative z-30 block w-full rounded-2xl !overflow-visible"
                >
                  <div
                    data-chat-input-container="true"
                    className={chatInputSurfaceClass}
                    onClick={() => inputRef.current?.focus()}
                    onPaste={handlePaste}
                  >
                    {pendingAttachments.length > 0 ? (
                      <div className="px-4 pt-3 pb-1 flex flex-wrap gap-2">
                        {pendingAttachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className="relative group w-16 h-16 rounded-lg overflow-hidden border border-border-300 bg-bg-100 cursor-pointer"
                            onClick={(event) => {
                              event.stopPropagation();
                              setPreviewAttachmentImage(
                                `data:${attachment.mediaType};base64,${attachment.base64}`
                              );
                            }}
                          >
                            <img
                              src={`data:${attachment.mediaType};base64,${attachment.base64}`}
                              alt={attachment.fileName}
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                removeAttachment(attachment.id);
                              }}
                              className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              aria-label="Remove attachment"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className={`px-4 ${showCommandMenu ? 'pt-3 pb-1' : 'pt-4 pb-2'}`}>
                      <div className="relative">
                        {/* Shortcuts menu */}
                        {showCommandMenu && (
                          <div ref={commandMenuRef}>
                            <ShortcutsMenu
                              searchTerm={commandSearchTerm}
                              onSelect={async (command, label) => {
                                commandMenuDismissedRef.current = true;
                                commandMenuDismissedInputRef.current = input;

                                // Close menu first to prevent reopening
                                setShowCommandMenu(false);
                                setCommandSearchTerm('');

                                // Check if it's a system command (like 'compact')
                                if (command === 'compact') {
                                  setInput('');
                                  inputRef.current?.clear();
                                  await sendPrompt('/compact');
                                  return;
                                }

                                let savedPrompt: StoredSavedPrompt | undefined;
                                try {
                                  savedPrompt = await PromptService.getPromptByCommand(command);
                                } catch (error) {
                                  console.error('Failed to load shortcut:', error);
                                }

                                if (!savedPrompt) {
                                  insertShortcutChip(command, label ?? command);
                                  return;
                                }

                                const promptType = savedPrompt.type || 'shortcut';

                                switch (promptType) {
                                  case 'command':
                                    // Execute immediately using the selected prompt text.
                                    inputRef.current?.clear();
                                    setInput('');
                                    await effectiveSendPrompt(savedPrompt.prompt);
                                    break;

                                  case 'module':
                                    if (savedPrompt.url) {
                                      await navigateActiveTabToUrl(savedPrompt.url);
                                    }
                                    setInput('');
                                    break;

                                  case 'shortcut':
                                  default:
                                    insertShortcutChip(command, label ?? command);
                                    break;
                                }
                              }}
                              onRecordWorkflow={() => {
                                setShowCommandMenu(false);
                                setCommandSearchTerm('');
                                setInput('');
                                setShowWorkflowModeSelectionModal(true);
                              }}
                              onScheduleTask={() => {
                                setShowCommandMenu(false);
                                setCommandSearchTerm('');
                                setInput('');
                                // TODO: Open schedule task modal
                                console.log('Schedule task clicked');
                              }}
                              onEditShortcut={(shortcut) => {
                                setShowCommandMenu(false);
                                setCommandSearchTerm('');
                                inputRef.current?.clear();
                                setPromptToEdit({
                                  id: shortcut.id,
                                  prompt: shortcut.prompt,
                                  command: shortcut.command ?? ''
                                });
                              }}
                              onClose={() => {
                                commandMenuDismissedRef.current = true;
                                commandMenuDismissedInputRef.current = input;
                                setShowCommandMenu(false);
                                setCommandSearchTerm('');
                              }}
                            />
                          </div>
                        )}

                        {/* Rotating tips - only when input is empty and no command menu */}
                        {!input && !showCommandMenu && <RotatingTips tips={rotatingTips} />}

                        <RichTextInput
                          ref={inputRef}
                          value={input}
                          onChange={setInput}
                          onSubmit={submit}
                          placeholder=""
                          disabled={false}
                        />
                      </div>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        void handleFileSelection(event.target.files);
                        event.target.value = '';
                      }}
                    />

                    <div
                      className={`relative flex items-center justify-between px-3 ${
                        showCommandMenu ? 'pb-2' : 'pb-3'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <PermissionModeMenu
                          menuRef={permissionMenuRef}
                          permissionMode={permissionMode as any}
                          options={permissionModeMenuOptions}
                          isOpen={isPermissionMenuOpen}
                          onOpenChange={(open) => {
                            if (open) setIsActionsMenuOpen(false);
                            setIsPermissionMenuOpen(open);
                          }}
                          onSelect={(mode) => setPermissionMode(mode as any)}
                          showBlockedSkipHint={shouldDisableSkipPermissions}
                        />
                        {attachmentCount > 0 ? (
                          <span className="text-[11px] text-text-300">
                            {attachmentCount} image(s)
                          </span>
                        ) : null}
                        {/* Debug mode: context usage indicator */}
                        {debugMode && contextDebugInfo && (
                          <span
                            className="relative inline-flex items-center gap-1 h-7 rounded-lg border border-border-300 bg-bg-000 px-1.5 text-[11px] text-text-200 hover:bg-bg-200 transition-colors cursor-default"
                            role="status"
                            aria-label={`Context: ${contextDebugInfo.percentUsed}%`}
                            onMouseEnter={() => {
                              const el = debugTooltipRef.current;
                              if (el) {
                                el.style.opacity = '1';
                                el.style.visibility = 'visible';
                                el.style.transform = 'translateX(-50%) scale(1)';
                              }
                            }}
                            onMouseLeave={() => {
                              const el = debugTooltipRef.current;
                              if (el) {
                                el.style.opacity = '0';
                                el.style.visibility = 'hidden';
                                el.style.transform = 'translateX(-50%) scale(0.95)';
                              }
                            }}
                          >
                            <svg
                              viewBox="0 0 16 16"
                              width="14"
                              height="14"
                              className="-rotate-90 shrink-0"
                            >
                              <circle
                                cx="8"
                                cy="8"
                                r="6"
                                fill="none"
                                stroke="hsl(var(--border-300))"
                                strokeWidth="2"
                              />
                              <circle
                                cx="8"
                                cy="8"
                                r="6"
                                fill="none"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeDasharray={`${(contextDebugInfo.percentUsed * 37.7) / 100} 37.7`}
                                stroke={
                                  contextDebugInfo.percentUsed >= 90
                                    ? 'hsl(var(--danger-100))'
                                    : contextDebugInfo.percentUsed >= 70
                                      ? 'hsl(var(--warning-100))'
                                      : 'hsl(var(--accent-secondary-100))'
                                }
                                className="transition-all duration-300"
                              />
                            </svg>
                            <span>{contextDebugInfo.percentUsed}%</span>
                            {/* Hover popup — ref-controlled to avoid re-renders */}
                            <span
                              ref={debugTooltipRef}
                              className="absolute bottom-full left-1/2 mb-2 rounded-xl pointer-events-none transition-all duration-150 z-[9999] bg-bg-000 border border-border-300 shadow-xl px-3.5 py-2.5 text-text-100"
                              role="tooltip"
                              style={{
                                opacity: 0,
                                visibility: 'hidden',
                                transform: 'translateX(-50%) scale(0.95)'
                              }}
                            >
                              <div className="whitespace-nowrap text-left leading-relaxed text-[11px]">
                                <div className="flex items-center gap-2 pb-1.5 mb-1.5 border-b border-border-300/10">
                                  <svg
                                    viewBox="0 0 16 16"
                                    width="28"
                                    height="28"
                                    className="-rotate-90 shrink-0"
                                  >
                                    <circle
                                      cx="8"
                                      cy="8"
                                      r="6.5"
                                      fill="none"
                                      stroke="hsl(var(--border-300) / 15%)"
                                      strokeWidth="1.5"
                                    />
                                    <circle
                                      cx="8"
                                      cy="8"
                                      r="6.5"
                                      fill="none"
                                      strokeWidth="1.5"
                                      strokeLinecap="round"
                                      strokeDasharray={`${(contextDebugInfo.percentUsed * 40.84) / 100} 40.84`}
                                      stroke={
                                        contextDebugInfo.percentUsed >= 90
                                          ? 'hsl(var(--danger-100))'
                                          : contextDebugInfo.percentUsed >= 70
                                            ? 'hsl(var(--warning-100))'
                                            : 'hsl(var(--accent-secondary-100))'
                                      }
                                    />
                                  </svg>
                                  <div>
                                    <div className="text-xs font-semibold">
                                      <span className="text-text-100">
                                        {contextDebugInfo.percentUsed}%
                                      </span>
                                      <span className="font-normal text-text-400 ml-1">
                                        {intl.formatMessage(
                                          {
                                            id: 'debug_tokens_used',
                                            defaultMessage: 'Used: {used}'
                                          },
                                          {
                                            used: contextDebugInfo.totalUsed.toLocaleString()
                                          }
                                        )}
                                      </span>
                                    </div>
                                    {contextDebugInfo.hasUsage && (
                                      <div className="text-[10px] text-text-500 mt-px">
                                        {intl.formatMessage(
                                          {
                                            id: 'debug_tokens_remaining',
                                            defaultMessage: 'Remaining: {remaining} ({percent}%)'
                                          },
                                          {
                                            remaining: contextDebugInfo.remaining.toLocaleString(),
                                            percent: 100 - contextDebugInfo.percentUsed
                                          }
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 text-text-500 pl-9">
                                  <span>
                                    {intl.formatMessage(
                                      {
                                        id: 'debug_input_tokens',
                                        defaultMessage: 'In: {count}'
                                      },
                                      {
                                        count: contextDebugInfo.inputTokens.toLocaleString()
                                      }
                                    )}
                                  </span>
                                  <span className="text-border-300/20">|</span>
                                  <span>
                                    {intl.formatMessage(
                                      {
                                        id: 'debug_output_tokens',
                                        defaultMessage: 'Out: {count}'
                                      },
                                      {
                                        count: contextDebugInfo.outputTokens.toLocaleString()
                                      }
                                    )}
                                  </span>
                                </div>
                              </div>
                            </span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Teach SuperDuck button */}
                        <Tooltip
                          tooltipContent={intl.formatMessage({
                            defaultMessage: 'Teach SuperDuck',
                            id: 'teach_superduck'
                          })}
                          side="top"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setShowWorkflowModeSelectionModal(true);
                            }}
                            className="inline-flex items-center justify-center relative shrink-0 select-none font-medium h-7 w-7 rounded-lg active:scale-95 transition-all duration-200 text-text-300 hover:text-text-200 hover:bg-bg-200"
                            aria-label={intl.formatMessage({
                              defaultMessage: 'Teach SuperDuck',
                              id: 'teach_superduck'
                            })}
                          >
                            <CursorClickIcon size={12} />
                          </button>
                        </Tooltip>

                        <Tooltip
                          tooltipContent={intl.formatMessage({
                            defaultMessage: 'Actions',
                            id: 'actions'
                          })}
                          side="top"
                        >
                          <div ref={actionsMenuRef} className="relative">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setIsPermissionMenuOpen(false);
                                setIsActionsMenuOpen((value) => !value);
                              }}
                              className="inline-flex items-center justify-center relative shrink-0 select-none font-medium h-7 w-7 rounded-lg active:scale-95 transition-all duration-200 text-text-300 hover:text-text-200 hover:bg-bg-200"
                              aria-label={intl.formatMessage({
                                defaultMessage: 'Actions',
                                id: 'actions'
                              })}
                            >
                              <Plus size={12} />
                            </button>
                            {isActionsMenuOpen ? (
                              <div className="absolute right-0 bottom-full mb-2 z-50 w-max min-w-[176px] bg-bg-000 border-0.5 border-border-200 backdrop-blur-xl rounded-xl text-text-300 shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] p-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsActionsMenuOpen(false);
                                    fileInputRef.current?.click();
                                  }}
                                  className="w-full min-h-8 px-2 py-1.5 rounded-lg text-left text-sm flex items-center gap-2 hover:bg-bg-200 hover:text-text-100 transition-colors whitespace-nowrap"
                                >
                                  <Paperclip size={14} />
                                  <span>
                                    <MemoizedFormattedMessage
                                      defaultMessage="Upload image"
                                      id="upload_image"
                                    />
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void captureCurrentTabScreenshot()}
                                  className="w-full min-h-8 px-2 py-1.5 rounded-lg text-left text-sm flex items-center gap-2 hover:bg-bg-200 hover:text-text-100 transition-colors whitespace-nowrap"
                                >
                                  <Camera size={14} />
                                  <span>
                                    <MemoizedFormattedMessage
                                      defaultMessage="Take a screenshot"
                                      id="take_a_screenshot"
                                    />
                                  </span>
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </Tooltip>

                        {effectiveIsAgentRunning ? (
                          <button
                            type="button"
                            data-test-id="stop-button"
                            onClick={() => effectiveCancel()}
                            className="inline-flex items-center justify-center relative shrink-0 select-none font-medium h-7 w-7 rounded-lg active:scale-95 text-text-300 hover:text-text-200 hover:bg-bg-200 transition-colors"
                            aria-label={intl.formatMessage({
                              defaultMessage: 'Stop message',
                              id: 'stop_message'
                            })}
                            title={intl.formatMessage({
                              defaultMessage: 'Stop message',
                              id: 'stop_message'
                            })}
                          >
                            <CircleStop size={14} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            data-test-id="send-button"
                            onClick={submit}
                            disabled={
                              (!input.trim() && pendingAttachments.length === 0) ||
                              effectiveIsAgentRunning
                            }
                            className={
                              'inline-flex items-center justify-center relative shrink-0 select-none disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none disabled:drop-shadow-none font-medium transition-colors h-7 w-7 rounded-lg active:scale-95 ' +
                              (permissionMode === 'skip_all_permission_checks'
                                ? 'bg-[#BF8534] hover:bg-[#A06F2C] text-white'
                                : 'bg-accent-main-000 hover:bg-accent-main-200 text-oncolor-100')
                            }
                            aria-label={intl.formatMessage({
                              defaultMessage: 'Send message',
                              id: 'send_message'
                            })}
                            title={intl.formatMessage({
                              defaultMessage: 'Send message',
                              id: 'send_message'
                            })}
                          >
                            <ArrowUp size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </BorderBeam>
                <div className="flex justify-center py-1.5 text-text-500 bg-bg-100">
                  <a
                    href="https://superduck-ai.github.io/superduck/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] hover:text-text-300 transition-colors text-center"
                  >
                    <MemoizedFormattedMessage
                      defaultMessage="SuperDuck is AI and can make mistakes. Please double-check responses."
                      id="ai_can_make_mistakes_please_doublecheck_responses"
                    />
                  </a>
                </div>
              </>
            )}
        </div>
      </div>
      <div className="bg-bg-100 h-0.5" />
    </div>
  );
}
