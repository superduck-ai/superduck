import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useMathPlugins } from '../components/MarkdownComponents';
import { useIntlSafe } from '../../index-react-dom-intl';
import { isToolUseContentBlock } from '../../messageTypes';
import type { ApiConversationMessage, ApiMessageBlock, ApiToolUseBlock } from '../../messageTypes';
import { asFormatMessageLike, formatStepCountLabel } from '../toolViews/toolDisplay';
import { TIMELINE_ANIM_DURATION, TIMELINE_SNAPPY_OUT } from '../toolViews';
import { BlockRenderer } from './BlockRenderer';
import { splitAnswerBlocks } from '../answerBlocks';

/** ContentBlocksRenderer — splits blocks at turn_answer_start, collapses tool steps when complete. */
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
  const { remarkMath, rehypeKatex } = useMathPlugins();

  const { blocksBeforeAnswer, blocksAfterAnswer, hasFinalAnswer, answerStartIndex } = useMemo(
    () => splitAnswerBlocks(blocks),
    [blocks]
  );

  const toolUseCount = useMemo(() => {
    const target = hasFinalAnswer ? blocksBeforeAnswer : blocks;
    return target.filter(
      (b): b is ApiToolUseBlock => isToolUseContentBlock(b) && b.name !== 'turn_answer_start'
    ).length;
  }, [blocks, blocksBeforeAnswer, hasFinalAnswer]);

  const shouldCollapse = !isStreaming && toolUseCount >= 3;

  const renderBlocks = (
    list: ApiMessageBlock[],
    keyPrefix: string,
    streaming: boolean,
    offset = 0
  ) =>
    list.map((block, i) => (
      <BlockRenderer
        key={`${keyPrefix}-${offset + i}`}
        block={block}
        index={i}
        blocks={list}
        renderMode="Standard"
        isStreaming={streaming}
        allMessages={allMessages}
        remarkMath={remarkMath}
        rehypeKatex={rehypeKatex}
      />
    ));

  const renderCollapsible = (list: ApiMessageBlock[], keyPrefix: string) => (
    <>
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
      <AnimatePresence>
        {showCollapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ ease: TIMELINE_SNAPPY_OUT, duration: TIMELINE_ANIM_DURATION }}
            className="overflow-hidden"
          >
            {renderBlocks(list, keyPrefix, false)}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  if (hasFinalAnswer) {
    if (shouldCollapse) {
      return (
        <>
          {renderCollapsible(blocksBeforeAnswer, 'before-answer')}
          {renderBlocks(blocksAfterAnswer, 'after-answer', false, answerStartIndex)}
        </>
      );
    }
    return (
      <>
        {renderBlocks(blocksBeforeAnswer, 'before-answer', false)}
        {renderBlocks(blocksAfterAnswer, 'after-answer', false, answerStartIndex)}
      </>
    );
  }

  if (shouldCollapse) return renderCollapsible(blocks, 'block');
  return <>{renderBlocks(blocks, 'block', isStreaming)}</>;
}
