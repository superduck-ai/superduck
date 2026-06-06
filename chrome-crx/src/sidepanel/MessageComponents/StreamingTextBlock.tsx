import React, { useMemo, useSyncExternalStore } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  createStandardMarkdownComponents,
  preprocessMarkdownText,
  STANDARD_MARKDOWN_GRID_CLASS,
  useMathPlugins,
  buildRemarkPlugins,
  buildRehypePlugins
} from '../components/MarkdownComponents';
import type { StreamingTextStore } from '../types';

/** Lightweight component that subscribes to the streaming text store.
 * Only THIS component re-renders on each rAF during streaming — not the entire MessageList. */
export function StreamingTextBlock({ store }: { store: StreamingTextStore }) {
  const streamingText = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { remarkMath, rehypeKatex } = useMathPlugins();

  const remarkPlugins = useMemo(() => [remarkGfm, ...buildRemarkPlugins(remarkMath)], [remarkMath]);
  const rehypePlugins = useMemo(() => buildRehypePlugins(rehypeKatex), [rehypeKatex]);
  const mdComponents = useMemo(() => createStandardMarkdownComponents(), []);

  // Memoize processed text to avoid reprocessing on every render
  const processedText = useMemo(() => {
    if (!streamingText) return '';
    return preprocessMarkdownText(streamingText);
  }, [streamingText]);

  // The global footer already renders the active tool/status line.
  // Avoid duplicating that placeholder inside the message list.
  if (!streamingText) {
    return null;
  }

  return (
    <div className="flex items-start group">
      <div className="max-w-4xl superduck-response w-full break-words">
        <div className="font-superduck-response text-sm leading-[1.65rem] text-text-100 break-words">
          <div className={`standard-markdown streaming-markdown ${STANDARD_MARKDOWN_GRID_CLASS}`}>
            <ReactMarkdown
              remarkPlugins={remarkPlugins}
              rehypePlugins={rehypePlugins}
              components={mdComponents}
            >
              {processedText}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
