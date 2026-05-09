import React from "react";

// =============================================================================
// Vite Preload Helper
// =============================================================================

// Module preload helper — in production Vite injects its own __vitePreload.
// This thin wrapper simply calls the factory (dynamic import) and ignores deps
// since Vite handles preloading automatically during build.
export function modulePreload<T>(
  factory: () => Promise<T>,
  _deps?: string[],
): Promise<T> {
  return factory();
}

// =============================================================================
// Utility: dset (set nested object property by path)
// =============================================================================

function dset(obj: any, path: string | string[], value: any): void {
  const keys = typeof path === "string" ? path.split(".") : path;
  let current = obj;
  for (let i = 0, len = keys.length; i < len; i++) {
    const key = "" + keys[i];
    if (key === "__proto__" || key === "constructor" || key === "prototype")
      break;
    if (i === len - 1) {
      current[key] = value;
    } else {
      const next = current[key];
      current[key] =
        typeof next === typeof keys
          ? next
          : 0 * (keys[i + 1] as any) !== 0 ||
              ~("" + keys[i + 1]).indexOf(".")
            ? {}
            : [];
      current = current[key];
    }
  }
}

// =============================================================================
// Utility: UUID v4 generator
// =============================================================================

let uuidBuf: number[] | undefined;
let uuidIdx = 256;
const uuidHex: string[] = [];
for (let i = 256; i--; ) uuidHex[i] = (i + 256).toString(16).substring(1);

function generateUUID(): string {
  let i = 0,
    out = "";
  if (!uuidBuf || uuidIdx + 16 > 256) {
    uuidBuf = Array(256);
    for (let j = 256; j--; ) uuidBuf[j] = (256 * Math.random()) | 0;
    uuidIdx = 0;
  }
  for (; i < 16; i++) {
    const b = uuidBuf[uuidIdx + i];
    out +=
      i === 6
        ? uuidHex[(15 & b) | 64]
        : i === 8
          ? uuidHex[(63 & b) | 128]
          : uuidHex[b];
    if (i & 1 && i > 1 && i < 11) out += "-";
  }
  uuidIdx++;
  return out;
}

// =============================================================================
// Configuration
// =============================================================================

const SEGMENT_KEYS = {
  production: { SEGMENT_WRITE_KEY: "H7hVDRIBUrlBySLqJ15oAivgqhomdAKT" },
  development: { SEGMENT_WRITE_KEY: "hNex10EGp3coubOXQI1BIElYaZcA1o0u" },
};

const PRODUCTION_EXTENSION_ID = "komnjkkihimgafgblijcchlgeiogpjgi";

const BASE_OAUTH_CONFIG = {
  AUTHORIZE_URL: "https://claude.ai/oauth/authorize",
  TOKEN_URL: "https://platform.claude.com/v1/oauth/token",
  SCOPES_STR: "user:profile user:inference user:chat",
  CLIENT_ID: "54511e87-7abf-4923-9d84-d6f24532e871",
  REDIRECT_URI: `chrome-extension://dihbgbndebgnbjfmelmegjepbnkhlgni/oauth_callback.html`,
};

const OAUTH_CONFIGS = {
  development: BASE_OAUTH_CONFIG,
  production: {
    ...BASE_OAUTH_CONFIG,
    CLIENT_ID: "dae2cad8-15c5-43d2-9046-fcaecc135fa4",
    REDIRECT_URI: `chrome-extension://${PRODUCTION_EXTENSION_ID}/oauth_callback.html`,
  },
};

export function getConfig() {
  const env = "production" as const;
  const oauth = OAUTH_CONFIGS[env];
  return {
    environment: env,
    apiBaseUrl: "https://api.anthropic.com",
    wsApiBaseUrl: "wss://api.anthropic.com",
    segmentWriteKey: SEGMENT_KEYS[env].SEGMENT_WRITE_KEY,
    oauth,
    localBridge: false,
  };
}

// =============================================================================
// StorageKeys Enum
// =============================================================================

