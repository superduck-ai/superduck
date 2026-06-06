import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bookmark, Check, ChevronDown, Copy } from 'lucide-react';
import {
  hasShortcutMarkers,
  renderTextWithShortcutChips,
  resolveShortcutMarkersForCopy
} from '../shortcutMarkers';
import { ImagePreviewModal } from '../MessageViews';
import { Tooltip } from '../Tooltip';
import { getTextFromBlockContent, getBase64ImageBlocks } from '../sidepanelUtils';
import { isRecord } from '../../messageTypes';
import type { ApiConversationMessage, ApiToolResultBlock } from '../../messageTypes';

export function UserMessageRow({
  content,
  toolResults,
  onSavePrompt,
  onEditShortcut
}: {
  content: ApiConversationMessage['content'];
  toolResults?: ApiToolResultBlock[];
  onSavePrompt?: (text: string) => void;
  onEditShortcut?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Memoize remarkPlugins array to avoid recreating on every render
  const remarkPlugins = useMemo(() => [remarkGfm], []);

  let text = '';
  let images = getBase64ImageBlocks(Array.isArray(content) ? content : null);
  const hasToolResults = (toolResults?.length ?? 0) > 0;

  if (typeof content === 'string') {
    text = content;
    images = [];
  } else if (Array.isArray(content)) {
    text = getTextFromBlockContent(content);
    images = images.filter((image) => {
      // Filter out _autoScreenshot and workflow-step images like the bundle does
      const metadata = isRecord(image.source.metadata) ? image.source.metadata : undefined;
      if (metadata?.fileName === '_autoScreenshot') return false;
      return true;
    });
  }

  const displayText = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
  // Recalculate isToolResultOnly after computing displayText
  const effectiveIsToolResultOnly = hasToolResults && !displayText;

  if (!displayText && images.length === 0 && !hasToolResults) return null;

  const handleCopy = async () => {
    if (!displayText) return;
    const textToCopy = await resolveShortcutMarkersForCopy(displayText);
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={(effectiveIsToolResultOnly ? 'w-full py-3' : 'flex justify-end') + ' group'}>
      <div
        className={
          effectiveIsToolResultOnly ? 'w-full' : 'flex flex-col items-end max-w-[85%] min-w-0'
        }
      >
        {images.length > 0 && (
          <div className={'flex flex-wrap gap-2 justify-end ' + (displayText ? 'mb-2' : 'py-5')}>
            {images.map((img, idx) => {
              const src = `data:${img.source.media_type};base64,${img.source.data}`;
              return (
                <div
                  key={idx}
                  className="w-[120px] h-[120px] rounded-lg overflow-hidden border border-border-300/50 hover:border-border-200 shadow-sm shadow-always-black/5 cursor-pointer transition-all"
                  onClick={() => setPreviewImage(src)}
                >
                  <img
                    src={src}
                    alt={`Attached image ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              );
            })}
          </div>
        )}

        {displayText && (
          <div
            className={
              'relative inline-flex flex-col break-words max-w-full ' +
              (displayText && !hasToolResults ? 'px-4 py-3 bg-bg-300 rounded-[14px]' : 'w-full')
            }
          >
            {displayText && (
              <div
                className={
                  'relative transition-all duration-300 ease-in-out' +
                  (hasToolResults ? ' ml-auto px-4 py-3 bg-bg-300 rounded-[14px]' : '') +
                  (!expanded && displayText.length > 500 ? ' max-h-[300px] overflow-hidden' : '') +
                  (expanded && displayText.length > 500 ? ' max-h-[50000px] overflow-hidden' : '')
                }
              >
                <div className="font-base">
                  {hasShortcutMarkers(displayText) ? (
                    renderTextWithShortcutChips(displayText, onEditShortcut)
                  ) : (
                    <ReactMarkdown remarkPlugins={remarkPlugins}>{displayText}</ReactMarkdown>
                  )}
                </div>
                {!expanded && displayText.length > 500 && (
                  <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-bg-300 to-transparent pointer-events-none transition-opacity duration-300" />
                )}
                {displayText.length > 500 && (
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className="absolute bottom-0.5 right-0 p-1.5 bg-bg-500 hover:bg-bg-200 rounded-full transition-colors border-[0.5px] border-border-400/50 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
                    aria-label={expanded ? 'Collapse message' : 'Expand message'}
                  >
                    <div
                      className={
                        'transition-transform duration-300 ' + (expanded ? 'rotate-180' : '')
                      }
                    >
                      <ChevronDown size={12} className="text-text-300" />
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {displayText && (
          <div className="h-7 flex justify-end items-center">
            <div className="flex items-center gap-0.5 pr-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto">
              {onSavePrompt && (
                <Tooltip tooltipContent="Save as shortcut" side="bottom">
                  <button
                    onClick={() => onSavePrompt(displayText)}
                    className="p-1.5 rounded-md transition-colors text-text-300 hover:bg-bg-300 hover:text-text-100"
                    aria-label="Save as shortcut"
                  >
                    <Bookmark size={12} />
                  </button>
                </Tooltip>
              )}
              <Tooltip
                tooltipContent={copied ? 'Copied' : 'Copy'}
                side="bottom"
                open={copied || undefined}
                delayDuration={copied ? 0 : 200}
              >
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-md transition-colors text-text-300 hover:bg-bg-300 hover:text-text-100"
                  aria-label="Copy message"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </Tooltip>
            </div>
          </div>
        )}
      </div>
      <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}
