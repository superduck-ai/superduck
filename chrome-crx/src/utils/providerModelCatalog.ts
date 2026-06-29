import OpenAI from 'openai';
import { getModelIdLookupCandidates } from '../constants/models';
import {
  DEFAULT_BASE_URL,
  getModelMetadataCacheStorageKey,
  normalizeProviderBaseURL,
  type AiProvider,
  type ProviderKind,
  type ProviderModelMetadata
} from './providerStore';

export const OPENAI_RESPONSES_MIN_OUTPUT_TOKENS = 16;

interface ModelMetadataCache {
  fetchedAt: number;
  models: Record<string, ProviderModelMetadata>;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter(
    (entry): entry is string => isString(entry) && entry.trim().length > 0
  );
  return strings.length > 0 ? strings : undefined;
}

function parseStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => isString(entry[0]) && isString(entry[1])
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parsePositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function parseProviderModelMetadata(value: unknown): ProviderModelMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = isString(record.id) ? record.id.trim() : '';
  if (!id) return null;
  return {
    id,
    canonicalSlug: isString(record.canonicalSlug) ? record.canonicalSlug : undefined,
    name: isString(record.name) ? record.name : undefined,
    contextLength: parsePositiveNumber(record.contextLength),
    maxCompletionTokens: parsePositiveNumber(record.maxCompletionTokens),
    isModerated: typeof record.isModerated === 'boolean' ? record.isModerated : undefined,
    modality: isString(record.modality) ? record.modality : undefined,
    inputModalities: parseStringArray(record.inputModalities),
    outputModalities: parseStringArray(record.outputModalities),
    tokenizer: isString(record.tokenizer) ? record.tokenizer : undefined,
    pricing: parseStringRecord(record.pricing),
    supportedParameters: parseStringArray(record.supportedParameters)
  };
}

function parseModelMetadataMap(value: unknown): Record<string, ProviderModelMetadata> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const parsed: Record<string, ProviderModelMetadata> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const metadata = parseProviderModelMetadata(entry);
    if (metadata && key.trim()) parsed[key] = metadata;
  }
  return parsed;
}

function parseModelMetadataCache(value: unknown): ModelMetadataCache | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const fetchedAt = typeof record.fetchedAt === 'number' ? record.fetchedAt : 0;
  const models = parseModelMetadataMap(record.models);
  if (!fetchedAt || Object.keys(models).length === 0) return null;
  return { fetchedAt, models };
}

function indexProviderModelMetadata(
  models: Record<string, ProviderModelMetadata>,
  metadata: ProviderModelMetadata
): void {
  const candidates = [
    ...getModelIdLookupCandidates(metadata.id),
    ...(metadata.canonicalSlug ? getModelIdLookupCandidates(metadata.canonicalSlug) : [])
  ];
  for (const [index, candidate] of Array.from(new Set(candidates)).entries()) {
    if (index === 0 || !models[candidate]) {
      models[candidate] = metadata;
    }
  }
}