export enum StorageKeys {
  ACCESS_TOKEN = "accessToken",
  REFRESH_TOKEN = "refreshToken",
  TOKEN_EXPIRY = "tokenExpiry",
  OAUTH_STATE = "oauthState",
  CODE_VERIFIER = "codeVerifier",
  API_KEY = "anthropicApiKey",
  SELECTED_MODEL = "selectedModel",
  SELECTED_MODEL_QUICK_MODE = "selectedModelQuickMode",
  SYSTEM_PROMPT = "systemPrompt",
  PURL_CONFIG = "purlConfig",
  DEBUG_MODE = "debugMode",
  MODEL_SELECTOR_DEBUG = "modelSelectorDebug",
  SHOW_TRACE_IDS = "showTraceIds",
  SHOW_SYSTEM_REMINDERS = "showSystemReminders",
  USE_SESSIONS_API = "useSessionsAPI",
  SESSIONS_API_HOSTNAME = "sessionsApiHostname",
  BROWSER_CONTROL_PERMISSION_ACCEPTED = "browserControlPermissionAccepted",
  PERMISSION_STORAGE = "permissionStorage",
  LAST_PERMISSION_MODE_PREFERENCE = "lastPermissionModePreference",
  ANONYMOUS_ID = "anonymousId",
  TEST_DATA_MESSAGES = "test_data_messages",
  SCHEDULED_TASK_LOGS = "scheduledTaskLogs",
  SCHEDULED_TASK_STATS = "scheduledTaskStats",
  PENDING_SCHEDULED_TASK = "pendingScheduledTask",
  TARGET_TAB_ID = "targetTabId",
  UPDATE_AVAILABLE = "updateAvailable",
  TIP_DISPLAY_COUNTS = "tipDisplayCounts",
  NEW_TAB_NOTE = "newTabNote",
  CUSTOM_APP_LINKS = "customAppLinks",
  NOTIFICATIONS_ENABLED = "notificationsEnabled",
  ANNOUNCEMENT_DISMISSED = "announcementDismissed",
  MODEL_OVERRIDE_SEEN = "modelOverrideSeen",
  SAVED_PROMPTS = "savedPrompts",
  SAVED_PROMPT_CATEGORIES = "savedPromptCategories",
  TAB_GROUPS = "tabGroups",
  DISMISSED_TAB_GROUPS = "dismissedTabGroups",
  MCP_TAB_GROUP_ID = "mcpTabGroupId",
  MCP_CONNECTED = "mcpConnected",
  QUICK_MODE_TIP_DISMISSED = "quickModeTipDismissed",
  WIDGET_ORDER = "widgetOrder",
}

// =============================================================================
// Storage Functions
// =============================================================================

export async function getStorageValue(
  key: string,
  defaultValue?: any,
): Promise<any> {
  const result = await chrome.storage.local.get(key);
  return result[key] !== undefined ? result[key] : defaultValue;
}

export async function setStorageValue(
  key: string,
  value: unknown,
): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function removeStorageValues(
  keys: string | string[],
): Promise<void> {
  const arr = Array.isArray(keys) ? keys : [keys];
  await chrome.storage.local.remove(arr);
}

async function setMultipleStorageValues(
  values: Record<string, unknown>,
): Promise<void> {
  await chrome.storage.local.set(values);
}

const PRESERVED_KEYS = new Set(["anonymousId", "updateAvailable"]);

async function clearAllStorage(): Promise<void> {
  const keysToRemove = Object.values(StorageKeys).filter(
    (k) => !PRESERVED_KEYS.has(k),
  );
  await removeStorageValues(keysToRemove);
}

// =============================================================================
// OAuth Helpers
// =============================================================================

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function saveTokens(
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt?: number;
  },
  state?: string,
): Promise<void> {
  await setMultipleStorageValues({
    [StorageKeys.ACCESS_TOKEN]: tokens.accessToken,
    [StorageKeys.REFRESH_TOKEN]: tokens.refreshToken,
    [StorageKeys.TOKEN_EXPIRY]: tokens.expiresAt,
    [StorageKeys.OAUTH_STATE]: state,
  });
}

async function refreshToken(
  token: string,
  oauthConfig: typeof BASE_OAUTH_CONFIG,
): Promise<any> {
  try {
    const response = await fetch(oauthConfig.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: oauthConfig.CLIENT_ID,
        refresh_token: token,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `Token refresh failed: ${response.status} ${text}`,
      };
    }
    const data = await response.json();
    if (data.error) {
      return {
        success: false,
        error: data.error_description || data.error,
      };
    }
    return {
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || token,
      expiresAt: data.expires_in
        ? Date.now() + 1000 * data.expires_in
        : undefined,
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Network error during token refresh",
    };
  }
}

export async function validateAndRefreshToken(): Promise<{
  isValid: boolean;
  isRefreshed: boolean;
}> {
  try {
    const stored = await chrome.storage.local.get([
      StorageKeys.ACCESS_TOKEN,
      StorageKeys.REFRESH_TOKEN,
      StorageKeys.TOKEN_EXPIRY,
    ]);
    if (!stored[StorageKeys.ACCESS_TOKEN])
      return { isValid: false, isRefreshed: false };
    const now = Date.now();
    const expiry = stored[StorageKeys.TOKEN_EXPIRY] as number | undefined;
    const isCurrentlyValid = !!expiry && now < expiry;
    const needsRefresh = !!expiry && now >= expiry - 3600000;
    if (!needsRefresh) return { isValid: isCurrentlyValid, isRefreshed: false };
    if (!stored[StorageKeys.REFRESH_TOKEN])
      return { isValid: isCurrentlyValid, isRefreshed: false };
    const config = getConfig();
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await refreshToken(
        stored[StorageKeys.REFRESH_TOKEN] as string,
        config.oauth,
      );
      if (result.success) {
        await saveTokens(result);
        return { isValid: true, isRefreshed: true };
      }
      if (attempt === 2) {
        if (!isCurrentlyValid) {
          await removeStorageValues([
            StorageKeys.ACCESS_TOKEN,
            StorageKeys.REFRESH_TOKEN,
            StorageKeys.TOKEN_EXPIRY,
          ]);
        }
        return { isValid: isCurrentlyValid, isRefreshed: false };
      }
    }
    return { isValid: isCurrentlyValid, isRefreshed: false };
  } catch {
    return { isValid: false, isRefreshed: false };
  }
}

