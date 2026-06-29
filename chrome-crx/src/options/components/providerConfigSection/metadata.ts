import { type AiProvider, type ProviderModelMetadata } from '@/utils/providerStore';
import { getConfiguredModelMetadata } from '@/constants/models';

const INPUT_MODALITY_ORDER = ['text', 'image', 'video', 'audio', 'file'];

export function getProviderBadgeText(provider: AiProvider): string {
  return provider.name.trim().charAt(0).toUpperCase() || '?';
}

function normalizeInputModality(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^input[_-]?/, '');
  if (!normalized) return '';
  if (normalized.includes('image')) return 'image';
  if (normalized.includes('video')) return 'video';
  if (normalized.includes('audio') || normalized.includes('sound')) return 'audio';
  if (
    normalized.includes('file') ||
    normalized.includes('document') ||
    normalized.includes('pdf')
  ) {
    return 'file';
  }
  if (normalized.includes('text')) return 'text';
  return normalized;
}

export function getInputModalitiesFromMetadata(
  metadata: ProviderModelMetadata | undefined
): string[] {
  if (!metadata) return [];
  const explicit = metadata.inputModalities ?? [];
  const parsedFromModality = metadata.modality
    ? (metadata.modality.split('->')[0]?.split('+') ?? [])
    : [];
  const values = explicit.length > 0 ? explicit : parsedFromModality;
  return Array.from(
    new Set(values.map(normalizeInputModality).filter((value) => value.trim().length > 0))
  ).sort((a, b) => {
    const aIndex = INPUT_MODALITY_ORDER.indexOf(a);
    const bIndex = INPUT_MODALITY_ORDER.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

export function hasInputModalityMetadata(metadata: ProviderModelMetadata | undefined): boolean {
  return getInputModalitiesFromMetadata(metadata).length > 0;
}

export function getModelMetadata(
  modelId: string,
  cacheKey: string,
  cachedModelMetadata: Record<string, ProviderModelMetadata | null>
): ProviderModelMetadata | undefined {
  const trimmedModelId = modelId.trim();
  if (!trimmedModelId) return undefined;
  const configured = getConfiguredModelMetadata(trimmedModelId);
  const cached = cachedModelMetadata[cacheKey] ?? undefined;
  if (!configured) return cached;
  if (!cached || hasInputModalityMetadata(configured)) return configured;
  return {
    ...cached,
    ...configured,
    modality: configured.modality ?? cached.modality,
    inputModalities: configured.inputModalities ?? cached.inputModalities
  };
}

export interface ProviderStatusInfo {
  status: AiProvider['status'];
  message?: string;
}

export interface SaveNotice {
  id: number;
  message: string;
  tone: 'success' | 'warning';
}
