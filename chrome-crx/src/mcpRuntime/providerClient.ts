import { StorageKeys, getStorageValue } from '../extensionServices';
import { isRecord } from '../messageTypes';
import { MessagesClient } from '../mcpServersStore';
import { clearDispatchClientCache, resolveClientForProvider } from '../utils/providerClient';
import {
  PROVIDER_CONFIG_BROADCAST,
  PROVIDER_STORAGE_KEYS,
  loadProviderConfig
} from '../utils/providerStore';
import { getFirstUsableProvider } from '../utils/providerConfigStatus';

let cachedMessagesClient: MessagesClient | undefined;
let lastApiKey: string | undefined;
let lastApiBaseUrl: string | undefined;

export async function getSelectedModel(): Promise<string> {
  const storedModel = await getStorageValue<string>(StorageKeys.SELECTED_MODEL);
  return typeof storedModel === 'string' ? storedModel : '';
}

export async function refreshMessagesClient(): Promise<MessagesClient | undefined> {
  const storedValues = await chrome.storage.local.get([
    StorageKeys.API_KEY,
    'customApiUrl',
    'customApiKey'
  ]);
  const storedApiKey = storedValues[StorageKeys.API_KEY] as string | undefined;
  const customApiUrl = storedValues.customApiUrl as string | undefined;
  const customApiKey = storedValues.customApiKey as string | undefined;
  const normalizedCustomApiUrl =
    typeof customApiUrl === 'string' ? customApiUrl.trim().replace(/\/+$/, '') : '';
  const apiBaseUrl = normalizedCustomApiUrl;
  const apiKey =
    (typeof customApiKey === 'string' && customApiKey.trim()) ||
    (typeof storedApiKey === 'string' && storedApiKey.trim()) ||
    undefined;
  if (lastApiKey !== apiKey || lastApiBaseUrl !== apiBaseUrl) {
    cachedMessagesClient = undefined;
    lastApiKey = apiKey;
    lastApiBaseUrl = apiBaseUrl;
  }
  if (cachedMessagesClient) return cachedMessagesClient;
  if (apiKey && apiBaseUrl) {
    cachedMessagesClient = new MessagesClient({
      baseURL: apiBaseUrl,
      dangerouslyAllowBrowser: true,
      apiKey
    });
    return cachedMessagesClient;
  }
  // Fall back to the provider the user selected; if the stored selection is
  // empty / stale (e.g. a legacy canonical model id, or the provider was
  // deleted), try any ready provider so background tool calls still reach a
  // model instead of silently getting no client.
  const selectedModel = await getSelectedModel();
  let resolved = await resolveClientForProvider(selectedModel || undefined);
  if (!resolved) {
    const config = await loadProviderConfig();
    const fallbackProvider = getFirstUsableProvider(config);
    if (fallbackProvider) {
      resolved = await resolveClientForProvider(fallbackProvider.id);
    }
  }
  if (resolved) {
    cachedMessagesClient = new MessagesClient({
      baseURL: resolved.baseURL,
      dangerouslyAllowBrowser: true,
      apiKey: resolved.apiKey
    });
    return cachedMessagesClient;
  }
  return undefined;
}

/**
 * Invalidate the cached messages client + api key so the next
 * `refreshMessagesClient` call rebuilds it. Called by toolExecution when an
 * authentication error (401 / invalid x-api-key) is detected, so a
 * re-authenticated client is picked up on the next tool call.
 */
export function invalidateCachedClient(): void {
  cachedMessagesClient = undefined;
  lastApiKey = undefined;
}

/**
 * Handle provider-config-broadcast runtime messages. Returns true if the
 * message was handled (so the caller can short-circuit). Registered alongside
 * other runtime message handlers in core.ts to preserve the single-listener
 * registration timing.
 */
export function handleProviderRuntimeMessage(
  message: unknown,
  sendResponse: (response: unknown) => void
): boolean {
  if (isRecord(message) && message.type === PROVIDER_CONFIG_BROADCAST) {
    clearDispatchClientCache();
    void loadProviderConfig(true);
    sendResponse({ ok: true });
    return true;
  }
  return false;
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (PROVIDER_STORAGE_KEYS.PROVIDERS in changes || PROVIDER_STORAGE_KEYS.MAPPING in changes) {
    clearDispatchClientCache();
    void loadProviderConfig(true);
  }
});