export async function getAccessToken(): Promise<string | undefined> {
  if (!(await validateAndRefreshToken()).isValid) return;
  return (await getStorageValue(StorageKeys.ACCESS_TOKEN)) || undefined;
}

export async function getUserUUID(): Promise<string | undefined> {
  const token = await getAccessToken();
  if (!token) return;
  try {
    const config = getConfig();
    const response = await fetch(`${config.apiBaseUrl}/api/oauth/profile`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) return;
    const data = await response.json();
    return data?.account?.uuid;
  } catch {
    return;
  }
}

export async function getOrganizationId(): Promise<string | undefined> {
  const token = await getAccessToken();
  if (!token) return;
  try {
    const config = getConfig();
    const response = await fetch(`${config.apiBaseUrl}/api/oauth/profile`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) return;
    const data = await response.json();
    return data?.organization?.uuid;
  } catch {
    return;
  }
}

export async function handleOAuthRedirect(
  redirectUrl: string,
  tabId?: number,
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const params = new URLSearchParams(new URL(redirectUrl).search);
    const code = params.get("code");
    const error = params.get("error");
    const errorDesc = params.get("error_description");
    const state = params.get("state");
    if (error) {
      return {
        success: false,
        error: `Authentication failed: ${error}${errorDesc ? " - " + errorDesc : ""}`,
      };
    }
    if (!code) return { success: false, error: "No authorization code received" };
    const codeVerifier =
      (await getStorageValue(StorageKeys.CODE_VERIFIER)) || "";
    const config = getConfig();
    const tokenResult = await exchangeCodeForToken(
      code,
      state || "",
      codeVerifier,
      config.oauth,
    );
    if (tokenResult.success) {
      await saveTokens(tokenResult, state || undefined);
      const successUrl = "https://superduck-ai.github.io/superduck/";
      if (tabId) await chrome.tabs.update(tabId, { url: successUrl });
      return { success: true, message: "Authentication successful!" };
    }
    return {
      success: false,
      error:
        tokenResult.error ||
        "Failed to exchange authorization code for token",
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during authentication",
    };
  }
}

async function exchangeCodeForToken(
  code: string,
  state: string,
  codeVerifier: string,
  oauthConfig: typeof BASE_OAUTH_CONFIG,
): Promise<any> {
  try {
    const response = await fetch(oauthConfig.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: oauthConfig.CLIENT_ID,
        code,
        redirect_uri: oauthConfig.REDIRECT_URI,
        state,
        code_verifier: codeVerifier,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `Token exchange failed: ${response.status} ${text}`,
      };
    }
    const data = await response.json();
    if (data.error) {
      return { success: false, error: data.error_description || data.error };
    }
    return {
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? Date.now() + 1000 * data.expires_in
        : undefined,
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Network error during token exchange",
    };
  }
}

export async function clearAuthData(): Promise<void> {
  await clearAllStorage();
}