function joinUrl(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function getModelListUrls(kind: ProviderKind, baseURL: string, _apiKey: string): string[] {
  if (kind === 'anthropic') {
    const url = new URL(baseURL);
    const path = url.pathname.replace(/\/+$/, '');
    const urls = [
      path.endsWith('/v1') ? joinUrl(baseURL, '/models') : joinUrl(baseURL, '/v1/models')
    ];
    for (const suffix of ['/anthropic/v1', '/anthropic']) {
      if (path === suffix || path.endsWith(suffix)) {
        const stripped = new URL(baseURL);
        stripped.pathname = path.slice(0, -suffix.length) || '/';
        stripped.search = '';
        stripped.hash = '';
        urls.push(joinUrl(stripped.toString().replace(/\/+$/, ''), '/v1/models'));
        break;
      }
    }
    return uniqueStrings(urls);
  }

  return [joinUrl(baseURL, '/models')];
}

function getModelListHeaders(kind: ProviderKind, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (kind === 'anthropic') {
    headers['anthropic-version'] = '2023-06-01';
    if (apiKey) headers['x-api-key'] = apiKey;
    return headers;
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function extractModelIds(payload: unknown): string[] {
  const source =
    payload && typeof payload === 'object'
      ? ((payload as { data?: unknown; models?: unknown }).data ??
        (payload as { data?: unknown; models?: unknown }).models)
      : payload;
  if (!Array.isArray(source)) return [];

  return Array.from(
    new Set(
      source
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          if (!entry || typeof entry !== 'object') return '';
          const record = entry as { id?: unknown; name?: unknown };
          const id = typeof record.id === 'string' ? record.id : record.name;
          if (typeof id !== 'string') return '';
          return id.startsWith('models/') ? id.slice('models/'.length) : id;
        })
        .filter((id) => id.trim().length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));
}

/**
 * Build a `{ modelId: metadata }` index from a /v1/models payload.
 * Accepts a bare array, `{ data: [...] }`, or `{ models: [...] }`.
 */
export function extractModelMetadata(payload: unknown): Record<string, ProviderModelMetadata> {
  let source: unknown = payload;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const obj = payload as { data?: unknown; models?: unknown };
    source = obj.data ?? obj.models ?? payload;
  }

  const models: Record<string, ProviderModelMetadata> = {};
  if (!Array.isArray(source)) return models;
  for (const entry of source) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const rawModelId =
      typeof record.id === 'string'
        ? record.id
        : typeof record.name === 'string'
          ? record.name
          : '';
    if (!rawModelId) continue;
    const modelId = rawModelId.startsWith('models/')
      ? rawModelId.slice('models/'.length)
      : rawModelId;
    const name = isString(record.name) && record.name !== rawModelId ? record.name : undefined;
    const canonicalSlug =
      typeof record.canonical_slug === 'string'
        ? record.canonical_slug
        : typeof record.canonicalSlug === 'string'
          ? record.canonicalSlug
          : '';
    const topProvider =
      record.top_provider &&
      typeof record.top_provider === 'object' &&
      !Array.isArray(record.top_provider)
        ? (record.top_provider as Record<string, unknown>)
        : {};
    const contextLength = [
      record.context_length,
      record.contextLength,
      record.max_context_length,
      record.maxContextLength,
      record.max_input_tokens,
      record.maxInputTokens,
      record.input_token_limit,
      record.inputTokenLimit,
      topProvider.context_length,
      topProvider.contextLength,
      topProvider.max_context_length,
      topProvider.maxContextLength,
      topProvider.max_input_tokens,
      topProvider.maxInputTokens
    ].find((value): value is number => typeof value === 'number' && value > 0);
    const architecture =
      record.architecture &&
      typeof record.architecture === 'object' &&
      !Array.isArray(record.architecture)
        ? (record.architecture as Record<string, unknown>)
        : {};
    indexProviderModelMetadata(models, {
      id: modelId,
      canonicalSlug: canonicalSlug || undefined,
      name,
      contextLength,
      maxCompletionTokens:
        parsePositiveNumber(topProvider.max_completion_tokens) ??
        parsePositiveNumber(topProvider.maxCompletionTokens) ??
        parsePositiveNumber(record.max_completion_tokens) ??
        parsePositiveNumber(record.maxCompletionTokens),
      isModerated:
        typeof topProvider.is_moderated === 'boolean' ? topProvider.is_moderated : undefined,
      modality: isString(architecture.modality) ? architecture.modality : undefined,
      inputModalities: parseStringArray(architecture.input_modalities),
      outputModalities: parseStringArray(architecture.output_modalities),
      tokenizer: isString(architecture.tokenizer) ? architecture.tokenizer : undefined,
      pricing: parseStringRecord(record.pricing),
      supportedParameters: parseStringArray(record.supported_parameters)
    });
  }
  return models;
}

export function lookupModelMetadata(
  models: Record<string, ProviderModelMetadata>,
  modelId: string
): ProviderModelMetadata | undefined {
  const trimmed = modelId.trim();
  if (!trimmed) return undefined;

  const candidates = getModelIdLookupCandidates(trimmed);
  for (const candidate of candidates) {
    const value = models[candidate];
    if (value) return value;
  }

  const lowerCandidates = new Set(candidates.map((candidate) => candidate.toLowerCase()));
  for (const [id, value] of Object.entries(models)) {
    if (
      getModelIdLookupCandidates(id).some((candidate) =>
        lowerCandidates.has(candidate.toLowerCase())
      )
    ) {
      return value;
    }
  }
  return undefined;
}

async function readModelMetadataCache(
  provider: Pick<AiProvider, 'kind' | 'baseURL'>
): Promise<ModelMetadataCache | null> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
    const storageKey = getModelMetadataCacheStorageKey(provider);
    const raw = await chrome.storage.local.get(storageKey);
    return parseModelMetadataCache(raw[storageKey]);
  } catch {
    return null;
  }
}

async function writeModelMetadataCache(
  provider: Pick<AiProvider, 'kind' | 'baseURL'>,
  models: Record<string, ProviderModelMetadata>
): Promise<void> {
  if (Object.keys(models).length === 0) return;
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    const storageKey = getModelMetadataCacheStorageKey(provider);
    const existing = await readModelMetadataCache(provider);
    await chrome.storage.local.set({
      [storageKey]: {
        fetchedAt: Date.now(),
        models: {
          ...(existing?.models ?? {}),
          ...models
        }
      }
    });
  } catch {
    // Metadata caching is opportunistic; provider model loading must not fail.
  }
}

export async function lookupCachedModelMetadata(
  provider: Pick<AiProvider, 'kind' | 'baseURL'>,
  modelId: string
): Promise<ProviderModelMetadata | undefined> {
  const cache = await readModelMetadataCache(provider);
  return cache ? lookupModelMetadata(cache.models, modelId) : undefined;
}

