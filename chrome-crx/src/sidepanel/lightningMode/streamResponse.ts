import type { MutableRefObject } from 'react';
import type { Span } from '@opentelemetry/api';
import { withTracing } from '../../observability';
import type { LightningMessage } from './commands';
import type { prepareApiRequest } from './prepareApiRequest';

type Stream = Awaited<ReturnType<typeof prepareApiRequest>>['stream'];

export interface Phases {
  ttfbMs: number;
  streamingMs: number;
  commandExecutionMs: number;
  pageSettleMs: number;
  screenshotMs: number;
}

export interface StreamResponseParams {
  stream: Stream;
  allMessages: LightningMessage[];
  setLnMessages: (messages: LightningMessage[]) => void;
  setLnLastStopReason: (reason: { reason: string; messageId?: string } | null) => void;
  cancelledRef: MutableRefObject<boolean>;
  span: Span;
  phases: Phases;
}

export async function streamResponse(
  params: StreamResponseParams
): Promise<{ fullText: string } | null> {
  const { stream, allMessages, span, phases, cancelledRef } = params;

  let fullText = '';
  let ttfbResolved = false;
  const streamStartTime = performance.now();
  let ttfbDuration = 0;
  let streamingDuration = 0;
  let outputTokens = 0;

  const ttfbPromise = withTracing(
    'lightning_ttfb',
    async (ttfbSpan: Span) => {
      return new Promise<void>((resolve) => {
        stream.once('text', () => {
          ttfbDuration = performance.now() - streamStartTime;
          phases.ttfbMs = Math.round(ttfbDuration);
          ttfbSpan.setAttribute('ttfb_ms', Math.round(ttfbDuration));
          resolve();
        });
        stream.once('end', () => {
          if (!ttfbResolved) resolve();
        });
      });
    },
    span
  ).then(() => {
    ttfbResolved = true;
  });

  stream.on('text', (delta: string) => {
    fullText += delta;
    const lastMsg = allMessages[allMessages.length - 1];
    if (lastMsg && 'role' in lastMsg && lastMsg.role === 'assistant') {
      lastMsg.content = [{ type: 'text', text: fullText }];
      params.setLnMessages([...allMessages]);
    }
  });

  await ttfbPromise;

  const finalMessage = await withTracing(
    'lightning_streaming',
    async (streamSpan: Span) => {
      const msg = await stream.finalMessage();
      streamingDuration = performance.now() - streamStartTime - ttfbDuration;
      phases.streamingMs = Math.round(streamingDuration);
      outputTokens = msg.usage?.output_tokens ?? 0;
      streamSpan.setAttribute('streaming_ms', Math.round(streamingDuration));
      streamSpan.setAttribute('output_tokens', outputTokens);
      return msg;
    },
    span
  );

  allMessages[allMessages.length - 1] = {
    role: 'assistant',
    content: finalMessage.content,
    usage: finalMessage.usage,
    id: finalMessage.id,
    stop_reason: finalMessage.stop_reason
  };
  const lastAssistant = allMessages[allMessages.length - 1];
  if (
    Array.isArray(lastAssistant.content) &&
    lastAssistant.content.length === 1 &&
    lastAssistant.content[0].type === 'text' &&
    lastAssistant.content[0].text === ''
  ) {
    lastAssistant.content[0].text = fullText || ' ';
  }
  params.setLnMessages([...allMessages]);

  params.setLnLastStopReason({
    reason: finalMessage.stop_reason || 'end_turn',
    messageId: finalMessage.id
  });

  if (cancelledRef.current) return null;
  return { fullText };
}