export async function openOnboardingPage(): Promise<void> {
  const config = getConfig();
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const codeVerifier = base64UrlEncode(
    crypto.getRandomValues(new Uint8Array(32)),
  );
  const challengeBytes = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", challengeBytes);
  const codeChallenge = base64UrlEncode(new Uint8Array(digest));
  await setMultipleStorageValues({
    [StorageKeys.OAUTH_STATE]: state,
    [StorageKeys.CODE_VERIFIER]: codeVerifier,
  });
  const params = new URLSearchParams({
    client_id: config.oauth.CLIENT_ID,
    response_type: "code",
    scope: config.oauth.SCOPES_STR,
    redirect_uri: config.oauth.REDIRECT_URI,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  chrome.tabs.create({
    url: `${config.oauth.AUTHORIZE_URL}?${params.toString()}`,
  });
}

// =============================================================================
// Server-Sent Events (SSE) Implementation
// =============================================================================

interface SSEMessage {
  data: string;
  event: string;
  id: string;
  retry?: number;
}

function createSSEParser(
  onMessage: (line: Uint8Array, fieldLength: number) => void,
) {
  let buffer: Uint8Array | undefined;
  let position = 0;
  let fieldLength = -1;
  let discardTrailingNewline = false;

  return function push(chunk: Uint8Array) {
    if (buffer === undefined) {
      buffer = chunk;
      position = 0;
      fieldLength = -1;
    } else {
      const merged = new Uint8Array(buffer.length + chunk.length);
      merged.set(buffer);
      merged.set(chunk, buffer.length);
      buffer = merged;
    }
    const length = buffer.length;
    let lineStart = 0;
    for (; position < length; ) {
      if (discardTrailingNewline) {
        if (buffer[position] === 10) lineStart = ++position;
        discardTrailingNewline = false;
      }
      let lineEnd = -1;
      for (; position < length && lineEnd === -1; ++position) {
        switch (buffer[position]) {
          case 58: // ':'
            if (fieldLength === -1) fieldLength = position - lineStart;
            break;
          case 13: // '\r'
            discardTrailingNewline = true;
          // falls through
          case 10: // '\n'
            lineEnd = position;
        }
      }
      if (lineEnd === -1) break;
      onMessage(buffer.subarray(lineStart, lineEnd), fieldLength);
      lineStart = position;
      fieldLength = -1;
    }
    if (lineStart === length) {
      buffer = undefined;
    } else if (lineStart !== 0) {
      buffer = buffer.subarray(lineStart);
      position -= lineStart;
    }
  };
}

const SSE_CONTENT_TYPE = "text/event-stream";
const LAST_EVENT_ID_HEADER = "last-event-id";

interface FetchEventSourceOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  onopen?: (response: Response) => Promise<void>;
  onmessage?: (message: SSEMessage) => void;
  onclose?: () => void;
  onerror?: (error: any) => number | void;
  openWhenHidden?: boolean;
  fetch?: typeof globalThis.fetch;
  method?: string;
  body?: string;
  [key: string]: any;
}

function defaultOnOpen(response: Response): void {
  const contentType = response.headers.get("content-type");
  if (!contentType?.startsWith(SSE_CONTENT_TYPE)) {
    throw new Error(
      `Expected content-type to be ${SSE_CONTENT_TYPE}, Actual: ${contentType}`,
    );
  }
}

function fetchEventSource(
  url: string,
  options: FetchEventSourceOptions,
): Promise<void> {
  const {
    signal,
    headers: inputHeaders,
    onopen,
    onmessage,
    onclose,
    onerror,
    openWhenHidden,
    fetch: customFetch,
    ...rest
  } = options;

  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...inputHeaders };
    let controller: AbortController;

    function onVisibilityChange() {
      controller.abort();
      if (!document.hidden) connect();
    }

    if (!headers.accept) headers.accept = SSE_CONTENT_TYPE;
    if (!openWhenHidden)
      document.addEventListener("visibilitychange", onVisibilityChange);

    let retryMs = 1000;
    let retryTimer = 0;

    function dispose() {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearTimeout(retryTimer);
      controller.abort();
    }

    signal?.addEventListener("abort", () => {
      dispose();
      resolve();
    });

    const fetchFn = customFetch ?? window.fetch;
    const openHandler = onopen ?? (defaultOnOpen as any);

    async function connect() {
      controller = new AbortController();
      try {
        const response = await fetchFn(url, {
          ...rest,
          headers,
          signal: controller.signal,
        });
        await openHandler(response);
        const decoder = new TextDecoder();
        let msg: SSEMessage = {
          data: "",
          event: "",
          id: "",
          retry: undefined,
        };
        const parser = createSSEParser((line, fieldLen) => {
          if (line.length === 0) {
            onmessage?.(msg);
            msg = { data: "", event: "", id: "", retry: undefined };
          } else if (fieldLen > 0) {
            const field = decoder.decode(line.subarray(0, fieldLen));
            const valueStart =
              fieldLen + (line[fieldLen + 1] === 32 ? 2 : 1);
            const value = decoder.decode(line.subarray(valueStart));
            switch (field) {
              case "data":
                msg.data = msg.data ? msg.data + "\n" + value : value;
                break;
              case "event":
                msg.event = value;
                break;
              case "id":
                msg.id = value;
                if (value) headers[LAST_EVENT_ID_HEADER] = value;
                else delete headers[LAST_EVENT_ID_HEADER];
                break;
              case "retry": {
                const n = parseInt(value, 10);
                if (!isNaN(n)) {
                  msg.retry = n;
                  retryMs = n;
                }
              }
            }
          }
        });
        const reader = response.body!.getReader();
        let result: ReadableStreamReadResult<Uint8Array>;
        while (!(result = await reader.read()).done) {
          parser(result.value);
        }
        onclose?.();
        dispose();
        resolve();
      } catch (err) {
        if (!controller.signal.aborted) {
          try {
            const delay = onerror?.(err) ?? retryMs;
            window.clearTimeout(retryTimer);
            retryTimer = window.setTimeout(connect, delay as number);
          } catch (fatalErr) {
            dispose();
            reject(fatalErr);
          }
        }
      }
    }

    connect();
  });
}

// =============================================================================
// API Client
// =============================================================================

