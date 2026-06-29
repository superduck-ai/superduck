import React, { useMemo, useState } from 'react';
import { useIntlSafe } from '../../../index-react-dom-intl';
import type { ApiToolResultBlock } from '../../../messageTypes';
import {
  asFormatMessageLike,
  getToolDisplayInfo,
  resolveToolIcon
} from '../../toolViews/toolDisplay';
import { getBase64ImageBlocks } from '../../sidepanelUtils';
import { CollapsibleToolUseRow } from '../../toolViews';
import { useUIStore } from '../../stores/uiStore';
import type { ToolInputRecord } from '../../types';

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
  const isExpandingDisabled = true;

  const info = useMemo(
    () => getToolDisplayInfo(toolName, input, toolResult, asFormatMessageLike(intlBrowserTool)),
    [toolName, input, toolResult, intlBrowserTool]
  );
  const displayText = toolDisplayName || info.text;
  const icon = useMemo(() => resolveToolIcon(info.icon, 16), [info.icon]);

  const screenshotData = useMemo(() => {
    const isScreenshotTool =
      toolName === 'screenshot' || (toolName === 'computer' && input?.action === 'screenshot');

    if (!isScreenshotTool || !toolResult || toolResult.is_error) return null;

    if (typeof toolResult.content === 'string') return null;

    const imageContent = getBase64ImageBlocks(toolResult.content)[0];

    if (imageContent) {
      return `data:${imageContent.source.media_type};base64,${imageContent.source.data}`;
    }
    return null;
  }, [toolName, input, toolResult]);

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
