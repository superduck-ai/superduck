import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
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
import { ChecklistIcon } from '@/sidepanel/components/icons';
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
  const isComplete = !!toolResult || !isStreaming;

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
            hasBatchError
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
    [actions, intl, toolResult, failedActionIndex, parsedResult, hasBatchError]
  );

  const fallbackErrorText = useMemo(() => {
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
  }, [failedActionIndex, hasBatchError, intl, parsedResult, resultText]);

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
  }, [actionCount, failedActionIndex, hasBatchError, intl, isComplete]);

  const screenshotData = useMemo(() => {
    if (!toolResult || typeof toolResult.content === 'string') return null;
    const imageContent = getBase64ImageBlocks(toolResult.content)[0];
    if (!imageContent) return null;
    return `data:${imageContent.source.media_type};base64,${imageContent.source.data}`;
  }, [toolResult]);

  const screenshotLabel = useMemo(() => {
    if (!screenshotData) return undefined;
    if (hasBatchError) {
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
    hasBatchError,
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
          className="h-8 rounded border border-border-300"
          style={{ objectFit: 'contain' }}
        />
      </div>
    ) : undefined;

  const screenshotPreview =
    screenshotData && screenshotLabel ? (
      <div
        role="button"
        tabIndex={0}
        aria-label={intl.formatMessage({
          id: 'open_browser_batch_screenshot',
          defaultMessage: 'Open action sequence screenshot'
        })}
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
        className="mt-2 flex cursor-pointer items-center gap-2 rounded-md border-[0.5px] border-border-300 bg-bg-000/50 px-2 py-1.5 transition-opacity hover:opacity-80"
      >
        <img
          src={screenshotData}
          alt={screenshotLabel}
          className="h-9 w-16 rounded border border-border-300"
          style={{ objectFit: 'contain' }}
        />
        <span className="min-w-0 truncate text-xs text-text-400">{screenshotLabel}</span>
      </div>
    ) : undefined;

  return (
    <CollapsibleToolUseRow
      isExpanded={isExpanded}
      setIsExpanded={setIsExpanded}
      isExpandingDisabled={actionCount === 0}
      isStreaming={!!isStreaming && !toolResult}
      icon={<ChecklistIcon size={12} className="text-text-500" />}
      text={displayText}
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
              <div className="overflow-hidden rounded-lg border-[0.5px] border-border-300 bg-bg-000/50">
                <ol className="flex flex-col divide-y divide-border-300/70">
                  {actionSummaries.map((action, index) => (
                    <li
                      key={`${action.toolName}-${index}`}
                      className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-x-1.5 px-3 py-2"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center self-start rounded-full border-[0.5px] border-border-300 text-[0.6875rem] leading-none text-text-400">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex min-h-6 items-center gap-2">
                          <span className="flex size-5 shrink-0 items-center justify-center text-text-400">
                            {action.icon}
                          </span>
                          <span className="min-w-0 break-words text-xs leading-5 text-text-300">
                            {action.text}
                          </span>
                        </div>
                        {action.status === 'failed' && action.error && (
                          <span className="mt-1 block whitespace-pre-wrap break-words pl-7 text-[0.6875rem] leading-4 text-danger-200">
                            {action.error}
                          </span>
                        )}
                      </div>
                      <span className="flex h-6 shrink-0 items-center justify-end self-start">
                        {action.status === 'complete' && (
                          <Check size={13} className="text-text-400" />
                        )}
                        {action.status === 'failed' && (
                          <Badge color="danger" className="min-w-10 justify-center">
                            {intl.formatMessage({ id: 'failed', defaultMessage: 'Failed' })}
                          </Badge>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {fallbackErrorText &&
              (failedActionIndex === null || !parsedResult.stepErrors.has(failedActionIndex)) && (
                <div className="mt-2 rounded-md border-[0.5px] border-danger-700/60 bg-danger-900/40 px-2 py-1.5 text-xs text-danger-200">
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