export const apiClient = new (class {
  baseURL: string;

  constructor() {
    const config = getConfig();
    this.baseURL = config.apiBaseUrl;
  }

  async fetch(path: string, options: RequestInit & { headers?: Record<string, string> } = {}): Promise<any> {
    const token = await getAccessToken();
    if (!token) throw new Error("No valid OAuth token available");
    const url = `${this.baseURL}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "anthropic-client-platform": "claude_browser_extension",
      ...(options.headers as Record<string, string>),
    };
    const response = await fetch(url, { ...options, headers });
    if (!response.ok)
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`,
      );
    const contentType = response.headers.get("content-type");
    if (response.status === 204) return null;
    if (contentType?.includes("application/json")) return response.json();
    if (contentType) return response.blob();
    return null;
  }

  async fetchEventSource(
    path: string,
    options: FetchEventSourceOptions,
  ): Promise<() => void> {
    const token = await getAccessToken();
    if (!token)
      throw new Error("No valid OAuth token available for SSE stream");
    const url = `${this.baseURL}${path}`;
    const controller = new AbortController();
    await fetchEventSource(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-client-platform": "claude_browser_extension",
        ...options.headers,
      },
      signal: options.signal || controller.signal,
    });
    return () => controller.abort();
  }
})();

// =============================================================================
// Feature Flags Manager
// =============================================================================

interface FeatureFlagConfig {
  fetchFeatures: () => Promise<any>;
  onFeaturesUpdated?: (features: any) => void;
  cacheTTL?: number;
  storageKey?: string;
}

export class FeatureFlagManager {
  private config: Required<Pick<FeatureFlagConfig, "cacheTTL" | "storageKey">> &
    FeatureFlagConfig;
  private features: Record<string, any> | null = null;
  private cacheTimestamp: number | null = null;
  private initPromise: Promise<void> | null = null;
  private isRefreshing = false;

  constructor(config: FeatureFlagConfig) {
    this.config = {
      ...config,
      cacheTTL: config.cacheTTL ?? 300000,
      storageKey: config.storageKey ?? "features",
    };
  }

  setOnFeaturesUpdated(cb: (features: any) => void): void {
    this.config.onFeaturesUpdated = cb;
  }

  private async loadFromCache(): Promise<any | null> {
    try {
      const stored = (
        await chrome.storage.local.get(this.config.storageKey)
      )[this.config.storageKey] as { payload?: any; timestamp?: number } | undefined;
      if (stored?.payload && stored?.timestamp) {
        if (Date.now() - stored.timestamp < this.config.cacheTTL)
          return stored;
      }
    } catch {
      // ignore
    }
    return null;
  }

  private async saveToCache(payload: any): Promise<void> {
    try {
      await chrome.storage.local.set({
        [this.config.storageKey]: { payload, timestamp: Date.now() },
      });
    } catch {
      // ignore
    }
  }

  private async fetchAndUpdate(): Promise<void> {
    const data = await this.config.fetchFeatures();
    this.features = data.features;
    this.cacheTimestamp = Date.now();
    await this.saveToCache(data);
    this.config.onFeaturesUpdated?.(data.features);
  }

  checkAndRefreshIfStale(): void {
    if (!this.cacheTimestamp || this.isRefreshing) return;
    if (Date.now() - this.cacheTimestamp > this.config.cacheTTL) {
      this.isRefreshing = true;
      this.fetchAndUpdate()
        .catch(() => {})
        .finally(() => {
          this.isRefreshing = false;
        });
    }
  }

  async initialize(): Promise<void> {
    if (this.features) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const cached = await this.loadFromCache();
        if (cached) {
          this.features = cached.payload.features;
          this.cacheTimestamp = cached.timestamp;
          this.config.onFeaturesUpdated?.(cached.payload.features);
          if (Date.now() - cached.timestamp > this.config.cacheTTL / 2) {
            this.isRefreshing = true;
            try {
              await this.fetchAndUpdate();
            } catch {
              // ignore
            } finally {
              this.isRefreshing = false;
            }
          }
          return;
        }
        try {
          await this.fetchAndUpdate();
        } catch {
          // ignore
        }
      })();
    }
    return this.initPromise;
  }

  getFeatureValue(key: string, defaultValue?: any): any {
    this.checkAndRefreshIfStale();
    const feature = this.features?.[key];
    return feature && feature.value !== undefined && feature.value !== null
      ? feature.value
      : defaultValue;
  }

  async getFeatureValueAsync(key: string, defaultValue?: any): Promise<any> {
    await this.checkAndRefreshIfStale();
    const feature = this.features?.[key];
    return feature && feature.value !== undefined && feature.value !== null
      ? feature.value
      : defaultValue;
  }

  isFeatureEnabled(key: string): boolean {
    this.checkAndRefreshIfStale();
    return this.features?.[key]?.on ?? false;
  }

  async isFeatureEnabledAsync(key: string): Promise<boolean> {
    await this.checkAndRefreshIfStale();
    return this.features?.[key]?.on ?? false;
  }

  getFeature(key: string): any {
    this.checkAndRefreshIfStale();
    return this.features?.[key];
  }

  async getFeatureAsync(key: string): Promise<any> {
    await this.checkAndRefreshIfStale();
    return this.features?.[key];
  }

  async refresh(): Promise<void> {
    await this.fetchAndUpdate();
  }

  isReady(): boolean {
    return this.features !== null;
  }
}

