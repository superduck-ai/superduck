import { useRef } from 'react';
import { ArrowUp, Camera, CircleStop, Paperclip, Plus, X } from 'lucide-react';
import { MemoizedFormattedMessage } from '../../index-react-dom-intl';
import { useIntlSafe } from '../../index-react-dom-intl';
import { PromptService, type SavedPrompt as StoredSavedPrompt } from '../../extensionServices';

import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SimpleTooltip,
  Tooltip as StandardTooltip,
  TooltipContent as StandardTooltipContent,
  TooltipTrigger as StandardTooltipTrigger
} from '@/components/ui';
import { useUIStore } from '../stores/uiStore';
import { useChatStore } from '../stores/chatStore';
import { usePermissionStore } from '../stores/permissionStore';
import { useAttachmentStore } from '../stores/attachmentStore';
import { useChatActionsStore } from '../stores/chatActionsStore';
import { useChatInputStore } from '../stores/chatInputStore';
import { useSidepanelViewState } from '../contexts/SidepanelViewStateContext';
import { SidepanelBanners } from './SidepanelBanners';
import { ShortcutsMenu } from '../shortcutsMenu/ShortcutsMenu';
import { cursorAiSvg } from '../shortcutsMenu/assets';
import { InlineSvgIcon } from '../shortcutsMenu/icons';
import { RotatingTips } from '@/sidepanel/components/RotatingTips';
import { RichTextInput } from '@/sidepanel/components/RichTextInput';
import { PermissionModeMenu } from '@/sidepanel/components/PermissionModeMenu';

// ─── Component ──────────────────────────────────────────────────────────────

