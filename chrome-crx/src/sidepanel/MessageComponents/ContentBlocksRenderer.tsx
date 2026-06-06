import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Copy, ThumbsDown, ThumbsUp } from 'lucide-react';
import {
  createStandardMarkdownComponents,
  preprocessMarkdownText,
  STANDARD_MARKDOWN_GRID_CLASS,
  useMathPlugins,
  buildRemarkPlugins,
  buildRehypePlugins
} from '../components/MarkdownComponents';
import { MemoizedFormattedMessage, useIntlSafe } from '../../index-react-dom-intl';
import {
  isImageContentBlock,
  isRecord,
  isTextContentBlock,
  isToolResultContentBlock,
  isToolUseContentBlock
} from '../../messageTypes';
import type {
  ApiConversationMessage,
  ApiMessageBlock,
  ApiTextContentBlock,
  ApiToolResultBlock,
  ApiToolUseBlock
} from '../../messageTypes';
import { trackEvent } from '../../mcpRuntime';
import { PromptService } from '../../extensionServices';
import { getDomainDisplayName } from '../planMode';
import type { PlanStructure } from '../planMode';
import {
  BROWSER_TOOLS,
  MCP_TOOL_REGEX,
  asFormatMessageLike,
  formatStepCountLabel,
  getToolDisplayInfo,
  getToolDisplayName,
  resolveToolIcon,
  resolveToolNameIcon
} from '../toolDisplay';
import {
  Badge,
  CollapsibleToolUseRow,
  TIMELINE_ANIM_DURATION,
  TIMELINE_SNAPPY_OUT,
  TimelineGroupItem,
  ToolUseRow,
  WebFetchToolCell,
  WebSearchToolCell
} from '../ToolViews';
import { ShimmerText } from '../StatusDisplay';
import { Tooltip } from '../Tooltip';
import { useUIStore } from '../stores';
import { ConversationSummary } from '../MessageViews';
import { getTextFromBlockContent, getBase64ImageBlocks } from '../sidepanelUtils';
import { StreamingTextBlock, UserMessageRow } from './index';
import type {
  MessageGroup,
  StreamingTextStore,
  ToolInputRecord,
  ToolResultDisplayContent
} from '../types';
import {
  ChecklistIcon,
  EqualizerIcon,
  GlobeIcon,
  InfoCircleIcon,
  PlatformModifierKey,
  ReturnKeyIcon
} from '../icons';

// ─── Helper functions ─────────────────────────────────────────────────────────

export function getStringField(
  input: ToolInputRecord | undefined,
  field: string
): string | undefined {
  return input && typeof input[field] === 'string' ? input[field] : undefined;
}

// ─── Permission Action Button ─────────────────────────────────────────────────

export function PermissionActionButton({
  onClick,
  children,
  isPrimary,
  isActive
}: {
  onClick: () => void;
  children: React.ReactNode;
  isPrimary?: boolean;
  isActive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'w-full font-base flex min-w-[75px] px-[14px] py-[3px] justify-between items-center gap-2 rounded-lg border-[0.5px] transition-colors font-medium h-9 ' +
        (isActive
          ? 'text-text-100 bg-bg-300 border-border-400'
          : isPrimary
            ? 'bg-text-000 text-bg-000 border-text-000 hover:bg-text-100'
            : 'text-text-100 border-border-200 hover:bg-bg-100')
      }
    >
      {children}
    </button>
  );
}

// ─── PlanApprovalModal — bundle's Ny component ───