// =============================================================================
// React Feature Provider & Hooks
// =============================================================================

async function fetchBootstrapFeatures(): Promise<any> {
  return apiClient.fetch("/api/bootstrap/features/claude_in_chrome");
}

interface FeatureContextValue {
  isReady: boolean;
  error: Error | null;
  getFeatureValue: (key: string, defaultValue?: any) => any;
  isFeatureEnabled: (key: string) => boolean;
  getFeature: (key: string) => any;
  hasFeature: (key: string) => boolean;
  refresh: () => Promise<void>;
}

let sharedManager: FeatureFlagManager | null = null;
const FeatureContext = React.createContext<FeatureContextValue | null>(null);

export function FeatureProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [features, setFeatures] = React.useState<any>(null);
  const [isReady, setIsReady] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const managerRef = React.useRef<FeatureFlagManager | null>(null);

  React.useEffect(() => {
    const onUpdate = (f: any) => {
      setFeatures(f);
      setError(null);
    };
    if (!sharedManager) {
      sharedManager = new FeatureFlagManager({
        fetchFeatures: fetchBootstrapFeatures,
        onFeaturesUpdated: onUpdate,
      });
    }
    const manager = sharedManager;
    managerRef.current = manager;
    manager.setOnFeaturesUpdated(onUpdate);
    manager
      .initialize()
      .then(() => setIsReady(true))
      .catch((e) => {
        setError(e instanceof Error ? e : new Error(String(e)));
        setIsReady(true);
      });
  }, []);

  const getFeatureValue = React.useCallback(
    (key: string, defaultValue?: any) =>
      managerRef.current
        ? managerRef.current.getFeatureValue(key, defaultValue)
        : defaultValue,
    [features],
  );
  const isFeatureEnabled = React.useCallback(
    (key: string) =>
      !!managerRef.current && managerRef.current.isFeatureEnabled(key),
    [features],
  );
  const getFeature = React.useCallback(
    (key: string) => managerRef.current?.getFeature(key),
    [features],
  );
  const hasFeature = React.useCallback(
    (key: string) => features?.[key] !== undefined,
    [features],
  );
  const refresh = React.useCallback(async () => {
    if (managerRef.current) await managerRef.current.refresh();
  }, []);

  const value = React.useMemo(
    () => ({
      isReady,
      error,
      getFeatureValue,
      isFeatureEnabled,
      getFeature,
      hasFeature,
      refresh,
    }),
    [isReady, error, getFeatureValue, isFeatureEnabled, getFeature, hasFeature, refresh],
  );

  return React.createElement(FeatureContext.Provider, { value }, children);
}

export function useFeatures(): FeatureContextValue {
  const ctx = React.useContext(FeatureContext);
  if (!ctx)
    throw new Error("useFeatures must be used within a FeatureProvider");
  return ctx;
}

export function useFeatureValue(key: string, defaultValue?: any): any {
  const { getFeatureValue: gfv } = useFeatures();
  return gfv(key, defaultValue);
}

export function useFeatureEnabled(key: string): boolean {
  const { isFeatureEnabled: ife } = useFeatures();
  return ife(key);
}

export function useIsReady(): boolean {
  const { isReady } = useFeatures();
  return isReady;
}

// =============================================================================
// Analytics Helpers
// =============================================================================

export async function getOrCreateAnonymousId(): Promise<string> {
  let id = await getStorageValue(StorageKeys.ANONYMOUS_ID);
  if (!id) {
    id = crypto.randomUUID();
    await setStorageValue(StorageKeys.ANONYMOUS_ID, id);
  }
  return id;
}

export function getProfileTraits(profile: any): Record<string, any> {
  return {
    email: profile.account.email,
    organizationID: profile.organization.uuid,
    organizationUUID: profile.organization.uuid,
    applicationSlug: "claude-browser-use",
    isMax: profile.account.has_claude_max,
    isPro: profile.account.has_claude_pro,
    orgType: profile.organization.organization_type,
  };
}

// =============================================================================
// Permission Enums & Helpers
// =============================================================================

export enum PermissionActionType {
  NAVIGATE = "navigate",
  READ_PAGE_CONTENT = "read_page_content",
  READ_CONSOLE_MESSAGES = "read_console_messages",
  READ_NETWORK_REQUESTS = "read_network_requests",
  CLICK = "click",
  TYPE = "type",
  UPLOAD_IMAGE = "upload_image",
  DOMAIN_TRANSITION = "domain_transition",
  PLAN_APPROVAL = "plan_approval",
  EXECUTE_JAVASCRIPT = "execute_javascript",
  REMOTE_MCP = "remote_mcp",
}

