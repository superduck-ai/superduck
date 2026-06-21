import OpenAI from 'openai';
import { getModelIdLookupCandidates, normalizeModelId } from '../constants/models';

/**
 * Multi-provider AI configuration store.
 *
 * Stores a flat list of providers (Anthropic / OpenAI / Gemini /
 * OpenAI-Compatible gateways), each carrying its own model id. The sidebar
 * model picker enumerates these providers directly — selecting one dispatches
 * to that provider + model. There is no tier/mapping layer.
 */

export type ProviderKind = 'anthropic' | 'openai' | 'gemini' | 'openai-compatible';

export type ProviderStatus = 'unknown' | 'active' | 'error' | 'testing';

export interface AiProvider {
  id: string;
  kind: ProviderKind;
  name: string;
  modelId: string;
  apiKey: string;
  baseURL: string;
  status: ProviderStatus;
  // Max context window (tokens) captured from the gateway's /v1/models at
  // save time. Runtime context-window resolution treats this as authoritative.
  contextLength?: number;
  lastTestedAt?: number;
  errorMessage?: string;
}

export interface ProviderConfig {
  providers: AiProvider[];
}

export const PROVIDER_STORAGE_KEYS = {
  PROVIDERS: 'aiProviders',
  // Kept only so legacy storage listeners and the v1→v2 migration can read
  // the old tier mapping; runtime code never writes it.
  MAPPING: 'aiModelMapping',
  CONFIG_VERSION: 'aiProviderConfigVersion'
} as const;

export const PROVIDER_CONFIG_VERSION = 2;
export const PROVIDER_CONFIG_BROADCAST = 'superduck.providerConfigUpdated';
export const OPENAI_RESPONSES_MIN_OUTPUT_TOKENS = 16;
const MODEL_METADATA_CACHE_STORAGE_KEY_PREFIX = 'modelMetadata';
const LEGACY_SELECTED_MODEL_KEY = 'selectedModel';
const LEGACY_DEFAULT_MODEL = 'claude-opus-4-6';
const LEGACY_TIER_ORDER = ['deep', 'smart', 'flash'] as const;

type LegacyTier = (typeof LEGACY_TIER_ORDER)[number];

interface LegacyTierBinding {
  providerId: string;
  modelId: string;
}

type LegacyModelMapping = Record<LegacyTier, LegacyTierBinding | null>;

export interface ProviderModelMetadata {
  id: string;
  canonicalSlug?: string;
  name?: string;
  contextLength?: number;
  maxCompletionTokens?: number;
  isModerated?: boolean;
  modality?: string;
  inputModalities?: string[];
  outputModalities?: string[];
  tokenizer?: string;
  pricing?: Record<string, string>;
  supportedParameters?: string[];
}

interface ModelMetadataCache {
  fetchedAt: number;
  models: Record<string, ProviderModelMetadata>;
}

/**
 * Default base URL hints rendered as placeholders / first-time defaults.
 */
export const DEFAULT_BASE_URL: Record<ProviderKind, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  // Google exposes an OpenAI-compatible endpoint at /v1beta/openai which the
  // runtime drives via the OpenAI chat protocol with Bearer auth.
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  'openai-compatible': 'https://api.openai.com/v1'
};

export const PROVIDER_KIND_LABEL: Record<ProviderKind, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI Chat',
  gemini: 'Gemini',
  'openai-compatible': 'OpenAI Responses'
};

export function getModelMetadataCacheStorageKey(
  provider: Pick<AiProvider, 'kind' | 'baseURL'>
): string {
  const baseURL = normalizeProviderBaseURL(
    provider.kind,
    provider.baseURL || DEFAULT_BASE_URL[provider.kind]
  );
  return `${MODEL_METADATA_CACHE_STORAGE_KEY_PREFIX}:${provider.kind}:${encodeURIComponent(
    baseURL
  )}`;
}

function emptyConfig(): ProviderConfig {
  return {
    providers: []
  };
}

