import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useIntlSafe } from '../../index-react-dom-intl';
import { isTextContentBlock, isToolUseContentBlock } from '../../messageTypes';
import type { ApiConversationMessage, ApiMessageBlock } from '../../messageTypes';
import { trackEvent } from '../../mcpRuntime';
import { Button, SimpleTooltip } from '@/components/ui';
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
  const [copyTooltipOpen, setCopyTooltipOpen] = useState(false);
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null);
  const copyFeedbackTimeoutRef = useRef<number | null>(null);
  const intl = useIntlSafe();

  const closeCopyFeedback = () => {
    if (copyFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(copyFeedbackTimeoutRef.current);
      copyFeedbackTimeoutRef.current = null;
    }
    setCopied(false);
    setCopyTooltipOpen(false);
  };

  useEffect(
    () => () => {
      if (copyFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
    },
    []
  );

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
    if (copyFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(copyFeedbackTimeoutRef.current);
    }
    setCopied(true);
    setCopyTooltipOpen(true);
    copyFeedbackTimeoutRef.current = window.setTimeout(() => {
      setCopied(false);
      setCopyTooltipOpen(false);
      copyFeedbackTimeoutRef.current = null;
    }, 2000);
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
                <SimpleTooltip
                  tooltipContent={
                    copied
                      ? intl.formatMessage({ id: 'copied', defaultMessage: 'Copied' })
                      : intl.formatMessage({ id: 'copy', defaultMessage: 'Copy' })
                  }
                  side="bottom"
                  open={copyTooltipOpen}
                  onOpenChange={setCopyTooltipOpen}
                  delayDuration={copied ? 0 : 200}
                >
                  <Button
                    onClick={handleCopy}
                    onPointerLeave={(event) => {
                      closeCopyFeedback();
                      event.currentTarget.blur();
                    }}
                    variant="ghost"
                    size="icon-xs"
                    className="size-6 text-muted-foreground hover:text-foreground"
                    aria-label={intl.formatMessage({
                      id: 'copy_message',
                      defaultMessage: 'Copy message'
                    })}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </Button>
                </SimpleTooltip>
              )}
              <SimpleTooltip
                tooltipContent={intl.formatMessage({
                  id: 'give_positive_feedback',
                  defaultMessage: 'Give positive feedback'
                })}
                side="bottom"
              >
                <Button
                  onClick={() => {
                    const next = feedback === 'positive' ? null : 'positive';
                    setFeedback(next);
                    if (next)
                      void trackEvent('superduck.sidebar.message_feedback', {
                        sentiment: 'positive'
                      });
                  }}
                  variant="ghost"
                  size="icon-xs"
                  className={`size-6 ${feedback === 'positive' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  aria-label={intl.formatMessage({
                    id: 'good_response',
                    defaultMessage: 'Good response'
                  })}
                >
                  <ThumbsUp size={12} />
                </Button>
              </SimpleTooltip>
              <SimpleTooltip
                tooltipContent={intl.formatMessage({
                  id: 'give_negative_feedback',
                  defaultMessage: 'Give negative feedback'
                })}
                side="bottom"
              >
                <Button
                  onClick={() => {
                    const next = feedback === 'negative' ? null : 'negative';
                    setFeedback(next);
                    if (next)
                      void trackEvent('superduck.sidebar.message_feedback', {
                        sentiment: 'negative'
                      });
                  }}
                  variant="ghost"
                  size="icon-xs"
                  className={`size-6 ${feedback === 'negative' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  aria-label={intl.formatMessage({
                    id: 'bad_response',
                    defaultMessage: 'Bad response'
                  })}
                >
                  <ThumbsDown size={12} />
                </Button>
              </SimpleTooltip>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