export enum PermissionAction {
  ALLOW = "allow",
  DENY = "deny",
}

export enum PermissionDuration {
  ONCE = "once",
  ALWAYS = "always",
}

export function getPermissionActionText(
  action: PermissionActionType,
): string | undefined {
  const map: Record<string, string> = {
    [PermissionActionType.NAVIGATE]: "navigate to",
    [PermissionActionType.READ_PAGE_CONTENT]: "read page content on",
    [PermissionActionType.READ_CONSOLE_MESSAGES]:
      "read debugging information on",
    [PermissionActionType.READ_NETWORK_REQUESTS]:
      "read debugging information on",
    [PermissionActionType.CLICK]: "click on",
    [PermissionActionType.TYPE]: "type text into",
    [PermissionActionType.UPLOAD_IMAGE]: "upload an image to",
    [PermissionActionType.DOMAIN_TRANSITION]: "navigate from",
    [PermissionActionType.PLAN_APPROVAL]: "approve plan for",
    [PermissionActionType.EXECUTE_JAVASCRIPT]: "execute JavaScript on",
    [PermissionActionType.REMOTE_MCP]: "access",
  };
  return map[action];
}

export const PERMISSION_MODES = [
  "follow_a_plan",
  "skip_all_permission_checks",
];
export const FOLLOW_A_PLAN = "follow_a_plan";

// =============================================================================
// SavedPromptsService
// =============================================================================

export type PromptType = 'command' | 'shortcut' | 'module';

export interface SavedPrompt {
  id: string;
  command?: string;
  prompt: string;
  type?: PromptType;
  url?: string;
  repeatType?: string;
  specificTime?: string;
  specificDate?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  monthAndDay?: string;
  skipPermissions?: boolean;
  model?: string;
  createdAt?: number;
  lastUsedAt?: number;
  usageCount?: number;
  nextRun?: number;
  [key: string]: unknown;
}

export type NewSavedPrompt = Omit<SavedPrompt, 'id' | 'prompt'> & { id?: string; prompt: string };

export class SavedPromptsService {
  static async getAllPrompts(): Promise<SavedPrompt[]> {
    return (await getStorageValue(StorageKeys.SAVED_PROMPTS)) || [];
  }

  static async getPromptById(id: string): Promise<SavedPrompt | undefined> {
    return (await this.getAllPrompts()).find((p) => p.id === id);
  }

  static async getPromptByCommand(
    command: string,
  ): Promise<SavedPrompt | undefined> {
    return (await this.getAllPrompts()).find((p) => p.command === command);
  }

  static async savePrompt(prompt: NewSavedPrompt): Promise<SavedPrompt> {
    const all = await this.getAllPrompts();
    if (prompt.command) {
      if (all.find((p) => p.command === prompt.command))
        throw new Error(`/${prompt.command} is already in use`);
    }
    const newPrompt: SavedPrompt = {
      ...(prompt as Omit<SavedPrompt, 'id'>),
      id: `prompt_${Date.now()}`,
      prompt: prompt.prompt,
      createdAt: typeof prompt.createdAt === 'number' ? prompt.createdAt : Date.now(),
      usageCount: typeof prompt.usageCount === 'number' ? prompt.usageCount : 0,
    };
    all.push(newPrompt);
    await setStorageValue(StorageKeys.SAVED_PROMPTS, all);
    if (newPrompt.repeatType && newPrompt.repeatType !== "none")
      await this.updateAlarmForPrompt(newPrompt);
    return newPrompt;
  }

