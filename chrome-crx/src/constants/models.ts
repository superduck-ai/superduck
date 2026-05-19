export interface ModelOption {
  value: string;
  label: string;
}

/**
 * 内置模型列表
 * 按优先级排序：Deep > (Standard) > Flash
 */
export const BUILT_IN_MODELS: ModelOption[] = [
  {
    value: 'claude-opus-4-6',
    label: 'Deep'
  },
  {
    value: 'claude-sonnet-4-6',
    label: 'Smart'
  },
  {
    value: 'claude-haiku-4-5-20251001',
    label: 'Flash'
  }
];

/**
 * 默认使用的模型（Deep）
 */
export const DEFAULT_MODEL = 'claude-opus-4-6';

/**
 * 快速模型（Flash，用于简单任务）
 */
export const FAST_MODEL = 'claude-haiku-4-5-20251001';

/**
 * 模型别名映射
 */
export const MODEL_ALIASES: Record<string, string> = {
  // Deep (Opus 4.6) 别名
  'claude-opus-4.6': 'claude-opus-4-6',
  'claude-4-opus': 'claude-opus-4-6',
  'opus-4-6': 'claude-opus-4-6',

  // Sonnet 4.6 别名
  'claude-sonnet-4.6': 'claude-sonnet-4-6',
  'claude-4-sonnet': 'claude-sonnet-4-6',
  'sonnet-4-6': 'claude-sonnet-4-6',

  // 旧版本 Deep (Opus 4) 别名（向后兼容）
  'claude-opus-4-20250514': 'claude-opus-4-6',
  'claude-opus-4-0': 'claude-opus-4-6',
  'claude-4-opus-20250514': 'claude-opus-4-6',
  'claude-opus-4@20250514': 'claude-opus-4-6',
  'anthropic.claude-opus-4-20250514-v1:0': 'claude-opus-4-6',
  'claude-opus-4-1-20250805': 'claude-opus-4-6',
  'claude-opus-4-1@20250805': 'claude-opus-4-6',
  'anthropic.claude-opus-4-1-20250805-v1:0': 'claude-opus-4-6',

  // Sonnet 旧版别名（向后兼容）
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

/**
 * 检查是否为 Deep (Opus) 模型
 */
export function isOpusModel(modelId: string): boolean {
  const normalized = normalizeModelId(modelId);
  return normalized.includes('opus');
}

/**
 * 检查是否为 Sonnet 模型
 */
export function isSonnetModel(modelId: string): boolean {
  const normalized = normalizeModelId(modelId);
  return normalized.includes('sonnet');
}

/**
 * 检查是否为 Flash (Haiku) 模型
 */
export function isHaikuModel(modelId: string): boolean {
  const normalized = normalizeModelId(modelId);
  return normalized.includes('haiku');
}
