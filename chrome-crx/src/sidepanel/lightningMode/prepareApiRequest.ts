import type { MutableRefObject } from 'react';
import type { Span } from '@opentelemetry/api';
import { dispatchMessagesClient } from '../../utils/providerClient';
import { MessagesClient } from '../../mcpServersStore';
import { getModelsConfig } from '../../components/providers/AppProviders';
import {
  filterSyntheticMessages,
  manageScreenshotHistory,
  type LightningMessage
} from './commands';
import { resolveEffortLevel } from './runtime';
import type { LightningSystemPromptBlock } from '../types';
import type { LightningConfigController } from './config';

export interface PrepareApiRequestParams {
  allMessages: LightningMessage[];
  setLnMessages: (messages: LightningMessage[]) => void;
  config: LightningConfigController;
  systemPrompt: LightningSystemPromptBlock[];
  client: MessagesClient;
  modelsConfigRef: MutableRefObject<ReturnType<typeof getModelsConfig>>;
  abortControllerRef: MutableRefObject<AbortController | null>;
  span: Span;
  getEffectiveModel: () => string;
  isFastModel: () => boolean;
  resolveProviderIdFor: (model: string) => Promise<string>;
}

export async function prepareApiRequest(params: PrepareApiRequestParams) {
  let apiMessages = filterSyntheticMessages(params.allMessages);
  apiMessages = manageScreenshotHistory(apiMessages, params.config.screenshotHistory);

  params.allMessages.push({ role: 'assistant', content: [{ type: 'text', text: '' }] });
  params.setLnMessages([...params.allMessages]);

  for (const msg of apiMessages) {
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) delete block.cache_control;
    }
  }
  for (let i = apiMessages.length - 1; i >= 0; i--) {
    const msg = apiMessages[i];
    if (msg.role === 'assistant' && Array.isArray(msg.content) && msg.content.length > 0) {
      msg.content[msg.content.length - 1].cache_control = { type: 'ephemeral' };
      break;
    }
  }

  params.span.setAttribute('message_count', apiMessages.length);

  const model = params.getEffectiveModel();
  const effort = resolveEffortLevel(params.config.effort, model, params.modelsConfigRef.current);
  const fast = params.isFastModel();
  const providerId = await params.resolveProviderIdFor(model);
  const dispatched = await dispatchMessagesClient(providerId, params.client);
  const requestBody = {
    messages: apiMessages,
    model: dispatched.modelId,
    max_tokens: 10000,
    tools: [],
    system: params.systemPrompt,
    ...(effort !== 'none' && { output_config: { effort } }),
    betas: [
      ...(effort !== 'none' ? ['effort-2025-11-24'] : []),
      ...(fast ? ['fast-mode-2026-02-01'] : [])
    ],
    ...(fast && { speed: 'fast' }),
    stop_sequences: ['\n<<END>>']
  };

  const stream = dispatched.runtime.stream(requestBody, {
    signal: params.abortControllerRef.current?.signal
  });

  return { stream };
}
