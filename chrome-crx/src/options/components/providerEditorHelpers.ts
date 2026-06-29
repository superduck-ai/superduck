import {
  DEFAULT_BASE_URL,
  normalizeProviderBaseURL,
  type AiProvider,
  type ProviderKind
} from '@/utils/providerStore';

export const CONTEXT_LENGTH_DETECT_DELAY_MS = 350;

export type ContextLengthSource =
  | 'none'
  | 'saved'
  | 'provider'
  | 'cache'
  | 'builtin'
  | 'default'
  | 'manual';

export function formatContextLengthInput(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '';
  return String(Math.floor(value));
}

export function parseContextLengthInput(value: string): number | undefined {
  const normalized = value.replace(/[,_\s]/g, '');
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

export function normalizeProviderScopeBaseURL(kind: ProviderKind, baseURL: string): string {
  return normalizeProviderBaseURL(kind, baseURL || DEFAULT_BASE_URL[kind]);
}

export function isSameProviderScope(
  provider: AiProvider | null | undefined,
  kind: ProviderKind,
  baseURL: string
): boolean {
  if (!provider || provider.kind !== kind) return false;
  return (
    normalizeProviderScopeBaseURL(provider.kind, provider.baseURL) ===
    normalizeProviderScopeBaseURL(kind, baseURL)
  );
}
