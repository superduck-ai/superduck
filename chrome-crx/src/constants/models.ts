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

export const MODEL_CONTEXT_LENGTHS: Record<string, number> = {
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
  'claude-3-sonnet-20240229': 200_000
};

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
  'claude-3-sonnet-20240229': 'claude-sonnet-4-6'
};

/**
 * 获取模型的规范化 ID
 */
export function normalizeModelId(modelId: string): string {
  return MODEL_ALIASES[modelId] || modelId;
}

export function getConfiguredModelContextLength(modelId: string): number | undefined {
  const direct = MODEL_CONTEXT_LENGTHS[modelId];
  if (direct) return direct;
  const normalized = normalizeModelId(modelId);
  return MODEL_CONTEXT_LENGTHS[normalized];
}

export function getModelContextLength(modelId: string): number {
  return getConfiguredModelContextLength(modelId) ?? DEFAULT_CONTEXT_LENGTH;
}
