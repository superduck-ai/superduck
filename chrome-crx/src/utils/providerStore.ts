import OpenAI from 'openai';

/**
 * Multi-provider AI configuration store.
 *
 * Stores a flexible mapping of providers (Anthropic / OpenAI / Gemini /
 * OpenAI-Compatible gateways) and binds three usage tiers (deep / smart /
 * flash) to a `{ providerId, modelId }` pair.
 *
 * Runtime callers should use {@link resolveTier} / {@link resolveModelForRequest}
 * to translate a generic Claude-style model id (or an explicit tier) into the
 * concrete provider + model the user picked in Options.
 */

export type ProviderKind = 'anthropic' | 'openai' | 'gemini' | 'openai-compatible';

export type ProviderStatus = 'unknown' | 'active' | 'error' | 'testing';

export type Tier = 'deep' | 'smart' | 'flash';

export interface AiProvider {
  id: string;
  kind: ProviderKind;
  name: string;
  modelId: string;
  apiKey: string;
  baseURL: string;
  status: ProviderStatus;
  lastTestedAt?: number;
  errorMessage?: string;
}

export interface TierBinding {
  providerId: string;
  modelId: string;
}

export type ModelMappingV2 = Record<Tier, TierBinding | null>;

export interface ProviderConfig {
  providers: AiProvider[];
  mapping: ModelMappingV2;
}

export const PROVIDER_STORAGE_KEYS = {
  PROVIDERS: 'aiProviders',
  MAPPING: 'aiModelMapping',
  CONFIG_VERSION: 'aiProviderConfigVersion'
} as const;

export const PROVIDER_CONFIG_VERSION = 1;
export const PROVIDER_CONFIG_BROADCAST = 'superduck.providerConfigUpdated';
export const OPENAI_RESPONSES_MIN_OUTPUT_TOKENS = 16;

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

export const TIER_LABEL: Record<Tier, string> = {
  deep: 'Deep',
  smart: 'Smart',
  flash: 'Flash'
};

export const TIER_DESCRIPTION: Record<Tier, string> = {
  deep: '复杂推理',
  smart: '默认对话',
  flash: '快速任务'
};

const EMPTY_MAPPING: ModelMappingV2 = {
  deep: null,
  smart: null,
  flash: null
};

function emptyConfig(): ProviderConfig {
  return {
    providers: [],
    mapping: { ...EMPTY_MAPPING }
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
    lastTestedAt: typeof v.lastTestedAt === 'number' ? v.lastTestedAt : undefined,
    errorMessage: isString(v.errorMessage) ? v.errorMessage : undefined
  };
}

function parseBinding(value: unknown): TierBinding | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!isString(v.providerId) || !isString(v.modelId)) return null;
  if (!v.providerId || !v.modelId) return null;
  return { providerId: v.providerId, modelId: v.modelId };
}

function parseMapping(value: unknown): ModelMappingV2 {
  if (!value || typeof value !== 'object') return { ...EMPTY_MAPPING };
  const v = value as Record<string, unknown>;
  return {
    deep: parseBinding(v.deep),
    smart: parseBinding(v.smart),
    flash: parseBinding(v.flash)
  };
}

let cachedConfig: ProviderConfig | null = null;
let migrated = false;

