import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, CircleAlert, ListChecks, LoaderCircle } from 'lucide-react';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { cn } from '@/lib/utils';
import { useIntlSafe } from '../../../index-react-dom-intl';
import type { ApiToolResultBlock } from '../../../messageTypes';
import {
  getBrowserBatchActions,
  getBrowserBatchFailureIndex,
  getToolDisplayInfo,
  asFormatMessageLike,
  resolveToolIcon
} from '../../toolViews/toolDisplay';
import { getLocalizedBrowserBatchError } from '../../toolViews/browserBatchDisplay';
import { getBase64ImageBlocks } from '../../sidepanelUtils';
import {
  Badge,
  CollapsibleToolUseRow,
  TIMELINE_ANIM_DURATION,
  TIMELINE_SNAPPY_OUT
} from '../../toolViews';
import { useUIStore } from '../../stores/uiStore';
import type { ToolInputRecord } from '../../types';
import {
  getBrowserBatchResultText,
  parseBrowserBatchResult,
  isBrowserBatchError,
  getBrowserBatchActionStatus
} from './browserBatchParser';

export const BrowserBatchToolCell = React.memo(function BrowserBatchToolCell({
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
  const [isExpanded, setIsExpanded] = useState(false);
  const setScreenshotPreviewUrl = useUIStore((state) => state.setScreenshotPreviewUrl);

  const actions = useMemo(() => getBrowserBatchActions(input), [input]);
  const actionCount = actions.length;
  const resultText = useMemo(() => getBrowserBatchResultText(toolResult), [toolResult]);
  const failedActionIndex = useMemo(() => getBrowserBatchFailureIndex(resultText), [resultText]);
  const parsedResult = useMemo(() => parseBrowserBatchResult(resultText), [resultText]);
  const hasBatchError = useMemo(
    () => isBrowserBatchError(toolResult, resultText, failedActionIndex),
    [toolResult, resultText, failedActionIndex]
  );
  const hasMissingResult = !toolResult && !isStreaming;
  const hasVisibleBatchError = hasBatchError || hasMissingResult;
  const isComplete = !!toolResult || !isStreaming;
  const isActive = !!isStreaming && !toolResult;
  const statusIcon = hasVisibleBatchError ? (
    <CircleAlert size={14} className="text-destructive/55" aria-hidden />
  ) : isActive ? (
    <LoaderCircle size={15} className="animate-spin text-muted-foreground" aria-hidden />
  ) : undefined;

  const actionSummaries = useMemo(
    () =>
      actions.map((action, index) => {
        const info = getToolDisplayInfo(
          action.toolName,
          action.input,
          undefined,
          asFormatMessageLike(intl)
        );
        return {
          ...action,
          text: info.text,
          icon: resolveToolIcon(info.icon, 12),
          status: getBrowserBatchActionStatus({
            index,
            toolResult,
            failedActionIndex,
            completedCount: parsedResult.completedCount,
            stepStatuses: parsedResult.stepStatuses,
            hasBatchError: hasVisibleBatchError
          }),
          error: parsedResult.stepErrors.has(index)
            ? getLocalizedBrowserBatchError(
                parsedResult.stepErrors.get(index) || '',
                parsedResult.stepErrorCodes.get(index),
                parsedResult.stepStoppedReasons.get(index),
                intl
              )
            : undefined
        };
      }),
    [actions, intl, toolResult, failedActionIndex, parsedResult, hasVisibleBatchError]
  );

  const fallbackErrorText = useMemo(() => {
    if (hasMissingResult) {
      return intl.formatMessage({
        id: 'browser_batch_missing_result_detail',
        defaultMessage:
          'The action sequence ended before SuperDuck received a tool result. Check the current page before continuing.'
      });
    }
    if (!hasBatchError) return undefined;
    if (failedActionIndex !== null && parsedResult.stepErrors.has(failedActionIndex)) {
      return getLocalizedBrowserBatchError(
        parsedResult.stepErrors.get(failedActionIndex) || '',
        parsedResult.stepErrorCodes.get(failedActionIndex),
        parsedResult.stepStoppedReasons.get(failedActionIndex),
        intl
      );
    }
    if (parsedResult.summary) {
      return getLocalizedBrowserBatchError(parsedResult.summary, undefined, undefined, intl);
    }
    const firstLine = resultText
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean);
    return firstLine && !firstLine.startsWith('{')
      ? getLocalizedBrowserBatchError(firstLine, undefined, undefined, intl)
      : undefined;
  }, [failedActionIndex, hasBatchError, hasMissingResult, intl, parsedResult, resultText]);

  const displayText = useMemo(() => {
    if (actionCount === 0) {
      return intl.formatMessage({
        id: 'run_browser_batch',
        defaultMessage: 'Run browser action sequence'
      });
    }
    if (!isComplete) {
      return intl.formatMessage(
        {
          id: 'running_browser_action_count',
          defaultMessage:
            'Running {count, plural, one {# browser action} other {# browser actions}}'
        },
        { count: actionCount }
      );
    }
    if (hasMissingResult) {
      return intl.formatMessage({
        id: 'browser_batch_missing_result',
        defaultMessage: 'Action sequence stopped before results returned'
      });
    }
    if (hasBatchError) {
      if (failedActionIndex !== null) {
        return intl.formatMessage(
          {
            id: 'browser_batch_stopped_at_step_of_count',
            defaultMessage: 'Action sequence stopped at step {step} of {count}'
          },
          { step: failedActionIndex + 1, count: actionCount }
        );
      }
      return intl.formatMessage({
        id: 'browser_batch_failed',
        defaultMessage: 'Browser action sequence failed'
      });
    }
    return intl.formatMessage(
      {
        id: 'ran_browser_action_count',
        defaultMessage: 'Ran {count, plural, one {# browser action} other {# browser actions}}'
      },
      { count: actionCount }
    );
  }, [actionCount, failedActionIndex, hasBatchError, hasMissingResult, intl, isComplete]);

  const screenshotData = useMemo(() => {
    if (!toolResult || typeof toolResult.content === 'string') return null;
    const imageContent = getBase64ImageBlocks(toolResult.content)[0];
    if (!imageContent) return null;
    return `data:${imageContent.source.media_type};base64,${imageContent.source.data}`;
  }, [toolResult]);

  const screenshotLabel = useMemo(() => {
    if (!screenshotData) return undefined;
    if (hasVisibleBatchError) {
      const completedCount = parsedResult.completedCount ?? Math.max(0, failedActionIndex ?? 0);
      return completedCount > 0
        ? intl.formatMessage(
            {
              id: 'browser_batch_stopped_screenshot_after_actions',
              defaultMessage:
                'Page screenshot when the sequence stopped after {count, plural, one {# browser action} other {# browser actions}}'
            },
            { count: completedCount }
          )
        : intl.formatMessage({
            id: 'browser_batch_stopped_screenshot',
            defaultMessage: 'Page screenshot when the sequence stopped'
          });
    }
    return intl.formatMessage(
      {
        id: 'browser_batch_final_screenshot_after_actions',
        defaultMessage:
          'Final screenshot after {count, plural, one {# browser action} other {# browser actions}}'
      },
      { count: actionCount }
    );
  }, [
    actionCount,
    failedActionIndex,
    hasVisibleBatchError,
    intl,
    parsedResult.completedCount,
    screenshotData
  ]);

  const screenshotThumbnail =
    screenshotData && screenshotLabel ? (
      <div
        role="button"
        tabIndex={0}
        aria-label={intl.formatMessage({
          id: 'open_browser_batch_screenshot',
          defaultMessage: 'Open action sequence screenshot'
        })}
        title={screenshotLabel}
        onClick={(event) => {
          event.stopPropagation();
          setScreenshotPreviewUrl(screenshotData);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.stopPropagation();
            event.preventDefault();
            setScreenshotPreviewUrl(screenshotData);
          }
        }}
        className="cursor-pointer transition-opacity hover:opacity-80"
      >
        <img
          src={screenshotData}
          alt={screenshotLabel}
          className="h-8 rounded border border-border/20 dark:border-border/20"
          style={{ objectFit: 'contain' }}
        />
      </div>
    ) : undefined;

  const screenshotPreview =
    screenshotData && screenshotLabel ? (
      <button
        type="button"
        aria-label={intl.formatMessage({
          id: 'open_browser_batch_screenshot',
          defaultMessage: 'Open action sequence screenshot'
        })}
        onClick={(event) => {
          event.stopPropagation();
          setScreenshotPreviewUrl(screenshotData);
        }}
        className="mt-2 w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-muted-foreground transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <span className="flex items-center gap-2">
          <img
            src={screenshotData}
            alt={screenshotLabel}
            className="h-9 w-16 rounded border border-border/10 dark:border-border/10"
            style={{ objectFit: 'contain' }}
          />
          <span className="min-w-0 truncate text-xs text-muted-foreground">{screenshotLabel}</span>
        </span>
      </button>
    ) : undefined;

  return (
    <CollapsibleToolUseRow
      isExpanded={isExpanded}
      setIsExpanded={setIsExpanded}
      isExpandingDisabled={actionCount === 0}
      isStreaming={!!isStreaming && !toolResult}
      icon={<ListChecks size={14} className="text-muted-foreground" />}
      text={displayText}
      tone={isActive ? 'active' : 'default'}
      secondaryIcon={statusIcon}
      secondaryElement={screenshotThumbnail}
      isFirstBlockOfMessage={isFirstBlockOfMessage}
      isLastBlockOfMessage={isLastBlockOfMessage}
      renderMode={renderMode}
      isFirstItemInGroup={isFirstItemInGroup}
      isLastItemInGroup={isLastItemInGroup}
    >
      {isExpanded && (actionSummaries.length > 0 || fallbackErrorText || screenshotPreview) && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ ease: TIMELINE_SNAPPY_OUT, duration: TIMELINE_ANIM_DURATION }}
          className="overflow-hidden"
        >
          <div className="mx-2.5 mt-1 mb-2">
            {actionSummaries.length > 0 && (
              <div className="rounded-md bg-muted/6 p-1 dark:bg-muted/4">
                <ol className="flex flex-col gap-0.5">
                  {actionSummaries.map((action, index) => (
                    <li key={`${action.toolName}-${index}`}>
                      <Marker
                        className={cn(
                          'min-h-8 rounded-md px-2 py-1.5 text-xs transition-colors',
                          action.status === 'failed'
                            ? 'bg-destructive/6 text-destructive'
                            : hasMissingResult && action.status === 'pending'
                              ? 'bg-muted/12 text-muted-foreground'
                              : 'text-muted-foreground'
                        )}
                      >
                        <MarkerIcon
                          className={cn(
                            'text-[0.6875rem] tabular-nums',
                            action.status === 'failed'
                              ? 'text-destructive'
                              : 'text-muted-foreground'
                          )}
                        >
                          {action.status === 'complete' ? (
                            <Check size={13} />
                          ) : action.status === 'failed' ? (
                            <CircleAlert size={14} />
                          ) : (
                            index + 1
                          )}
                        </MarkerIcon>
                        <MarkerContent className="min-w-0 flex-1 text-inherit">
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className={cn(
                                'flex size-4 shrink-0 items-center justify-center',
                                action.status === 'failed'
                                  ? 'text-destructive'
                                  : 'text-muted-foreground'
                              )}
                            >
                              {action.icon}
                            </span>
                            <span
                              className={cn(
                                'min-w-0 break-words leading-5',
                                action.status === 'failed'
                                  ? 'text-foreground'
                                  : 'text-muted-foreground'
                              )}
                            >
                              {action.text}
                            </span>
                            {action.status === 'failed' && (
                              <Badge color="danger" className="shrink-0">
                                {intl.formatMessage({ id: 'failed', defaultMessage: 'Failed' })}
                              </Badge>
                            )}
                            {hasMissingResult && action.status === 'pending' && (
                              <Badge color="flat" className="shrink-0">
                                {intl.formatMessage({ id: 'stopped', defaultMessage: 'Stopped' })}
                              </Badge>
                            )}
                          </span>
                          {action.status === 'failed' && action.error && (
                            <span className="mt-1 block whitespace-pre-wrap break-words text-xs leading-5 text-destructive">
                              {action.error}
                            </span>
                          )}
                        </MarkerContent>
                      </Marker>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {fallbackErrorText &&
              (failedActionIndex === null || !parsedResult.stepErrors.has(failedActionIndex)) && (
                <div className="mt-2 rounded-md bg-destructive/8 px-2.5 py-2 text-xs text-destructive">
                  {fallbackErrorText}
                </div>
              )}
            {screenshotPreview}
          </div>
        </motion.div>
      )}
    </CollapsibleToolUseRow>
  );
});
