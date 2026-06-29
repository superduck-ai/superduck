import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useIntlSafe } from '../../../index-react-dom-intl';
import { isRecord } from '../../../messageTypes';
import type { ApiToolResultBlock, ApiToolUseBlock } from '../../../messageTypes';
import { getToolDisplayName, resolveToolNameIcon } from '../../toolViews/toolDisplay';
import { getBase64ImageBlocks, getTextFromBlockContent } from '../../sidepanelUtils';
import { Badge, TimelineGroupItem } from '../../toolViews';
import { ShimmerText } from '@/sidepanel/components/StatusDisplay';
import { EqualizerIcon } from '@/sidepanel/components/icons';
import type { ToolInputRecord, ToolResultDisplayContent } from '../../types';

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

  const displayName = useMemo(() => {
    if (explicitDisplayName) return explicitDisplayName;
    return getToolDisplayName(block.name);
  }, [block.name, explicitDisplayName]);

  const toolIcon = useMemo(() => {
    if (explicitIcon) return explicitIcon;
    const nameIcon = resolveToolNameIcon(block.name, 12);
    if (nameIcon) return nameIcon;
    return <EqualizerIcon size={12} className="text-text-300" />;
  }, [explicitIcon, block.name]);

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

  const headerButton = (
    <button
      className={`group/row flex flex-row items-center rounded-lg px-2.5 w-full justify-between ${
        renderMode !== 'TimelineGroup' ? 'py-2' : ''
      } text-text-300 !cursor-default`}
    >
      <div className="flex flex-row items-center gap-2 min-w-0 flex-1">
        {renderMode !== 'TimelineGroup' && (
          <div className="flex items-center justify-center text-text-500 shrink-0">{toolIcon}</div>
        )}
        <div className="text-sm text-text-500 text-left truncate w-0 flex-grow">
          {isStreaming && !hasResult ? <ShimmerText>{displayName}</ShimmerText> : displayName}
        </div>
      </div>
    </button>
  );

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