export function newProviderId(): string {
  return `prov_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isProviderKind(value: unknown): value is ProviderKind {
  return (
    value === 'anthropic' ||
    value === 'openai' ||
    value === 'gemini' ||
    value === 'openai-compatible'
  );
}

function parseProvider(value: unknown): AiProvider | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!isString(v.id) || !isProviderKind(v.kind) || !isString(v.name)) return null;
  return {
    id: v.id,
    kind: v.kind,
    name: v.name,
    modelId: isString(v.modelId) ? v.modelId : '',
    apiKey: isString(v.apiKey) ? v.apiKey : '',
    baseURL: isString(v.baseURL) ? normalizeProviderBaseURL(v.kind, v.baseURL) : '',
    status: ((): ProviderStatus => {
      const s = v.status;
      return s === 'active' || s === 'error' || s === 'testing' ? s : 'unknown';
    })(),
    contextLength:
      typeof v.contextLength === 'number' && v.contextLength > 0 ? v.contextLength : undefined,
    lastTestedAt: typeof v.lastTestedAt === 'number' ? v.lastTestedAt : undefined,
    errorMessage: isString(v.errorMessage) ? v.errorMessage : undefined
  };
}

function parseLegacyBinding(value: unknown): LegacyTierBinding | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!isString(v.providerId) || !isString(v.modelId)) return null;
  if (!v.providerId || !v.modelId) return null;
  return { providerId: v.providerId, modelId: v.modelId };
}

function parseLegacyMapping(value: unknown): LegacyModelMapping {
  const empty = {
    deep: null,
    smart: null,
    flash: null
  };
  if (!value || typeof value !== 'object') return empty;
  const v = value as Record<string, unknown>;
  return {
    deep: parseLegacyBinding(v.deep),
    smart: parseLegacyBinding(v.smart),
    flash: parseLegacyBinding(v.flash)
  };
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

function classifyLegacyTier(modelId: string): LegacyTier {
  const normalized = normalizeModelId(modelId).toLowerCase();
  if (normalized.includes('opus')) return 'deep';
  if (normalized.includes('haiku')) return 'flash';
  return 'smart';
}

function resolveLegacySelectedProviderId(
  providers: AiProvider[],
  mapping: LegacyModelMapping,
  storedSelectedModel: string
): string | undefined {
  const providerIds = new Set(providers.map((provider) => provider.id));
  const providerExists = (providerId: string | undefined) =>
    Boolean(providerId && providerIds.has(providerId));
  const selectedModel = storedSelectedModel.trim();

  if (providerExists(selectedModel)) return selectedModel;

  if (selectedModel) {
    const normalizedSelectedModel = normalizeModelId(selectedModel);
    for (const tier of LEGACY_TIER_ORDER) {
      const binding = mapping[tier];
      if (
        providerExists(binding?.providerId) &&
        normalizeModelId(binding?.modelId ?? '') === normalizedSelectedModel
      ) {
        return binding?.providerId;
      }
    }

    const mappedTierProvider = mapping[classifyLegacyTier(selectedModel)]?.providerId;
    if (providerExists(mappedTierProvider)) return mappedTierProvider;

    return providers.find(
      (provider) => normalizeModelId(provider.modelId) === normalizedSelectedModel
    )?.id;
  }

  const defaultProviderId = mapping[classifyLegacyTier(LEGACY_DEFAULT_MODEL)]?.providerId;
  if (providerExists(defaultProviderId)) return defaultProviderId;

  return providers.length === 1 ? providers[0].id : undefined;
}

let cachedConfig: ProviderConfig | null = null;
let migrated = false;

/**
 * Migration:
 *  - v1 stored a `{ deep, smart, flash }` tier→provider mapping alongside the
 *    providers list. v2 drops the mapping entirely, but first translates the
 *    stored selected model into the mapped provider id so existing users keep
 *    the provider/model they had selected.
 *  - Legacy single-gateway fields (`customApiUrl`/`customApiKey`/
 *    `defaultOpus|Sonnet|HaikuModel`) are lifted into one provider, same as v1.
 */
async function migrateLegacyIfNeeded(): Promise<ProviderConfig | null> {
  if (migrated) return null;
  migrated = true;

  const legacy = await chrome.storage.local.get([
    PROVIDER_STORAGE_KEYS.CONFIG_VERSION,
    PROVIDER_STORAGE_KEYS.PROVIDERS,
    PROVIDER_STORAGE_KEYS.MAPPING,
    'customApiUrl',
    'customApiKey',
    'defaultOpusModel',
    'defaultSonnetModel',
    'defaultHaikuModel',
    LEGACY_SELECTED_MODEL_KEY
  ]);

  if (legacy[PROVIDER_STORAGE_KEYS.CONFIG_VERSION] === PROVIDER_CONFIG_VERSION) return null;

  const existingProviders = Array.isArray(legacy[PROVIDER_STORAGE_KEYS.PROVIDERS])
    ? ((legacy[PROVIDER_STORAGE_KEYS.PROVIDERS] as unknown[])
        .map(parseProvider)
        .filter(Boolean) as AiProvider[])
    : [];

  const customApiUrl = isString(legacy.customApiUrl) ? legacy.customApiUrl.trim() : '';
  const customApiKey = isString(legacy.customApiKey) ? legacy.customApiKey.trim() : '';
  const opusModel = isString(legacy.defaultOpusModel) ? legacy.defaultOpusModel.trim() : '';
  const sonnetModel = isString(legacy.defaultSonnetModel) ? legacy.defaultSonnetModel.trim() : '';
  const haikuModel = isString(legacy.defaultHaikuModel) ? legacy.defaultHaikuModel.trim() : '';
  const legacyMapping = parseLegacyMapping(legacy[PROVIDER_STORAGE_KEYS.MAPPING]);
  const legacySelectedModel = isString(legacy[LEGACY_SELECTED_MODEL_KEY])
    ? legacy[LEGACY_SELECTED_MODEL_KEY].trim()
    : '';

  // No providers and no legacy gateway fields: just stamp the version.
  if (
    existingProviders.length === 0 &&
    !customApiUrl &&
    !customApiKey &&
    !opusModel &&
    !sonnetModel &&
    !haikuModel
  ) {
    await chrome.storage.local.set({
      [PROVIDER_STORAGE_KEYS.CONFIG_VERSION]: PROVIDER_CONFIG_VERSION,
      [PROVIDER_STORAGE_KEYS.MAPPING]: null
    });
    return null;
  }

  let providers = existingProviders;
  if (
    existingProviders.length === 0 &&
    (customApiUrl || customApiKey || opusModel || sonnetModel || haikuModel)
  ) {
    const provider: AiProvider = {
      id: newProviderId(),
      kind: 'openai-compatible',
      name: 'Imported Gateway',
      modelId: opusModel || sonnetModel || haikuModel || '',
      apiKey: customApiKey,
      baseURL: normalizeProviderBaseURL('openai-compatible', customApiUrl),
      status: 'unknown'
    };
    providers = [provider];
  }

  const selectedProviderId = resolveLegacySelectedProviderId(
    providers,
    legacyMapping,
    legacySelectedModel
  );
  const nextStorage: Record<string, unknown> = {
    [PROVIDER_STORAGE_KEYS.PROVIDERS]: providers,
    [PROVIDER_STORAGE_KEYS.CONFIG_VERSION]: PROVIDER_CONFIG_VERSION,
    [PROVIDER_STORAGE_KEYS.MAPPING]: null
  };
  if (selectedProviderId) nextStorage[LEGACY_SELECTED_MODEL_KEY] = selectedProviderId;

  await chrome.storage.local.set(nextStorage);

  return { providers };
}

export async function loadProviderConfig(force = false): Promise<ProviderConfig> {
  if (!force && cachedConfig) return cachedConfig;

  const migratedConfig = await migrateLegacyIfNeeded();
  if (migratedConfig) {
    cachedConfig = migratedConfig;
    return migratedConfig;
  }

  const raw = await chrome.storage.local.get([PROVIDER_STORAGE_KEYS.PROVIDERS]);

  const providersRaw = raw[PROVIDER_STORAGE_KEYS.PROVIDERS];
  const providers = Array.isArray(providersRaw)
    ? (providersRaw.map(parseProvider).filter(Boolean) as AiProvider[])
    : [];

  const config: ProviderConfig = { providers };

  cachedConfig = config;
  return config;
}

export async function saveProviderConfig(config: ProviderConfig): Promise<void> {
  const normalizedConfig: ProviderConfig = {
    providers: config.providers.map((provider) => ({
      ...provider,
      baseURL: normalizeProviderBaseURL(provider.kind, provider.baseURL)
    }))
  };
  cachedConfig = normalizedConfig;
  await chrome.storage.local.set({
    [PROVIDER_STORAGE_KEYS.PROVIDERS]: normalizedConfig.providers,
    [PROVIDER_STORAGE_KEYS.CONFIG_VERSION]: PROVIDER_CONFIG_VERSION
  });
  try {
    await chrome.runtime.sendMessage({ type: PROVIDER_CONFIG_BROADCAST });
  } catch {
    // Tolerate the broadcast failing (e.g. service worker idle); listeners
    // also watch chrome.storage.onChanged directly as a safety net.
  }
}

export function emptyConfigSnapshot(): ProviderConfig {
  return emptyConfig();
}

export function findProvider(
  config: ProviderConfig,
  providerId: string | undefined
): AiProvider | undefined {
  if (!providerId) return undefined;
  return config.providers.find((p) => p.id === providerId);
}

/**
 * Resolve a configured provider by id into the concrete provider + model id
 * the user picked in Options. Returns null when the provider is unknown.
 */
export function resolveProviderById(
  config: ProviderConfig,
  providerId: string | undefined
): { provider: AiProvider; modelId: string } | null {
  const provider = findProvider(config, providerId);
  if (!provider) return null;
  return { provider, modelId: provider.modelId };
}

export function isProviderComplete(provider: AiProvider): boolean {
  if (!provider.name.trim()) return false;
  if (!provider.modelId.trim()) return false;
  // All supported providers (Anthropic / OpenAI / Gemini /
  // OpenAI-compatible gateways) require an API key — the runtime dispatch
  // and the connectivity probe both refuse to send a request without one,
  // so treat missing key as incomplete to keep UI selectability in sync
  // with what will actually succeed at runtime.
  return Boolean(provider.apiKey.trim());
}

export function clearProviderCache(): void {
  cachedConfig = null;
  migrated = false;
}

const HAS_URL_SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;

function withDefaultProviderScheme(trimmed: string): string {
  return HAS_URL_SCHEME_RE.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isAllowedProviderHostname(hostname: string, hadExplicitScheme: boolean): boolean {
  if (!hostname) return false;
  if (hostname === 'localhost') return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  if (hostname.includes('.')) return true;
  return hadExplicitScheme;
}

function parseProviderBaseURLInput(trimmed: string): URL | null {
  if (!trimmed) return null;
  const hadExplicitScheme = HAS_URL_SCHEME_RE.test(trimmed);
  try {
    const parsed = new URL(withDefaultProviderScheme(trimmed));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    if (!isAllowedProviderHostname(parsed.hostname, hadExplicitScheme)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isValidProviderBaseURL(rawBaseURL: string): boolean {
  const trimmed = rawBaseURL.trim();
  if (!trimmed) return true;
  return parseProviderBaseURLInput(trimmed) !== null;
}

export function normalizeProviderBaseURL(kind: ProviderKind, rawBaseURL: string): string {
  const trimmed = rawBaseURL.trim();
  if (!trimmed) return '';

  const endpointSuffixes: Record<ProviderKind, string[]> = {
    anthropic: ['/v1/messages'],
    openai: ['/chat/completions', '/responses'],
    gemini: ['/chat/completions'],
    'openai-compatible': ['/chat/completions', '/responses']
  };

  const parsed = parseProviderBaseURLInput(trimmed);
  if (!parsed) return '';

  let pathname = parsed.pathname.replace(/\/+$/, '');
  for (const suffix of endpointSuffixes[kind]) {
    if (pathname === suffix || pathname.endsWith(suffix)) {
      pathname = pathname.slice(0, -suffix.length) || '/';
      break;
    }
  }
  parsed.pathname = pathname;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/+$/, '');
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