  static async updatePrompt(
    id: string,
    updates: Partial<SavedPrompt>,
  ): Promise<SavedPrompt | undefined> {
    const all = await this.getAllPrompts();
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) return;
    if (updates.command && updates.command !== all[idx].command) {
      if (all.find((p) => p.command === updates.command))
        throw new Error(`/${updates.command} is already in use`);
    }
    const before = all[idx];
    all[idx] = { ...all[idx], ...updates };
    await setStorageValue(StorageKeys.SAVED_PROMPTS, all);
    const after = all[idx];
    if (
      before.repeatType !== after.repeatType ||
      before.specificTime !== after.specificTime ||
      before.specificDate !== after.specificDate ||
      before.dayOfWeek !== after.dayOfWeek ||
      before.dayOfMonth !== after.dayOfMonth ||
      before.monthAndDay !== after.monthAndDay
    ) {
      await this.updateAlarmForPrompt(after);
    }
    return all[idx];
  }

  static async deletePrompt(id: string): Promise<boolean> {
    const all = await this.getAllPrompts();
    const prompt = all.find((p) => p.id === id);
    const filtered = all.filter((p) => p.id !== id);
    if (filtered.length === all.length) return false;
    if (prompt?.repeatType && prompt.repeatType !== "none")
      await chrome.alarms.clear(id);
    await setStorageValue(StorageKeys.SAVED_PROMPTS, filtered);
    return true;
  }

  static async recordPromptUsage(id: string): Promise<void> {
    const all = await this.getAllPrompts();
    const prompt = all.find((p) => p.id === id);
    if (prompt) {
      prompt.lastUsedAt = Date.now();
      prompt.usageCount = (prompt.usageCount || 0) + 1;
      await setStorageValue(StorageKeys.SAVED_PROMPTS, all);
    }
  }

  static async searchPrompts(query: string): Promise<SavedPrompt[]> {
    const all = await this.getAllPrompts();
    const lower = query.toLowerCase();
    return all.filter(
      (p) =>
        p.prompt.toLowerCase().includes(lower) ||
        (p.command && p.command.toLowerCase().includes(lower)),
    );
  }

  static async exportPrompts(ids?: string[]): Promise<string> {
    const all = await this.getAllPrompts();
    const filtered = ids ? all.filter((p) => ids.includes(p.id)) : all;
    return JSON.stringify(filtered, null, 2);
  }

  static async importPrompts(
    json: string,
    replaceAll = false,
  ): Promise<number> {
    const imported: SavedPrompt[] = JSON.parse(json);
    const existing = replaceAll ? [] : await this.getAllPrompts();
    const newPrompts = imported.map((p) => ({
      ...p,
      id: `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      usageCount: 0,
      lastUsedAt: undefined,
    }));
    const combined = [...existing, ...newPrompts];
    const commands = combined.filter((p) => p.command).map((p) => p.command);
    if (commands.length !== new Set(commands).size)
      throw new Error("Import contains duplicate command shortcuts");
    await setStorageValue(StorageKeys.SAVED_PROMPTS, combined);
    return newPrompts.length;
  }

  static async updateAlarmForPrompt(prompt: SavedPrompt): Promise<void> {
    const alarmId = prompt.id;
    await chrome.alarms.clear(alarmId);
    if (!prompt.repeatType || prompt.repeatType === "none" || !prompt.specificTime)
      return;
    const now = new Date();
    const [hours, minutes] = prompt.specificTime.split(":").map(Number);
    switch (prompt.repeatType) {
      case "once": {
        if (!prompt.specificDate) return;
        const [y, m, d] = prompt.specificDate.split("-").map(Number);
        const target = new Date(y, m - 1, d, hours, minutes, 0, 0);
        if (target > now)
          await chrome.alarms.create(alarmId, { when: target.getTime() });
        break;
      }
      case "daily": {
        const target = new Date();
        target.setHours(hours, minutes, 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);
        await chrome.alarms.create(alarmId, {
          when: target.getTime(),
          periodInMinutes: 1440,
        });
        break;
      }
      case "weekly": {
        if (prompt.dayOfWeek === undefined) return;
        let daysUntil = (prompt.dayOfWeek - now.getDay() + 7) % 7;
        if (daysUntil === 0) {
          const check = new Date();
          check.setHours(hours, minutes, 0, 0);
          if (check <= now) daysUntil = 7;
        }
        const target = new Date();
        target.setDate(now.getDate() + daysUntil);
        target.setHours(hours, minutes, 0, 0);
        await chrome.alarms.create(alarmId, {
          when: target.getTime(),
          periodInMinutes: 10080,
        });
        break;
      }
      case "monthly": {
        if (!prompt.dayOfMonth) return;
        const target = new Date();
        target.setDate(prompt.dayOfMonth);
        target.setHours(hours, minutes, 0, 0);
        if (target <= now) target.setMonth(target.getMonth() + 1);
        await chrome.alarms.create(alarmId, { when: target.getTime() });
        break;
      }
      case "annually": {
        if (!prompt.monthAndDay) return;
        const [month, day] = prompt.monthAndDay.split("-").map(Number);
        const target = new Date();
        target.setMonth(month - 1);
        target.setDate(day);
        target.setHours(hours, minutes, 0, 0);
        if (target <= now) target.setFullYear(target.getFullYear() + 1);
        await chrome.alarms.create(alarmId, { when: target.getTime() });
        break;
      }
    }
  }

  static async updateNextRunTimes(): Promise<void> {
    const prompts = await this.getAllPrompts();
    const alarms = await chrome.alarms.getAll();
    let changed = false;
    for (const prompt of prompts) {
      if (prompt.repeatType && prompt.repeatType !== "none") {
        const alarm = alarms.find((a) => a.name === prompt.id);
        const nextRun = alarm?.scheduledTime;
        if (prompt.nextRun !== nextRun) {
          prompt.nextRun = nextRun;
          changed = true;
        }
      } else if (prompt.nextRun) {
        prompt.nextRun = undefined;
        changed = true;
      }
    }
    if (changed) await setStorageValue(StorageKeys.SAVED_PROMPTS, prompts);
  }
}

// =============================================================================
// Legacy re-exports for compatibility with service-worker.ts
// =============================================================================

export const savedPromptsService = SavedPromptsService;

export const loginWithProvider = openOnboardingPage;

export const E = { SavedPromptsService };