export function PlanApprovalModal({
  planStructure,
  onApprove,
  onReject,
  isReadOnly = false,
  onClose
}: {
  planStructure: PlanStructure;
  onApprove: () => void;
  onReject: () => void;
  isReadOnly?: boolean;
  onClose?: () => void;
}) {
  const intl = useIntlSafe();
  const [activeButton, setActiveButton] = useState<string | null>(null);

  const handleApprove = useCallback(() => {
    onApprove();
  }, [onApprove]);

  const handleReject = useCallback(() => {
    onReject();
  }, [onReject]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && isReadOnly && onClose) {
        onClose();
      }
    },
    [isReadOnly, onClose]
  );

  useEffect(() => {
    if (isReadOnly) {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && onClose) onClose();
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    } else {
      const handler = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          setActiveButton('reject');
          setTimeout(() => handleReject(), 150);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          setActiveButton('approve');
          setTimeout(() => handleApprove(), 150);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setActiveButton('reject');
          setTimeout(() => handleReject(), 150);
        }
      };
      window.addEventListener('keydown', handler, true);
      return () => window.removeEventListener('keydown', handler, true);
    }
  }, [handleApprove, handleReject, isReadOnly, onClose]);

  const { domains = [], approach = [] } = planStructure;

  const modalContent = (
    <div className="bg-bg-000 rounded-[14px]">
      {/* Header */}
      <div className="flex items-center justify-between py-[10px] px-4">
        <div className="flex items-center gap-2">
          <ChecklistIcon size={20} className="text-text-100" />
          <h3 className="font-base text-text-100">
            <MemoizedFormattedMessage id="superducks_plan" defaultMessage="SuperDuck's plan" />
          </h3>
        </div>
        {isReadOnly && onClose && (
          <button
            onClick={onClose}
            className="text-text-400 hover:text-text-200 transition-colors duration-200 p-1 rounded-md hover:bg-bg-200"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M15 5L5 15M5 5L15 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border-300" />

      {/* Content */}
      <div className="px-4 py-3 space-y-4 max-h-[40vh] overflow-y-auto">
        {/* Domains section */}
        {domains.length > 0 && (
          <div>
            <p className="font-small text-text-400 mb-2">
              <MemoizedFormattedMessage
                id="allow_actions_on_these_sites"
                defaultMessage="Allow actions on these sites"
              />
            </p>
            <div className="space-y-2">
              {domains.map((domain, index) => {
                const name = getDomainDisplayName(domain);
                const isForceAsk = typeof domain !== 'string' && domain.category === 'category3';
                return (
                  <div key={index} className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                      <GlobeIcon size={16} className="text-text-400" />
                    </span>
                    <span className="font-base text-text-100">{name}</span>
                    {isForceAsk && (
                      <Tooltip
                        tooltipContent={intl.formatMessage({
                          id: 'you_must_approve_any_superduck_action_on_this',
                          defaultMessage: 'You must approve any SuperDuck action on this site'
                        })}
                        side="top"
                      >
                        <span className="flex-shrink-0 cursor-help">
                          <InfoCircleIcon size={14} className="text-text-400" />
                        </span>
                      </Tooltip>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Approach section */}
        {approach.length > 0 && (
          <div>
            <p className="font-small text-text-400 mb-2">
              <MemoizedFormattedMessage
                id="approach_to_follow"
                defaultMessage="Approach to follow"
              />
            </p>
            <div className="space-y-2">
              {approach.map((step, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full border-border-300 border-0.5 flex items-center justify-center text-xs text-text-400">
                    {index + 1}
                  </span>
                  <span className="font-base text-text-100">{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons (only when not read-only) */}
      {!isReadOnly && (
        <div className="px-3 py-[10px] space-y-[5px] mt-[10px]">
          <PermissionActionButton
            onClick={handleApprove}
            isPrimary
            isActive={activeButton === 'approve'}
          >
            <span>
              <MemoizedFormattedMessage id="approve_plan" defaultMessage="Approve plan" />
            </span>
            <ReturnKeyIcon className="text-text-500" />
          </PermissionActionButton>
          <PermissionActionButton onClick={handleReject} isActive={activeButton === 'reject'}>
            <span>
              <MemoizedFormattedMessage id="make_changes" defaultMessage="Make changes" />
            </span>
            <span className="flex items-center gap-0.5">
              <PlatformModifierKey className="text-text-500" />
              <ReturnKeyIcon className="text-text-500" />
            </span>
          </PermissionActionButton>
          <p className="font-small text-text-500 pt-1 px-1">
            <MemoizedFormattedMessage
              id="superduck_will_only_use_the_sites_listed_youll"
              defaultMessage="SuperDuck will only use the sites listed. You'll be asked before accessing anything else."
            />
          </p>
        </div>
      )}
    </div>
  );

  if (isReadOnly) {
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        onClick={handleBackdropClick}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" />
        <div className="relative max-w-lg w-full animate-modal-enter">{modalContent}</div>
      </div>
    );
  }

  return modalContent;
}

// ─── UpdatePlanCell — bundle's ov component (full version with portal and modal) ───

export const UpdatePlanCell = React.memo(function UpdatePlanCell({
  input,
  toolResult,
  renderMode = 'Standard' as 'Standard' | 'TimelineGroup',
  isFirstBlockOfMessage,
  isLastBlockOfMessage,
  isFirstItemInGroup,
  isLastItemInGroup,
  isStreaming
}: {
  input?: ToolInputRecord;
  toolResult?: ApiToolResultBlock;
  renderMode?: 'Standard' | 'TimelineGroup';
  isFirstBlockOfMessage?: boolean;
  isLastBlockOfMessage?: boolean;
  isFirstItemInGroup?: boolean;
  isLastItemInGroup?: boolean;
  isStreaming?: boolean;
}) {
  const intl = useIntlSafe();
  const [showModal, setShowModal] = useState(false);

  // Get or create the modal portal element
  const portalElement = useMemo(() => {
    let el = document.getElementById('modal-portal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'modal-portal';
      document.body.appendChild(el);
    }
    return el;
  }, []);

  // Parse plan structure from input
  const planStructure = useMemo<PlanStructure | null>(() => {
    if (!input) return null;
    return {
      domains: Array.isArray(input.domains)
        ? input.domains.filter((domain): domain is string => typeof domain === 'string')
        : [],
      approach: Array.isArray(input.approach)
        ? input.approach.filter((step): step is string => typeof step === 'string')
        : []
    };
  }, [input]);

  // Determine plan status
  const planStatus = useMemo(() => {
    if (isStreaming || !toolResult) return 'creating';
    if (toolResult?.content) {
      const text = getTextFromBlockContent(toolResult.content);
      if (text.includes('approved') || text.includes('Approved')) return 'approved';
      if (text.includes('rejected') || text.includes('Rejected')) return 'rejected';
    }
    return toolResult?.is_error ? 'rejected' : 'approved';
  }, [toolResult, isStreaming]);

  const handleClick = useCallback(() => {
    if (planStructure) setShowModal(true);
  }, [planStructure]);

  const handleClose = useCallback(() => {
    setShowModal(false);
  }, []);

  let statusText = intl.formatMessage({ id: 'plan', defaultMessage: 'Plan' });
  if (planStatus === 'creating') {
    statusText = intl.formatMessage({ id: 'creating_plan', defaultMessage: 'Creating plan...' });
  } else if (planStatus === 'approved') {
    statusText = intl.formatMessage({ id: 'created_a_plan', defaultMessage: 'Created a plan' });
  } else if (planStatus === 'rejected') {
    statusText = intl.formatMessage({ id: 'plan_rejected', defaultMessage: 'Plan rejected' });
  }

  return (
    <>
      <ToolUseRow
        icon={<ChecklistIcon size={12} className="text-text-500" />}
        text={statusText}
        isStreaming={!!isStreaming}
        hideCaret
        renderMode={renderMode}
        isFirstBlockOfMessage={isFirstBlockOfMessage}
        isLastBlockOfMessage={isLastBlockOfMessage}
        isFirstItemInGroup={isFirstItemInGroup}
        isLastItemInGroup={isLastItemInGroup}
        handleClick={planStructure ? handleClick : undefined}
        isDisabled={!planStructure}
      />
      {showModal &&
        planStructure &&
        ReactDOM.createPortal(
          <PlanApprovalModal
            planStructure={planStructure}
            onApprove={handleClose}
            onReject={handleClose}
            isReadOnly
            onClose={handleClose}
          />,
          portalElement
        )}
    </>
  );
});

// ─── BrowserToolCell — bundle's rx component ───
// In non-debug mode, browser tools are NOT expandable (no Request/Result badges).
// They just show the tool name with appropriate icon via CollapsibleToolUseRow with isExpandingDisabled.
// Special case: screenshot tool shows thumbnail if result contains image data.

export const BrowserToolCell = React.memo(function BrowserToolCell({
  toolName,
  toolDisplayName,
  input,
  toolResult,
  renderMode = 'Standard' as 'Standard' | 'TimelineGroup',
  isFirstBlockOfMessage,
  isLastBlockOfMessage,
  isFirstItemInGroup,
  isLastItemInGroup,
  isStreaming
}: {
  toolName: string;
  toolDisplayName?: string;
  input?: ToolInputRecord;
  toolResult?: ApiToolResultBlock;
  renderMode?: 'Standard' | 'TimelineGroup';
  isFirstBlockOfMessage?: boolean;
  isLastBlockOfMessage?: boolean;
  isFirstItemInGroup?: boolean;
  isLastItemInGroup?: boolean;
  isStreaming?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const intlBrowserTool = useIntlSafe();
  // In non-debug mode, browser tools are not expandable (matching bundle behavior).
  // update_plan has its own cell, so isExpandingDisabled = true for all browser tools here.
  const isExpandingDisabled = true;

  const info = useMemo(
    () => getToolDisplayInfo(toolName, input, toolResult, asFormatMessageLike(intlBrowserTool)),
    [toolName, input, toolResult, intlBrowserTool]
  );
  const displayText = toolDisplayName || info.text;
  const icon = useMemo(() => resolveToolIcon(info.icon, 16), [info.icon]);

  // Check if this is a screenshot tool with image result
  const screenshotData = useMemo(() => {
    // Check for screenshot in tool name or if result contains image
    const isScreenshotTool =
      toolName === 'screenshot' || (toolName === 'computer' && input?.action === 'screenshot');

    if (!isScreenshotTool || !toolResult || toolResult.is_error) return null;

    // toolResult.content can be either an array or a string (error message)
    if (typeof toolResult.content === 'string') return null;

    // Handle both array and non-array content
    const imageContent = getBase64ImageBlocks(toolResult.content)[0];

    if (imageContent) {
      return `data:${imageContent.source.media_type};base64,${imageContent.source.data}`;
    }
    return null;
  }, [toolName, input, toolResult]);

  // Create screenshot thumbnail element for secondaryElement
  const setScreenshotPreviewUrl = useUIStore((state) => state.setScreenshotPreviewUrl);

  const screenshotThumbnail = screenshotData ? (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        setScreenshotPreviewUrl(screenshotData);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          e.preventDefault();
          setScreenshotPreviewUrl(screenshotData);
        }
      }}
      className="cursor-pointer hover:opacity-80 transition-opacity"
    >
      <img
        src={screenshotData}
        alt="Screenshot"
        className="h-8 rounded border border-border-300"
        style={{ objectFit: 'contain' }}
      />
    </div>
  ) : undefined;

  return (
    <CollapsibleToolUseRow
      isExpanded={isExpanded}
      setIsExpanded={setIsExpanded}
      isExpandingDisabled={isExpandingDisabled}
      isStreaming={!!isStreaming}
      icon={icon}
      text={displayText}
      secondaryElement={screenshotThumbnail}
      isFirstBlockOfMessage={isFirstBlockOfMessage}
      isLastBlockOfMessage={isLastBlockOfMessage}
      renderMode={renderMode}
      isFirstItemInGroup={isFirstItemInGroup}
      isLastItemInGroup={isLastItemInGroup}
    />
  );
});

// ─── ToolUseItem — renders a single tool use ──────────────────────────────────

/** ToolUseRow — renders a single tool use, in TimelineGroup mode or standalone.
 * Matches bundle's Ni → Si delegation pattern. */
export function ToolUseItem({
  block,
  toolResult,
  isStreaming,
  renderMode = 'Standard',
  isFirstBlockOfMessage = false,
  isLastBlockOfMessage = false,
  isFirstItemInGroup = false,
  isLastItemInGroup = false,
  toolDisplayName: explicitDisplayName,
  explicitIcon
}: {
  block: ApiToolUseBlock;
  toolResult?: ApiToolResultBlock;
  isStreaming: boolean;
  renderMode?: 'Standard' | 'TimelineGroup';
  isFirstBlockOfMessage?: boolean;
  isLastBlockOfMessage?: boolean;
  isFirstItemInGroup?: boolean;
  isLastItemInGroup?: boolean;
  toolDisplayName?: string;
  explicitIcon?: React.ReactNode;
}) {
  const intl = useIntlSafe();
  const [resultExpanded, setResultExpanded] = useState(false);
  const [requestExpanded, setRequestExpanded] = useState(false);
  const input = useMemo<ToolInputRecord | undefined>(
    () => (isRecord(block.input) ? block.input : undefined),
    [block.input]
  );
  const hasResult = !!toolResult;
  const isComplete = hasResult || !isStreaming;
  const isActive = !hasResult && isStreaming;
  const hasError = toolResult?.is_error;

  // Display name: explicit > input-derived > getToolDisplayName fallback
  const displayName = useMemo(() => {
    if (explicitDisplayName) return explicitDisplayName;
    return getToolDisplayName(block.name);
  }, [block.name, explicitDisplayName]);

  // Three-tier icon resolution (matching bundle's GenericToolCell wo):
  // Tier 1: explicit icon prop
  // Tier 2: toolName-based (resolveToolNameIcon)
  // Tier 3: fallback to EqualizerIcon (plug icon)
  const toolIcon = useMemo(() => {
    if (explicitIcon) return explicitIcon;
    const nameIcon = resolveToolNameIcon(block.name, 12);
    if (nameIcon) return nameIcon;
    return <EqualizerIcon size={12} className="text-text-300" />;
  }, [explicitIcon, block.name]);

  // Result content extraction
  const resultContent = useMemo(() => {
    if (!toolResult) return null;
    if (typeof toolResult.content === 'string') return toolResult.content;
    if (Array.isArray(toolResult.content)) {
      return {
        text: getTextFromBlockContent(toolResult.content),
        images: getBase64ImageBlocks(toolResult.content)
      } satisfies Exclude<ToolResultDisplayContent, string>;
    }
    return null;
  }, [toolResult]) as ToolResultDisplayContent | null;

  // Request content (tool input) for the "Request" badge
  const requestContent = useMemo(() => {
    if (!input || Object.keys(input).length === 0) return null;
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return null;
    }
  }, [input]);

  const hasResultContent = !!resultContent;
  const hasRequestContent = !!requestContent;

  // The clickable header button — matches bundle's Ni (ToolUseRow)
  const headerButton = (
    <button
      className={`group/row flex flex-row items-center rounded-lg px-2.5 w-full justify-between ${
        renderMode !== 'TimelineGroup' ? 'py-2' : ''
      } text-text-300 !cursor-default`}
    >
      <div className="flex flex-row items-center gap-2 min-w-0 flex-1">
        {/* Icon only shown in Standard mode (TimelineGroup mode uses Si's icon column) */}
        {renderMode !== 'TimelineGroup' && (
          <div className="flex items-center justify-center text-text-500 shrink-0">{toolIcon}</div>
        )}
        <div className="text-sm text-text-500 text-left truncate w-0 flex-grow">
          {isStreaming && !hasResult ? <ShimmerText>{displayName}</ShimmerText> : displayName}
        </div>
      </div>
    </button>
  );

  // "Request" expandable badge — shown when streaming/incomplete and has request content
  const requestBadge =
    hasRequestContent && !isComplete ? (
      <div className="mx-2.5 mt-1 mb-2">
        {!requestExpanded && (
          <button
            onClick={() => setRequestExpanded(true)}
            className="flex items-center transition-colors cursor-pointer text-text-500 hover:text-text-200"
          >
            <Badge color="flat" size="default" className="font-mono !text-inherit">
              {intl.formatMessage({ id: 'request', defaultMessage: 'Request' })}
            </Badge>
          </button>
        )}
        <AnimatePresence>
          {requestExpanded && (
            <motion.div
              key="request-expanded"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.2 }}
              className="overflow-hidden"
            >
              <div
                onClick={() => setRequestExpanded(false)}
                className="rounded-lg border-[0.5px] border-border-300 bg-bg-000 cursor-pointer"
              >
                <div className="p-2 flex flex-col gap-2 max-h-[200px] overflow-y-auto [&_pre]:!text-xs [&_code]:!text-xs">
                  <pre className="text-xs text-text-400 font-mono whitespace-pre-wrap">
                    {requestContent?.slice(0, 2000)}
                  </pre>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    ) : null;

  // "Result" expandable badge — shown when complete and has result content
  const resultBadge =
    hasResultContent && isComplete ? (
      <div className="mx-2.5 mt-1 mb-2">
        {!resultExpanded && (
          <button
            onClick={() => setResultExpanded(true)}
            className={`flex items-center transition-colors cursor-pointer ${
              hasError
                ? 'text-danger-000 hover:text-danger-100'
                : 'text-text-500 hover:text-text-200'
            }`}
          >
            <Badge
              color={hasError ? 'danger' : 'flat'}
              size="default"
              className={`font-mono ${hasError ? '' : '!text-inherit'}`}
            >
              {intl.formatMessage({ id: 'result', defaultMessage: 'Result' })}
            </Badge>
          </button>
        )}
        <AnimatePresence>
          {resultExpanded && (
            <motion.div
              key="result-expanded"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.2 }}
              className="overflow-hidden"
            >
              <div
                onClick={() => setResultExpanded(false)}
                className="rounded-lg border-[0.5px] border-border-300 bg-bg-000 cursor-pointer"
              >
                <div className="p-2 flex flex-col gap-2 max-h-[200px] overflow-y-auto [&_pre]:!text-xs [&_code]:!text-xs">
                  {typeof resultContent === 'string' ? (
                    <pre className="text-xs text-text-400 font-mono whitespace-pre-wrap">
                      {resultContent.slice(0, 2000)}
                    </pre>
                  ) : (
                    <>
                      {resultContent.text && (
                        <pre className="text-xs text-text-400 font-mono whitespace-pre-wrap">
                          {resultContent.text.slice(0, 2000)}
                        </pre>
                      )}
                      {resultContent.images?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {resultContent.images.map((img, idx) => (
                            <img
                              key={idx}
                              src={`data:${img.source.media_type};base64,${img.source.data}`}
                              alt="tool result"
                              className="w-20 h-20 object-cover rounded"
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    ) : null;

  // In TimelineGroup mode, delegate to TimelineGroupItem
  if (renderMode === 'TimelineGroup') {
    return (
      <TimelineGroupItem
        icon={toolIcon}
        header={headerButton}
        isExpanded={resultExpanded || requestExpanded}
        isFirstItem={isFirstItemInGroup}
        isLastItem={isLastItemInGroup}
        isActive={isActive && isLastBlockOfMessage && isLastItemInGroup}
        showDotFallback={false}
      >
        {requestBadge}
        {resultBadge}
      </TimelineGroupItem>
    );
  }

  // Standard mode: bordered card
  return (
    <div
      className={`ease-out rounded-lg border-[0.5px] flex flex-col font-ui leading-normal border-border-300 ${
        !(resultExpanded || requestExpanded) ? 'hover:bg-bg-200' : ''
      } ${resultExpanded || requestExpanded ? 'bg-bg-000 shadow-sm' : ''} ${
        isFirstBlockOfMessage ? 'mt-2' : 'mt-3'
      } ${isLastBlockOfMessage ? 'mb-2' : 'mb-3'}`}
    >
      {headerButton}
      {requestBadge}
      {resultBadge}
    </div>
  );
}

// ─── Content Blocks Renderer (matching bundle's cv) ──────────────────────────

/** Checks if a block should be grouped in a timeline (tool_use or tool_result) */
export function isTimelineBlock(
  block: ApiMessageBlock
): block is ApiToolUseBlock | ApiToolResultBlock {
  return isToolUseContentBlock(block) || isToolResultContentBlock(block);
}

/** ContentBlocksRenderer — bundle's cv component.
 * Splits blocks at turn_answer_start, renders before-answer in TimelineGroup, after-answer directly. */
export function ContentBlocksRenderer({
  blocks,
  isStreaming,
  allMessages
}: {
  blocks: ApiMessageBlock[];
  isStreaming: boolean;
  allMessages: ApiConversationMessage[];
}) {
  const [showCollapsed, setShowCollapsed] = useState(false);
  const intl = useIntlSafe();

  // Lift math plugin loading to this level — called once per message instead of per-block
  const { remarkMath, rehypeKatex } = useMathPlugins();

  const { blocksBeforeAnswer, blocksAfterAnswer, hasFinalAnswer } = useMemo(() => {
    let answerIdx = -1;
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (isToolUseContentBlock(block) && block.name === 'turn_answer_start') {
        answerIdx = i;
        break;
      }
    }
    if (answerIdx === -1) {
      return { blocksBeforeAnswer: blocks, blocksAfterAnswer: [], hasFinalAnswer: false };
    }
    return {
      blocksBeforeAnswer: blocks.slice(0, answerIdx),
      blocksAfterAnswer: blocks.slice(answerIdx + 1),
      hasFinalAnswer: true
    };
  }, [blocks]);

  // Count tool_use blocks for collapse logic
  const toolUseCount = useMemo(() => {
    const targetBlocks = hasFinalAnswer ? blocksBeforeAnswer : blocks;
    return targetBlocks.filter(
      (block): block is ApiToolUseBlock =>
        isToolUseContentBlock(block) && block.name !== 'turn_answer_start'
    ).length;
  }, [blocks, blocksBeforeAnswer, hasFinalAnswer]);

  const isTurnComplete = !isStreaming;
  const shouldCollapse = isTurnComplete && toolUseCount >= 3;

  if (hasFinalAnswer) {
    // Has final answer - collapse tools before answer
    if (shouldCollapse) {
      return (
        <>
          {/* Collapse toggle button */}
          <div className="my-3">
            <button
              onClick={() => setShowCollapsed(!showCollapsed)}
              className="px-3 py-2 w-full text-left text-sm text-text-300 flex items-center gap-2 hover:text-text-200 transition-colors"
            >
              <ChevronDown
                size={16}
                className={`transition-transform ${showCollapsed ? 'rotate-0' : 'rotate-180'}`}
              />
              {showCollapsed
                ? intl.formatMessage({ id: 'hide_steps', defaultMessage: 'Hide steps' })
                : formatStepCountLabel(asFormatMessageLike(intl), toolUseCount)}
            </button>
          </div>

          {/* Collapsible tool blocks */}
          <AnimatePresence>
            {showCollapsed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{
                  ease: TIMELINE_SNAPPY_OUT,
                  duration: TIMELINE_ANIM_DURATION
                }}
                className="overflow-hidden"
              >
                {blocksBeforeAnswer.map((block, i) => (
                  <BlockRenderer
                    key={`before-answer-${i}`}
                    block={block}
                    index={i}
                    blocks={blocksBeforeAnswer}
                    renderMode="Standard"
                    isStreaming={false}
                    allMessages={allMessages}
                    remarkMath={remarkMath}
                    rehypeKatex={rehypeKatex}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Final answer blocks */}
          {blocksAfterAnswer.map((block, i) => (
            <BlockRenderer
              key={`after-answer-${i}`}
              block={block}
              index={i}
              blocks={blocksAfterAnswer}
              renderMode="Standard"
              isStreaming={false}
              allMessages={allMessages}
              remarkMath={remarkMath}
              rehypeKatex={rehypeKatex}
            />
          ))}
        </>
      );
    }

    // No collapse needed
    return (
      <>
        {blocksBeforeAnswer.map((block, i) => (
          <BlockRenderer
            key={`before-answer-${i}`}
            block={block}
            index={i}
            blocks={blocksBeforeAnswer}
            renderMode="Standard"
            isStreaming={false}
            allMessages={allMessages}
            remarkMath={remarkMath}
            rehypeKatex={rehypeKatex}
          />
        ))}
        {blocksAfterAnswer.map((block, i) => (
          <BlockRenderer
            key={`after-answer-${i}`}
            block={block}
            index={i}
            blocks={blocksAfterAnswer}
            renderMode="Standard"
            isStreaming={false}
            allMessages={allMessages}
            remarkMath={remarkMath}
            rehypeKatex={rehypeKatex}
          />
        ))}
      </>
    );
  }

  // No final answer - collapse all tools when turn complete
  if (shouldCollapse) {
    return (
      <>
        {/* Collapse toggle button */}
        <div className="my-3">
          <button
            onClick={() => setShowCollapsed(!showCollapsed)}
            className="px-3 py-2 w-full text-left text-sm text-text-300 flex items-center gap-2 hover:text-text-200 transition-colors"
          >
            <ChevronDown
              size={16}
              className={`transition-transform ${showCollapsed ? 'rotate-0' : 'rotate-180'}`}
            />
            {showCollapsed
              ? intl.formatMessage({ id: 'hide_steps', defaultMessage: 'Hide steps' })
              : formatStepCountLabel(asFormatMessageLike(intl), toolUseCount)}
          </button>
        </div>

        {/* Collapsible blocks */}
        <AnimatePresence>
          {showCollapsed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{
                ease: TIMELINE_SNAPPY_OUT,
                duration: TIMELINE_ANIM_DURATION
              }}
              className="overflow-hidden"
            >
              {blocks.map((block, i) => (
                <BlockRenderer
                  key={`block-${i}`}
                  block={block}
                  index={i}
                  blocks={blocks}
                  renderMode="Standard"
                  isStreaming={false}
                  allMessages={allMessages}
                  remarkMath={remarkMath}
                  rehypeKatex={rehypeKatex}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // No collapse - render all blocks normally
  return (
    <>
      {blocks.map((block, i) => (
        <BlockRenderer
          key={`block-${i}`}
          block={block}
          index={i}
          blocks={blocks}
          renderMode="Standard"
          isStreaming={isStreaming}
          allMessages={allMessages}
          remarkMath={remarkMath}
          rehypeKatex={rehypeKatex}
        />
      ))}
    </>
  );
}

// ─── BlockRenderer — bundle's lv component ───────────────────────────────────

/** BlockRenderer — bundle's lv component.
 * Dispatches to the right renderer for each block type. */
export const BlockRenderer = React.memo(function BlockRenderer({
  block,
  index,
  blocks,
  renderMode = 'Standard',
  isFirstItemInGroup = false,
  isLastItemInGroup = false,
  isStreaming,
  allMessages,
  remarkMath,
  rehypeKatex
}: {
  block: ApiMessageBlock;
  index: number;
  blocks: ApiMessageBlock[];
  renderMode?: 'Standard' | 'TimelineGroup';
  isFirstItemInGroup?: boolean;
  isLastItemInGroup?: boolean;
  isStreaming: boolean;
  allMessages: ApiConversationMessage[];
  remarkMath?: ReturnType<typeof useMathPlugins>['remarkMath'];
  rehypeKatex?: ReturnType<typeof useMathPlugins>['rehypeKatex'];
}) {
  const isFirst = index === 0;
  const isLast = index === blocks.length - 1;
  const intlBlock = useIntlSafe();

  // Memoize plugin arrays so ReactMarkdown doesn't see new references every render
  const remarkPlugins = useMemo(() => [remarkGfm, ...buildRemarkPlugins(remarkMath)], [remarkMath]);
  const rehypePlugins = useMemo(() => buildRehypePlugins(rehypeKatex), [rehypeKatex]);

  // Memoize markdown components to avoid recreating on every render
  const mdComponents = useMemo(() => createStandardMarkdownComponents(), []);

  // Memoize processed text for text blocks
  const processedText = useMemo(() => {
    if (isTextContentBlock(block) && block.text) {
      return preprocessMarkdownText(block.text);
    }
    return '';
  }, [block]);

  if (isTextContentBlock(block)) {
    const text = block.text;
    if (!text) return null;
    const textColor = renderMode === 'TimelineGroup' ? 'text-text-100' : undefined;

    return (
      <div
        className={`font-superduck-response text-sm leading-[1.65rem] ${textColor || 'text-text-100'} break-words`}
      >
        <div className={`standard-markdown ${STANDARD_MARKDOWN_GRID_CLASS}`}>
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={mdComponents}
          >
            {processedText}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  if (isToolUseContentBlock(block)) {
    if (block.name === 'turn_answer_start') return null;

    // Find the tool result from allMessages
    let toolResult: ApiToolResultBlock | undefined;
    for (const msg of allMessages) {
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        const found = msg.content.find(
          (contentBlock): contentBlock is ApiToolResultBlock =>
            isToolResultContentBlock(contentBlock) && contentBlock.tool_use_id === block.id
        );
        if (found) {
          toolResult = found;
          break;
        }
      }
    }

    const input = isRecord(block.input) ? block.input : undefined;
    const streamingForTool = isStreaming && !toolResult;

    // Route to specialized components matching bundle's lv routing logic

    // 1. WebSearch → WebSearchToolCell (bundle's my)
    if (block.name === 'WebSearch') {
      return (
        <WebSearchToolCell
          input={input}
          toolResult={toolResult}
          renderMode={renderMode}
          isFirstBlockOfMessage={isFirst}
          isLastBlockOfMessage={isLast}
          isFirstItemInGroup={isFirstItemInGroup}
          isLastItemInGroup={isLastItemInGroup}
          isStreaming={streamingForTool}
          onResultClick={(url) => chrome.tabs.create({ url })}
        />
      );
    }

    // 2. WebFetch → WebFetchToolCell (bundle's hy)
    if (block.name === 'WebFetch') {
      return (
        <WebFetchToolCell
          input={input}
          toolResult={toolResult}
          renderMode={renderMode}
          isFirstBlockOfMessage={isFirst}
          isLastBlockOfMessage={isLast}
          isFirstItemInGroup={isFirstItemInGroup}
          isLastItemInGroup={isLastItemInGroup}
          isStreaming={streamingForTool}
          onUrlClick={(url) => window.open(url, '_blank')}
        />
      );
    }

    // 3. update_plan → UpdatePlanCell (bundle's ov)
    if (block.name === 'update_plan') {
      return (
        <UpdatePlanCell
          input={input}
          toolResult={toolResult}
          renderMode={renderMode}
          isFirstBlockOfMessage={isFirst}
          isLastBlockOfMessage={isLast}
          isFirstItemInGroup={isFirstItemInGroup}
          isLastItemInGroup={isLastItemInGroup}
          isStreaming={streamingForTool}
        />
      );
    }

    // 4. Browser tools → BrowserToolCell (bundle's rx) — NOT expandable in non-debug
    if (BROWSER_TOOLS.has(block.name)) {
      return (
        <BrowserToolCell
          toolName={block.name}
          input={input}
          toolResult={toolResult}
          renderMode={renderMode}
          isFirstBlockOfMessage={isFirst}
          isLastBlockOfMessage={isLast}
          isFirstItemInGroup={isFirstItemInGroup}
          isLastItemInGroup={isLastItemInGroup}
          isStreaming={streamingForTool}
        />
      );
    }

    // 5. Everything else → GenericToolCell (ToolUseItem) with Request/Result badges
    // Derive display name from input
    let derivedDisplayName: string | undefined;
    let derivedIcon: React.ReactNode | undefined;

    if (block.name === 'switch_browser') {
      const info = getToolDisplayInfo(
        block.name,
        input,
        toolResult,
        asFormatMessageLike(intlBlock)
      );
      derivedDisplayName = info.text;
      derivedIcon = resolveToolIcon(info.icon, 16);
    } else if (block.name === 'bash' || block.name === 'Bash' || block.name === 'bash_tool') {
      derivedDisplayName = getStringField(input, 'description') || getStringField(input, 'command');
    } else if (
      block.name === 'str_replace' ||
      block.name === 'str_replace_editor' ||
      block.name === 'Edit'
    ) {
      const inputPath = getStringField(input, 'path');
      derivedDisplayName = inputPath
        ? intlBlock.formatMessage(
            { id: 'editing', defaultMessage: 'Editing {fileName}' },
            { fileName: inputPath }
          )
        : undefined;
    } else if (block.name === 'Read') {
      const filePath = getStringField(input, 'file_path');
      derivedDisplayName = filePath
        ? intlBlock.formatMessage(
            { id: 'reading', defaultMessage: 'Reading {fileName}' },
            { fileName: filePath }
          )
        : undefined;
    } else if (block.name === 'Write') {
      const filePath = getStringField(input, 'file_path');
      derivedDisplayName = filePath
        ? intlBlock.formatMessage(
            { id: 'writing_file', defaultMessage: 'Writing {fileName}' },
            { fileName: filePath }
          )
        : undefined;
    } else if (block.name === 'Glob' || block.name === 'Grep') {
      derivedDisplayName = getStringField(input, 'pattern');
    } else if (block.name === 'Task') {
      derivedDisplayName = getStringField(input, 'description');
    } else if (MCP_TOOL_REGEX.test(block.name)) {
      // MCP tools — extract display name from tool name
      const match = block.name.match(/^mcp__[0-9a-f-]+__(.+)$/);
      if (match) {
        derivedDisplayName = match[1]
          .split('_')
          .map((w: string, i: number) =>
            i === 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()
          )
          .join(' ');
      }
    }

    return (
      <ToolUseItem
        block={block}
        toolResult={toolResult}
        isStreaming={streamingForTool}
        renderMode={renderMode}
        isFirstBlockOfMessage={isFirst}
        isLastBlockOfMessage={isLast}
        isFirstItemInGroup={isFirstItemInGroup}
        isLastItemInGroup={isLastItemInGroup}
        toolDisplayName={derivedDisplayName}
        explicitIcon={derivedIcon}
      />
    );
  }

  return null;
});

// ─── AssistantMessageRow ─────────────────────────────────────────────────────

export function AssistantMessageRow({
  blocks,
  isStreaming,
  allMessages
}: {
  blocks: ApiMessageBlock[];
  isStreaming: boolean;
  allMessages: ApiConversationMessage[];
}) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null);
  const intl = useIntlSafe();

  // Strip system reminders from text blocks
  const processedBlocks = useMemo<ApiMessageBlock[]>(() => {
    return blocks.map((block) => {
      if (isTextContentBlock(block) && block.text) {
        const text = block.text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
        return { ...block, text };
      }
      return block;
    });
  }, [blocks]);

  // Compute the final answer text (text after turn_answer_start, or all text if no turn_answer_start)
  const finalAnswerText = useMemo(() => {
    const content = processedBlocks;
    let answerIdx = -1;
    for (let i = 0; i < content.length; i++) {
      const block = content[i];
      if (isToolUseContentBlock(block) && block.name === 'turn_answer_start') {
        answerIdx = i;
        break;
      }
    }
    return (answerIdx >= 0 ? content.slice(answerIdx + 1) : content)
      .filter(isTextContentBlock)
      .map((block) => block.text)
      .join('');
  }, [processedBlocks]);

  const handleCopy = async () => {
    if (!finalAnswerText) return;
    await navigator.clipboard.writeText(finalAnswerText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const turnIsOver = !isStreaming;

  return (
    <div className="flex items-start group">
      <div className="max-w-4xl superduck-response w-full break-words">
        <ContentBlocksRenderer
          blocks={processedBlocks}
          isStreaming={isStreaming}
          allMessages={allMessages}
        />

        {/* Copy + Feedback buttons */}
        {turnIsOver && (finalAnswerText || processedBlocks.length > 0) && (
          <div className="h-7 flex items-center">
            <div className="flex items-center gap-0.5 -ml-1.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto">
              {finalAnswerText && (
                <Tooltip
                  tooltipContent={
                    copied
                      ? intl.formatMessage({ id: 'copied', defaultMessage: 'Copied' })
                      : intl.formatMessage({ id: 'copy', defaultMessage: 'Copy' })
                  }
                  side="bottom"
                  open={copied || undefined}
                  delayDuration={copied ? 0 : 200}
                >
                  <button
                    onClick={handleCopy}
                    className="p-1.5 rounded-md transition-colors text-text-300 hover:bg-bg-300 hover:text-text-100"
                    aria-label={intl.formatMessage({
                      id: 'copy_message',
                      defaultMessage: 'Copy message'
                    })}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </Tooltip>
              )}
              <Tooltip
                tooltipContent={intl.formatMessage({
                  id: 'give_positive_feedback',
                  defaultMessage: 'Give positive feedback'
                })}
                side="bottom"
              >
                <button
                  onClick={() => {
                    const next = feedback === 'positive' ? null : 'positive';
                    setFeedback(next);
                    if (next)
                      void trackEvent('superduck.sidebar.message_feedback', {
                        sentiment: 'positive'
                      });
                  }}
                  className={`p-1.5 rounded-md transition-colors ${feedback === 'positive' ? 'text-text-100' : 'text-text-300 hover:bg-bg-300 hover:text-text-100'}`}
                  aria-label={intl.formatMessage({
                    id: 'good_response',
                    defaultMessage: 'Good response'
                  })}
                >
                  <ThumbsUp size={12} />
                </button>
              </Tooltip>
              <Tooltip
                tooltipContent={intl.formatMessage({
                  id: 'give_negative_feedback',
                  defaultMessage: 'Give negative feedback'
                })}
                side="bottom"
              >
                <button
                  onClick={() => {
                    const next = feedback === 'negative' ? null : 'negative';
                    setFeedback(next);
                    if (next)
                      void trackEvent('superduck.sidebar.message_feedback', {
                        sentiment: 'negative'
                      });
                  }}
                  className={`p-1.5 rounded-md transition-colors ${feedback === 'negative' ? 'text-text-100' : 'text-text-300 hover:bg-bg-300 hover:text-text-100'}`}
                  aria-label={intl.formatMessage({
                    id: 'bad_response',
                    defaultMessage: 'Bad response'
                  })}
                >
                  <ThumbsDown size={12} />
                </button>
              </Tooltip>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MessageList ─────────────────────────────────────────────────────────────

export const MessageList = React.memo(function MessageList({
  apiMessages,
  streamingTextStore,
  isAgentRunning,
  scrollRefs
}: {
  apiMessages: ApiConversationMessage[];
  streamingTextStore: StreamingTextStore;
  isAgentRunning: boolean;
  scrollRefs?: {
    lastAssistantMessage: React.RefObject<HTMLDivElement | null>;
    lastHumanMessage: React.RefObject<HTMLDivElement | null>;
  };
}) {
  const setPromptToEdit = useUIStore((state) => state.setPromptToEdit);

  const handleEditShortcut = useCallback(
    async (id: string) => {
      const prompt = await PromptService.getPromptById(id);
      if (prompt) {
        setPromptToEdit({
          id: prompt.id,
          prompt: prompt.prompt,
          command: prompt.command
        });
      }
    },
    [setPromptToEdit]
  );

  const groups = useMemo(() => {
    const result: MessageGroup[] = [];

    for (let i = 0; i < apiMessages.length; i++) {
      const msg = apiMessages[i];

      // Handle compaction messages
      if (msg.isCompactionMessage || msg.isCompactSummary) {
        if (msg.isCompactSummary) {
          result.push({ type: 'summary', message: msg });
        }
        continue;
      }

      if (msg.role === 'user') {
        const toolResults = Array.isArray(msg.content)
          ? msg.content.filter(isToolResultContentBlock)
          : [];
        const isToolResultOnly = toolResults.length > 0;

        if (!isToolResultOnly) {
          // Check if this is a synthetic user message (no visible text)
          const hasVisibleText = (() => {
            if (typeof msg.content === 'string') {
              return (
                msg.content.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
                  .length > 0
              );
            }
            if (Array.isArray(msg.content)) {
              const text = getTextFromBlockContent(msg.content, '')
                .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
                .trim();
              const hasImages = msg.content.some(isImageContentBlock);
              return text.length > 0 || hasImages;
            }
            return false;
          })();

          result.push({
            type: 'conversation',
            userMessage: msg,
            hasVisibleUser: hasVisibleText,
            toolResults: [],
            assistantBlocks: []
          });
        } else {
          // Tool result message - attach to the last conversation group
          if (result.length > 0) {
            const lastGroup = result[result.length - 1];
            if (lastGroup.type === 'conversation') {
              lastGroup.toolResults.push(...toolResults);
            }
          }
        }
      } else if (msg.role === 'assistant' && result.length > 0) {
        const lastGroup = result[result.length - 1];
        if (lastGroup.type === 'conversation') {
          const blocks: ApiMessageBlock[] = Array.isArray(msg.content)
            ? msg.content
            : [{ type: 'text', text: msg.content } as ApiTextContentBlock];
          lastGroup.assistantBlocks.push(...blocks);
        }
      }
    }

    return result;
  }, [apiMessages]);

  // displayGroups is now just groups — streaming text is rendered separately by StreamingTextBlock
  const displayGroups = groups;

  // Find the index of the last conversation group with a visible user message
  // to assign scrollRefs (matching bundle's xv logic)
  let lastUserGroupIndex = -1;
  for (let i = displayGroups.length - 1; i >= 0; i--) {
    const group = displayGroups[i];
    if (group.type === 'conversation' && group.hasVisibleUser) {
      lastUserGroupIndex = i;
      break;
    }
  }

  // Split groups: before/including last user message, and after
  const beforeGroups =
    lastUserGroupIndex >= 0 ? displayGroups.slice(0, lastUserGroupIndex + 1) : displayGroups;
  const afterGroups = lastUserGroupIndex >= 0 ? displayGroups.slice(lastUserGroupIndex + 1) : [];

  const renderGroup = (group: MessageGroup, index: number, isLastUserGroup: boolean) => {
    if (group.type === 'summary') {
      return <ConversationSummary key={`summary-${index}`} message={group.message} />;
    }

    const isLastGroup = index === displayGroups.length - 1;
    const isStreamingGroup = isLastGroup && isAgentRunning;
    return (
      <div
        key={index}
        className="flex flex-col w-full mb-4"
        ref={isLastUserGroup && scrollRefs ? scrollRefs.lastHumanMessage : undefined}
      >
        {group.hasVisibleUser && (
          <UserMessageRow
            content={group.userMessage.content}
            toolResults={group.toolResults}
            onEditShortcut={handleEditShortcut}
          />
        )}
        {group.assistantBlocks.length > 0 && (
          <AssistantMessageRow
            blocks={group.assistantBlocks}
            isStreaming={isStreamingGroup}
            allMessages={apiMessages}
          />
        )}
        {isStreamingGroup && <StreamingTextBlock store={streamingTextStore} />}
      </div>
    );
  };

  return (
    <>
      {beforeGroups.map((group, index) => renderGroup(group, index, index === lastUserGroupIndex))}
      {afterGroups.length > 0 && (
        <div ref={scrollRefs?.lastAssistantMessage} className="flex flex-col">
          {afterGroups.map((group, index) =>
            renderGroup(group, lastUserGroupIndex + 1 + index, false)
          )}
        </div>
      )}
    </>
  );
});
