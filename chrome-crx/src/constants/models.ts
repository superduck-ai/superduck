import {
  OPENROUTER_MODEL_INDEX,
  OPENROUTER_MODELS,
  type OpenRouterModelMetadata
} from './openRouterModels';

export type { OpenRouterModelMetadata } from './openRouterModels';

/**
 * 模型上下文窗口表与别名规范化。
 *
 * 注：Deep / Smart / Flash 档位抽象已移除，模型选择直接由用户配置的
 * provider 决定。这里只保留 context-length 解析所需的最小数据。
 */
export const DEFAULT_CONTEXT_LENGTH = 256_000;

/**
 * Model id used when a request falls back to the OAuth / default-gateway
 * client (i.e. no provider was resolved). The picker no longer ships built-in
 * models, but the legacy OAuth/customApi path still needs a concrete model id
 * to put on the wire — this keeps that path from sending `model: ""`.
 */
export const OAUTH_FALLBACK_MODEL = 'claude-sonnet-4-6';

const MODEL_CONTEXT_LENGTH_OVERRIDES: Record<string, number> = {
  'claude-opus-4-6': 1_000_000,
  'claude-sonnet-4-6': 1_000_000,
  'claude-haiku-4-5-20251001': 200_000,
  'claude-opus-4-20250514': 200_000,
  'claude-opus-4-0': 200_000,
  'claude-4-opus-20250514': 200_000,
  'claude-opus-4@20250514': 200_000,
  'anthropic.claude-opus-4-20250514-v1:0': 200_000,
  'claude-opus-4-1-20250805': 200_000,
  'claude-opus-4-1@20250805': 200_000,
  'anthropic.claude-opus-4-1-20250805-v1:0': 200_000,
  'claude-sonnet-4-5-20250929': 200_000,
  'claude-3-5-sonnet-20241022': 200_000,
  'claude-3-sonnet-20240229': 200_000,
  'kimi-k2.5': 262_144
};

export interface ConfiguredModelMetadata extends Partial<OpenRouterModelMetadata> {
  id: string;
  contextLength: number;
  source: 'openrouter' | 'builtin';
}

/**
 * 模型别名映射
 */
export const MODEL_ALIASES: Record<string, string> = {
  'claude-opus-4.6': 'claude-opus-4-6',
  'claude-4-opus': 'claude-opus-4-6',
  'opus-4-6': 'claude-opus-4-6',

  'claude-sonnet-4.6': 'claude-sonnet-4-6',
  'claude-4-sonnet': 'claude-sonnet-4-6',
  'sonnet-4-6': 'claude-sonnet-4-6',

  'claude-opus-4-20250514': 'claude-opus-4-6',
  'claude-opus-4-0': 'claude-opus-4-6',
  'claude-4-opus-20250514': 'claude-opus-4-6',
  'claude-opus-4@20250514': 'claude-opus-4-6',
  'anthropic.claude-opus-4-20250514-v1:0': 'claude-opus-4-6',
  'claude-opus-4-1-20250805': 'claude-opus-4-6',
  'claude-opus-4-1@20250805': 'claude-opus-4-6',
  'anthropic.claude-opus-4-1-20250805-v1:0': 'claude-opus-4-6',

  'claude-sonnet-4-5-20250929': 'claude-sonnet-4-6',
  'claude-3-5-sonnet-20241022': 'claude-sonnet-4-6',
  'claude-3-sonnet-20240229': 'claude-sonnet-4-6',

  'kimi-k2.5-0127': 'kimi-k2.5'
};

/**
 * 获取模型的规范化 ID
 */
export function normalizeModelId(modelId: string): string {
  return MODEL_ALIASES[modelId] || modelId;
}

export function getModelIdLookupCandidates(modelId: string): string[] {
  const trimmed = modelId.trim();
  if (!trimmed) return [];
  const withoutModelsPrefix = trimmed.startsWith('models/')
    ? trimmed.slice('models/'.length)
    : trimmed;
  const providerless = withoutModelsPrefix.includes('/')
    ? withoutModelsPrefix.split('/').pop() || ''
    : '';
  return Array.from(
    new Set(
      [
        withoutModelsPrefix,
        normalizeModelId(withoutModelsPrefix),
        providerless,
        providerless ? normalizeModelId(providerless) : ''
      ].filter(Boolean)
    )
  );
}

function getContextLengthOverride(modelId: string): number | undefined {
  for (const candidate of getModelIdLookupCandidates(modelId)) {
    const contextLength = MODEL_CONTEXT_LENGTH_OVERRIDES[candidate];
    if (contextLength) return contextLength;
  }
  return undefined;
}

export function getOpenRouterModelMetadata(modelId: string): OpenRouterModelMetadata | undefined {
  for (const candidate of getModelIdLookupCandidates(modelId)) {
    const index =
      OPENROUTER_MODEL_INDEX[candidate] ?? OPENROUTER_MODEL_INDEX[candidate.toLowerCase()];
    if (typeof index === 'number') return OPENROUTER_MODELS[index];
  }
  return undefined;
}

export function getConfiguredModelMetadata(modelId: string): ConfiguredModelMetadata | undefined {
  const openRouterModel = getOpenRouterModelMetadata(modelId);
  const contextLengthOverride = getContextLengthOverride(modelId);
  if (openRouterModel) {
    return {
      ...openRouterModel,
      contextLength: contextLengthOverride ?? openRouterModel.contextLength,
      source: 'openrouter'
    };
  }
  if (contextLengthOverride) {
    return {
      id: modelId.trim(),
      contextLength: contextLengthOverride,
      source: 'builtin'
    };
  }
  return undefined;
}

export function getConfiguredModelContextLength(modelId: string): number | undefined {
  return getConfiguredModelMetadata(modelId)?.contextLength;
}

export function getPreferredConfiguredModelContextLength(
  modelId: string,
  detectedContextLength?: number
): number | undefined {
  const detected =
    typeof detectedContextLength === 'number' &&
    Number.isFinite(detectedContextLength) &&
    detectedContextLength > 0
      ? Math.floor(detectedContextLength)
      : undefined;
  if (detected && detected !== DEFAULT_CONTEXT_LENGTH) return detected;
  return getConfiguredModelContextLength(modelId) ?? detected;
}

export function getModelContextLength(modelId: string): number {
  return getConfiguredModelContextLength(modelId) ?? DEFAULT_CONTEXT_LENGTH;
}