/**
 * Legacy migration: lift the old {customApiUrl, customApiKey, defaultOpus/Sonnet/HaikuModel}
 * fields into the new provider model on first read.
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
    'defaultHaikuModel'
  ]);

  if (legacy[PROVIDER_STORAGE_KEYS.CONFIG_VERSION] === PROVIDER_CONFIG_VERSION) return null;

  const hasNewProviders = Array.isArray(legacy[PROVIDER_STORAGE_KEYS.PROVIDERS])
    ? (legacy[PROVIDER_STORAGE_KEYS.PROVIDERS] as unknown[]).length > 0
    : false;

  const customApiUrl = isString(legacy.customApiUrl) ? legacy.customApiUrl.trim() : '';
  const customApiKey = isString(legacy.customApiKey) ? legacy.customApiKey.trim() : '';
  const opusModel = isString(legacy.defaultOpusModel) ? legacy.defaultOpusModel.trim() : '';
  const sonnetModel = isString(legacy.defaultSonnetModel) ? legacy.defaultSonnetModel.trim() : '';
  const haikuModel = isString(legacy.defaultHaikuModel) ? legacy.defaultHaikuModel.trim() : '';

  if (
    hasNewProviders ||
    (!customApiUrl && !customApiKey && !opusModel && !sonnetModel && !haikuModel)
  ) {
    await chrome.storage.local.set({
      [PROVIDER_STORAGE_KEYS.CONFIG_VERSION]: PROVIDER_CONFIG_VERSION
    });
    return null;
  }

  const provider: AiProvider = {
    id: newProviderId(),
    kind: 'openai-compatible',
    name: 'Imported Gateway',
    modelId: opusModel || sonnetModel || haikuModel || '',
    apiKey: customApiKey,
    baseURL: normalizeProviderBaseURL('openai-compatible', customApiUrl),
    status: 'unknown'
  };

  const mapping: ModelMappingV2 = {
    deep: opusModel ? { providerId: provider.id, modelId: opusModel } : null,
    smart: sonnetModel ? { providerId: provider.id, modelId: sonnetModel } : null,
    flash: haikuModel ? { providerId: provider.id, modelId: haikuModel } : null
  };

  await chrome.storage.local.set({
    [PROVIDER_STORAGE_KEYS.PROVIDERS]: [provider],
    [PROVIDER_STORAGE_KEYS.MAPPING]: mapping,
    [PROVIDER_STORAGE_KEYS.CONFIG_VERSION]: PROVIDER_CONFIG_VERSION
  });

  return {
    providers: [provider],
    mapping
  };
}

export async function loadProviderConfig(force = false): Promise<ProviderConfig> {
  if (!force && cachedConfig) return cachedConfig;

  const migratedConfig = await migrateLegacyIfNeeded();
  if (migratedConfig) {
    cachedConfig = migratedConfig;
    return migratedConfig;
  }

  const raw = await chrome.storage.local.get([
    PROVIDER_STORAGE_KEYS.PROVIDERS,
    PROVIDER_STORAGE_KEYS.MAPPING
  ]);

  const providersRaw = raw[PROVIDER_STORAGE_KEYS.PROVIDERS];
  const providers = Array.isArray(providersRaw)
    ? (providersRaw.map(parseProvider).filter(Boolean) as AiProvider[])
    : [];

  const config: ProviderConfig = {
    providers,
    mapping: parseMapping(raw[PROVIDER_STORAGE_KEYS.MAPPING])
  };

  cachedConfig = config;
  return config;
}

export async function saveProviderConfig(config: ProviderConfig): Promise<void> {
  const normalizedConfig: ProviderConfig = {
    ...config,
    providers: config.providers.map((provider) => ({
      ...provider,
      baseURL: normalizeProviderBaseURL(provider.kind, provider.baseURL)
    }))
  };
  cachedConfig = normalizedConfig;
  await chrome.storage.local.set({
    [PROVIDER_STORAGE_KEYS.PROVIDERS]: normalizedConfig.providers,
    [PROVIDER_STORAGE_KEYS.MAPPING]: normalizedConfig.mapping,
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

export function classifyTier(modelId: string): Tier {
  const lower = modelId.toLowerCase();
  if (lower.includes('opus')) return 'deep';
  if (lower.includes('haiku')) return 'flash';
  return 'smart';
}

export function findProvider(
  config: ProviderConfig,
  providerId: string | undefined
): AiProvider | undefined {
  if (!providerId) return undefined;
  return config.providers.find((p) => p.id === providerId);
}

/**
 * Resolve a tier into the concrete provider + model id the user has bound.
 */
export function resolveTier(
  config: ProviderConfig,
  tier: Tier
): { tier: Tier; provider: AiProvider; modelId: string } | null {
  const binding = config.mapping[tier];
  if (binding) {
    const provider = findProvider(config, binding.providerId);
    if (provider) {
      return { tier, provider, modelId: binding.modelId || provider.modelId };
    }
  }
  return null;
}

/**
 * Resolve a generic upstream model id (e.g. `claude-opus-4-6`) using the
 * tier-based mapping. Returns null if the user has not configured any
 * matching tier and no fallback exists.
 */
export function resolveModelForRequest(
  config: ProviderConfig,
  originalModelId: string
): { tier: Tier; provider: AiProvider; modelId: string } | null {
  return resolveTier(config, classifyTier(originalModelId));
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

function getModelListUrl(kind: ProviderKind, baseURL: string, _apiKey: string): string {
  if (kind === 'anthropic') {
    const url = new URL(baseURL);
    const path = url.pathname.replace(/\/+$/, '');
    return path.endsWith('/v1') ? joinUrl(baseURL, '/models') : joinUrl(baseURL, '/v1/models');
  }

  return joinUrl(baseURL, '/models');
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

export async function fetchProviderModels(
  provider: Pick<AiProvider, 'kind' | 'baseURL' | 'apiKey'>,
  timeoutMs = 10_000
): Promise<string[]> {
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
    const response = await fetch(getModelListUrl(provider.kind, baseURL, provider.apiKey), {
      method: 'GET',
      headers: getModelListHeaders(provider.kind, provider.apiKey),
      signal: controller.signal
    });
    if (!response.ok) {
      const snippet = await readProviderError(response);
      throw new Error(`HTTP ${response.status}${snippet ? ` - ${snippet}` : ''}`);
    }
    return extractModelIds(await response.json());
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`timeout after ${timeoutMs}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
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