async function readProviderError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return '';
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed.error === 'string') return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
    if (parsed.message) return parsed.message;
  } catch {
    // Use the raw snippet below.
  }
  return text.slice(0, 160);
}

async function fetchRawModelList(
  provider: Pick<AiProvider, 'kind' | 'baseURL' | 'apiKey'>,
  timeoutMs = 10_000
): Promise<unknown> {
  const baseURL = normalizeProviderBaseURL(
    provider.kind,
    provider.baseURL || DEFAULT_BASE_URL[provider.kind]
  );
  if (!baseURL) {
    throw new Error('baseURL is empty');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let lastError: Error | null = null;
    for (const url of getModelListUrls(provider.kind, baseURL, provider.apiKey)) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: getModelListHeaders(provider.kind, provider.apiKey),
          signal: controller.signal
        });
        if (response.ok) return await response.json();
        const snippet = await readProviderError(response);
        lastError = new Error(`HTTP ${response.status}${snippet ? ` - ${snippet}` : ''}`);
      } catch (error) {
        if (controller.signal.aborted) throw error;
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    throw lastError ?? new Error('models endpoint unavailable');
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`timeout after ${timeoutMs}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchProviderModels(
  provider: Pick<AiProvider, 'kind' | 'baseURL' | 'apiKey'>,
  timeoutMs = 10_000
): Promise<string[]> {
  return extractModelIds(await fetchRawModelList(provider, timeoutMs));
}

export interface ProviderModelCatalog {
  models: string[];
  metadata: Record<string, ProviderModelMetadata>;
}

/**
 * Fetch the gateway's /v1/models once and return both the id list (for the
 * editor dropdown) and the reusable model metadata. The selected model's
 * context window is captured at save time from that metadata.
 */
export async function fetchProviderModelCatalog(
  provider: Pick<AiProvider, 'kind' | 'baseURL' | 'apiKey'>,
  timeoutMs = 10_000
): Promise<ProviderModelCatalog> {
  const payload = await fetchRawModelList(provider, timeoutMs);
  const metadata = extractModelMetadata(payload);
  await writeModelMetadataCache(provider, metadata);
  return {
    models: extractModelIds(payload),
    metadata
  };
}

async function postProviderProbe(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  signal: AbortSignal
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify(body)
  });
  if (response.ok) return { ok: true };

  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: `HTTP ${response.status} — check API key` };
  }
  if (response.status === 404) {
    return { ok: false, error: `HTTP 404 — endpoint ${url} not found` };
  }
  const snippet = await readProviderError(response);
  return { ok: false, error: `HTTP ${response.status}${snippet ? ` — ${snippet}` : ''}` };
}

/**
 * Lightweight connectivity probe for the selected provider protocol.
 */
export async function testProviderConnection(
  provider: AiProvider,
  timeoutMs = 10_000
): Promise<{ ok: true } | { ok: false; error: string }> {
  const baseURL = normalizeProviderBaseURL(
    provider.kind,
    provider.baseURL || DEFAULT_BASE_URL[provider.kind]
  );
  const fallbackModel =
    provider.kind === 'anthropic'
      ? 'claude-3-haiku-20240307'
      : provider.kind === 'gemini'
        ? 'gemini-2.0-flash'
        : 'gpt-4o-mini';
  const modelId = provider.modelId || fallbackModel;
  if (!baseURL) {
    return { ok: false, error: 'baseURL is empty' };
  }
  if (
    (provider.kind === 'openai' ||
      provider.kind === 'openai-compatible' ||
      provider.kind === 'gemini') &&
    !provider.apiKey
  ) {
    return { ok: false, error: 'apiKey is required' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (provider.kind === 'openai' || provider.kind === 'gemini') {
      const client = new OpenAI({
        apiKey: provider.apiKey,
        baseURL,
        dangerouslyAllowBrowser: true
      });
      await client.chat.completions.create(
        {
          model: modelId,
          max_completion_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }]
        },
        { signal: controller.signal }
      );
      return { ok: true };
    }

    if (provider.kind === 'openai-compatible') {
      const client = new OpenAI({
        apiKey: provider.apiKey,
        baseURL,
        dangerouslyAllowBrowser: true
      });
      await client.responses.create(
        {
          model: modelId,
          input: 'ping',
          max_output_tokens: OPENAI_RESPONSES_MIN_OUTPUT_TOKENS
        },
        { signal: controller.signal }
      );
      return { ok: true };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    };
    if (provider.apiKey) headers['x-api-key'] = provider.apiKey;
    return await postProviderProbe(
      joinUrl(baseURL, baseURL.endsWith('/v1') ? '/messages' : '/v1/messages'),
      headers,
      {
        model: modelId,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }]
      },
      controller.signal
    );
  } catch (error) {
    if (controller.signal.aborted) {
      return { ok: false, error: `timeout after ${timeoutMs}ms` };
    }
    if (error instanceof OpenAI.APIError) {
      return { ok: false, error: `HTTP ${error.status ?? 'error'} — ${error.message}` };
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}