// All state is read from stores (avoid prop drilling).
export function ChatInputArea() {
  const intl = useIntlSafe();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commandMenuRef = useRef<HTMLDivElement>(null);

  // ─── Read state from chatInputStore (no prop drilling) ──────────────────
  const scrollRefs = useChatInputStore((s) => s.scrollRefs);
  const inputRef = useChatInputStore((s) => s.inputRef);
  const chatInputSurfaceClass = useChatInputStore((s) => s.chatInputSurfaceClass);
  const recordingState = useChatInputStore((s) => s.recordingState);
  const debugMode = useChatInputStore((s) => s.debugMode);
  const contextDebugInfo = useChatInputStore((s) => s.contextDebugInfo);
  const shouldDisableSkipPermissions = useChatInputStore((s) => s.shouldDisableSkipPermissions);
  const rotatingTips = useChatInputStore((s) => s.rotatingTips);
  const permissionModeMenuOptions = useChatInputStore((s) => s.permissionModeMenuOptions);

  // ─── Read state from Zustand stores (no prop drilling) ───────────────────
  const input = useChatStore((s) => s.input);
  const setInput = useChatStore((s) => s.setInput);
  const permissionMode = usePermissionStore((s) => s.permissionMode);
  const setPermissionMode = usePermissionStore((s) => s.setPermissionMode);
  const pendingAttachments = useAttachmentStore((s) => s.pendingAttachments);
  const removeAttachment = useAttachmentStore((s) => s.removeAttachment);
  const setPreviewAttachmentImage = useAttachmentStore((s) => s.setPreviewAttachmentImage);
  const attachmentCount = useAttachmentStore((s) => s.attachmentCount);
  const setShowWorkflowModeSelectionModal = useUIStore((s) => s.setShowWorkflowModeSelectionModal);
  const setPromptToSave = useUIStore((s) => s.setPromptToSave);
  const setPromptToEdit = useUIStore((s) => s.setPromptToEdit);
  const isPermissionMenuOpen = useUIStore((s) => s.isPermissionMenuOpen);
  const setIsPermissionMenuOpen = useUIStore((s) => s.setIsPermissionMenuOpen);
  const isActionsMenuOpen = useUIStore((s) => s.isActionsMenuOpen);
  const setIsActionsMenuOpen = useUIStore((s) => s.setIsActionsMenuOpen);
  const effectiveIsAgentRunning = useSidepanelViewState().effectiveIsAgentRunning;
  const commandMenuDismissedRef = useRef(false);
  const commandMenuDismissedInputRef = useRef('');

  // ─── Read callbacks from chatActionsStore (avoid prop drilling) ────────────
  const handlePaste = useChatActionsStore((s) => s.handlePaste);
  const submit = useChatActionsStore((s) => s.submit);
  const handleFileSelection = useChatActionsStore((s) => s.handleFileSelection);
  const captureCurrentTabScreenshot = useChatActionsStore((s) => s.captureCurrentTabScreenshot);
  const effectiveCancel = useChatActionsStore((s) => s.effectiveCancel);
  const sendPrompt = useChatActionsStore((s) => s.sendPrompt);
  const effectiveSendPrompt = useChatActionsStore((s) => s.effectiveSendPrompt);
  const insertShortcutChip = useChatActionsStore((s) => s.insertShortcutChip);
  const navigateActiveTabToUrl = useChatActionsStore((s) => s.navigateActiveTabToUrl);

  const showCommandMenu = useUIStore((state) => state.showCommandMenu);
  const setShowCommandMenu = useUIStore((state) => state.setShowCommandMenu);
  const commandSearchTerm = useUIStore((state) => state.commandSearchTerm);
  const setCommandSearchTerm = useUIStore((state) => state.setCommandSearchTerm);

  return (
    <div ref={scrollRefs.chatInput} className="relative mx-auto w-full">
      <div className="mx-0">
        <div className="bg-transparent">
          {/* Banner area — SidepanelBanners now reads from stores directly */}
          <SidepanelBanners />
          {/* Chat input — hidden when recording */}
          {!recordingState.isRecording && (
            <>
              <div className="relative z-30 block w-full">
                <div
                  data-chat-input-container="true"
                  className={cn(chatInputSurfaceClass, 'w-full')}
                  onClick={() => inputRef.current?.focus()}
                  onPaste={handlePaste}
                >
                  {pendingAttachments.length > 0 ? (
                    <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1">
                      {pendingAttachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="group relative h-16 w-16 cursor-pointer overflow-hidden rounded-md border border-border bg-muted"
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
                            className="h-full w-full object-cover"
                          />
                          <Button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeAttachment(attachment.id);
                            }}
                            variant="ghost"
                            size="icon-xs"
                            className="absolute top-0.5 right-0.5 size-5 rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 hover:text-white group-hover:opacity-100"
                            aria-label="Remove attachment"
                          >
                            <X size={10} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div
                    className={`min-h-[3.25rem] px-3.5 ${
                      showCommandMenu ? 'pt-3 pb-2' : 'pt-3.5 pb-2.5'
                    }`}
                  >
                    <div className="relative">
                      {/* Shortcuts menu */}
                      {showCommandMenu && (
                        <div ref={commandMenuRef} className="absolute bottom-full left-0">
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
                              const prompt = input.trim();
                              setShowCommandMenu(false);
                              setCommandSearchTerm('');
                              inputRef.current?.clear();
                              setInput('');
                              setPromptToSave({ prompt, scheduleEnabled: true });
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
                      {!input &&
                        !showCommandMenu &&
                        !isActionsMenuOpen &&
                        !isPermissionMenuOpen && <RotatingTips tips={rotatingTips} />}

                      <RichTextInput
                        ref={inputRef}
                        value={input}
                        onChange={setInput}
                        onSubmit={submit}
                        ariaLabel={intl.formatMessage({
                          defaultMessage: 'Message SuperDuck',
                          id: 'message_superduck'
                        })}
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
                    className={`superduck-composer-footer relative grid grid-cols-[minmax(0,1fr)_auto] items-center ${
                      showCommandMenu ? 'pb-2' : 'pb-2.5'
                    }`}
                  >
                    <div className="superduck-composer-control-group flex min-w-0 items-center">
                      <SimpleTooltip
                        tooltipContent={intl.formatMessage({
                          defaultMessage: 'Actions',
                          id: 'actions'
                        })}
                        side="top"
                      >
                        <DropdownMenu open={isActionsMenuOpen} onOpenChange={setIsActionsMenuOpen}>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setIsPermissionMenuOpen(false);
                                }}
                                variant="ghost"
                                size="icon-sm"
                                className="superduck-composer-icon-button"
                                aria-label={intl.formatMessage({
                                  defaultMessage: 'Actions',
                                  id: 'actions'
                                })}
                              />
                            }
                          >
                            <Plus className="superduck-composer-standard-icon" strokeWidth={1.8} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            className="w-max min-w-[176px]"
                            side="top"
                            align="start"
                            sideOffset={8}
                          >
                            <DropdownMenuItem
                              onClick={() => {
                                fileInputRef.current?.click();
                              }}
                              className="flex min-h-8 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm whitespace-nowrap transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
                            >
                              <Paperclip size={14} />
                              <span>
                                <MemoizedFormattedMessage
                                  defaultMessage="Upload image"
                                  id="upload_image"
                                />
                              </span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void captureCurrentTabScreenshot()}
                              className="flex min-h-8 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm whitespace-nowrap transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
                            >
                              <Camera size={14} />
                              <span>
                                <MemoizedFormattedMessage
                                  defaultMessage="Take a screenshot"
                                  id="take_a_screenshot"
                                />
                              </span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </SimpleTooltip>
                      <PermissionModeMenu
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
                        <span className="text-[11px] text-muted-foreground">
                          {attachmentCount} image(s)
                        </span>
                      ) : null}
                      {/* Debug mode: context usage indicator */}
                      {debugMode && contextDebugInfo && (
                        <StandardTooltip>
                          <StandardTooltipTrigger
                            render={
                              <span
                                className="relative inline-flex h-7 cursor-default items-center gap-1 rounded-md border border-border bg-card px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                role="status"
                                aria-label={`Context: ${contextDebugInfo.percentUsed}%`}
                              />
                            }
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
                                stroke="var(--border)"
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
                                    ? 'var(--destructive)'
                                    : 'var(--primary)'
                                }
                                className="transition-all duration-300"
                              />
                            </svg>
                            <span>{contextDebugInfo.percentUsed}%</span>
                          </StandardTooltipTrigger>

                          <StandardTooltipContent
                            className="z-[9999] rounded-md border border-border bg-popover px-3.5 py-2.5 text-popover-foreground shadow-md"
                            side="top"
                            sideOffset={8}
                          >
                            <div className="whitespace-nowrap text-left leading-relaxed text-[11px]">
                              <div className="mb-1.5 flex items-center gap-2 border-b border-border pb-1.5">
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
                                    stroke="var(--border)"
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
                                        ? 'var(--destructive)'
                                        : 'var(--primary)'
                                    }
                                  />
                                </svg>
                                <div>
                                  <div className="text-xs font-semibold">
                                    <span className="text-foreground">
                                      {contextDebugInfo.percentUsed}%
                                    </span>
                                    <span className="ml-1 font-normal text-muted-foreground">
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
                                    <div className="mt-px text-[10px] text-muted-foreground">
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
                              <div className="flex items-center gap-3 pl-9 text-muted-foreground">
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
                                <span className="text-border">|</span>
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
                                {contextDebugInfo.cacheTokens > 0 && (
                                  <>
                                    <span className="text-border">|</span>
                                    <span>
                                      {intl.formatMessage(
                                        {
                                          id: 'debug_cache_tokens',
                                          defaultMessage: 'Cache: {count}'
                                        },
                                        {
                                          count: contextDebugInfo.cacheTokens.toLocaleString()
                                        }
                                      )}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </StandardTooltipContent>
                        </StandardTooltip>
                      )}
                    </div>

                    <div className="superduck-composer-primary-actions flex shrink-0 items-center">
                      {/* Record workflow button */}
                      <SimpleTooltip
                        tooltipContent={intl.formatMessage({
                          defaultMessage: 'Record workflow',
                          id: 'record_workflow'
                        })}
                        side="top"
                      >
                        <Button
                          type="button"
                          data-test-id="teach-superduck-button"
                          onClick={() => {
                            setShowWorkflowModeSelectionModal(true);
                          }}
                          variant="ghost"
                          size="icon-sm"
                          className="superduck-composer-icon-button"
                          aria-label={intl.formatMessage({
                            defaultMessage: 'Record workflow',
                            id: 'record_workflow'
                          })}
                        >
                          <InlineSvgIcon
                            svg={cursorAiSvg}
                            className="superduck-composer-standard-icon"
                          />
                        </Button>
                      </SimpleTooltip>

                      {effectiveIsAgentRunning ? (
                        <Button
                          type="button"
                          data-test-id="stop-button"
                          onClick={() => effectiveCancel()}
                          variant="ghost"
                          size="icon-sm"
                          className="superduck-composer-icon-button"
                          aria-label={intl.formatMessage({
                            defaultMessage: 'Stop message',
                            id: 'stop_message'
                          })}
                          title={intl.formatMessage({
                            defaultMessage: 'Stop message',
                            id: 'stop_message'
                          })}
                        >
                          <CircleStop
                            className="superduck-composer-standard-icon"
                            strokeWidth={1.8}
                          />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          data-test-id="send-button"
                          onClick={submit}
                          disabled={
                            (!input.trim() && pendingAttachments.length === 0) ||
                            effectiveIsAgentRunning
                          }
                          variant="ghost"
                          size="icon-sm"
                          className="superduck-composer-primary-button bg-foreground/88 text-background shadow-none hover:bg-foreground hover:text-background disabled:bg-muted-foreground/45 disabled:text-background/85 disabled:opacity-100 dark:bg-foreground/75 dark:hover:bg-foreground/90 dark:disabled:bg-muted-foreground/45 dark:disabled:text-background/80"
                          aria-label={intl.formatMessage({
                            defaultMessage: 'Send message',
                            id: 'send_message'
                          })}
                          title={intl.formatMessage({
                            defaultMessage: 'Send message',
                            id: 'send_message'
                          })}
                        >
                          <ArrowUp className="superduck-composer-standard-icon" strokeWidth={2} />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div
                data-testid="ai-disclaimer"
                className="flex justify-center bg-transparent pt-2.5 text-muted-foreground/80"
              >
                <a
                  data-testid="ai-disclaimer-link"
                  href="https://superduck-ai.github.io/superduck/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-center text-xs leading-4 transition-colors hover:text-foreground"
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
    </div>
  );
}
