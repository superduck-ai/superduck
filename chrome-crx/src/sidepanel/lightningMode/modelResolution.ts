import { OAUTH_FALLBACK_MODEL } from '../../constants/models';
import type { MessagesClient } from '../../mcpServersStore';
import { dispatchMessagesClient, resolveClientForProvider } from '../../utils/providerClient';
import { findProvider, loadProviderConfig } from '../../utils/providerStore';
import { resolveEffectiveContextWindow } from '../conversation/contextWindow';
import { getBaseModel, parseModelTag } from '../session';
import type { LightningCreateApiMessageParams } from '../types';

export function isFastLightningModel(model: string): boolean {
  return parseModelTag(model).hasFastTag;
}

export async function resolveLightningProviderId(
  model: string,
  fallbackModel: string
): Promise<string> {
  const candidate = getBaseModel(model);
  if (candidate) {
    const config = await loadProviderConfig();
    if (findProvider(config, candidate)) return candidate;
  }
  return getBaseModel(fallbackModel);
}

export async function createLightningApiMessage({
  client,
  params,
  effectiveModel,
  fallbackModel
}: {
  client: MessagesClient;
  params: LightningCreateApiMessageParams;
  effectiveModel: string;
  fallbackModel: string;
}) {
  const fast = isFastLightningModel(effectiveModel);
  const betas = [];
  if (fast) betas.push('fast-mode-2026-02-01');
  const providerId = await resolveLightningProviderId(
    params.model || effectiveModel,
    fallbackModel
  );
  const dispatched = await dispatchMessagesClient(providerId, client);
  const requestBody = {
    model: dispatched.modelId,
    max_tokens: params.maxTokens,
    messages: params.messages,
    system: params.system,
    betas,
    ...(fast && { speed: 'fast' })
  };
  return await dispatched.runtime.create(requestBody);
}

export async function resolveLightningContextWindow({
  effectiveModel,
  fallbackModel
}: {
  effectiveModel: string;
  fallbackModel: string;
}): Promise<number> {
  const providerId = await resolveLightningProviderId(effectiveModel, fallbackModel);
  try {
    const resolved = await resolveClientForProvider(providerId);
    const contextModelId = resolved?.modelId || OAUTH_FALLBACK_MODEL;
    return resolveEffectiveContextWindow({
      modelId: contextModelId,
      providerContextLength: resolved?.provider.contextLength
    });
  } catch {
    return resolveEffectiveContextWindow({ modelId: OAUTH_FALLBACK_MODEL });
  }
}
