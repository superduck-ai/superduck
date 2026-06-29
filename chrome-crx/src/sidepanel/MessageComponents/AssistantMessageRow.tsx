import { useMemo, useState } from 'react';
import { Check, Copy, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useIntlSafe } from '../../index-react-dom-intl';
import { isTextContentBlock, isToolUseContentBlock } from '../../messageTypes';
import type { ApiConversationMessage, ApiMessageBlock } from '../../messageTypes';
import { trackEvent } from '../../mcpRuntime';
import { Tooltip } from '@/sidepanel/components/Tooltip';
import { ContentBlocksRenderer } from './ContentBlocksRenderer';

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

  const processedBlocks = useMemo<ApiMessageBlock[]>(() => {
    return blocks.map((block) => {
      if (isTextContentBlock(block) && block.text) {
        const text = block.text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
        return { ...block, text };
      }
      return block;
    });
  }, [blocks]);

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
