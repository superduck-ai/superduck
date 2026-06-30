import { normalizeModelId } from '../constants/models';

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
