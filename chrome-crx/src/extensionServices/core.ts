export function modulePreload<T>(factory: () => Promise<T>, _deps?: string[]): Promise<T> {
  return factory();
}

const PRODUCTION_EXTENSION_ID = 'komnjkkihimgafgblijcchlgeiogpjgi';

export interface OAuthConfig {
  AUTHORIZE_URL: string;
  TOKEN_URL: string;
  SCOPES_STR: string;
  CLIENT_ID: string;
  REDIRECT_URI: string;
}

const BASE_OAUTH_CONFIG: OAuthConfig = {
  AUTHORIZE_URL: 'https://claude.ai/oauth/authorize',
  TOKEN_URL: 'https://platform.claude.com/v1/oauth/token',
  SCOPES_STR: 'user:profile user:inference user:chat',
  CLIENT_ID: '54511e87-7abf-4923-9d84-d6f24532e871',
  REDIRECT_URI: 'chrome-extension://dihbgbndebgnbjfmelmegjepbnkhlgni/oauth_callback.html'
};

const OAUTH_CONFIGS = {
  development: BASE_OAUTH_CONFIG,
  production: {
    ...BASE_OAUTH_CONFIG,
    CLIENT_ID: 'dae2cad8-15c5-43d2-9046-fcaecc135fa4',
    REDIRECT_URI: `chrome-extension://${PRODUCTION_EXTENSION_ID}/oauth_callback.html`
  }
};

export function getConfig() {
  const env = 'production' as const;
  const oauth = OAUTH_CONFIGS[env];
  return {
    environment: env,
    apiBaseUrl: 'https://api.anthropic.com',
    wsApiBaseUrl: 'wss://api.anthropic.com',
    oauth,
    localBridge: false
  };
}

export enum StorageKeys {
  ACCESS_TOKEN = 'accessToken',
  REFRESH_TOKEN = 'refreshToken',
  TOKEN_EXPIRY = 'tokenExpiry',
  OAUTH_STATE = 'oauthState',
  CODE_VERIFIER = 'codeVerifier',
  API_KEY = 'anthropicApiKey',
  SELECTED_MODEL = 'selectedModel',
  SELECTED_MODEL_QUICK_MODE = 'selectedModelQuickMode',
  SYSTEM_PROMPT = 'systemPrompt',
  PURL_CONFIG = 'purlConfig',
  DEBUG_MODE = 'debugMode',
  MODEL_SELECTOR_DEBUG = 'modelSelectorDebug',
  SHOW_TRACE_IDS = 'showTraceIds',
  SHOW_SYSTEM_REMINDERS = 'showSystemReminders',
  USE_SESSIONS_API = 'useSessionsAPI',
  SESSIONS_API_HOSTNAME = 'sessionsApiHostname',
  BROWSER_CONTROL_PERMISSION_ACCEPTED = 'browserControlPermissionAccepted',
  PERMISSION_STORAGE = 'permissionStorage',
  LAST_PERMISSION_MODE_PREFERENCE = 'lastPermissionModePreference',
  ANONYMOUS_ID = 'anonymousId',
  TEST_DATA_MESSAGES = 'test_data_messages',
  SCHEDULED_TASK_LOGS = 'scheduledTaskLogs',
  SCHEDULED_TASK_STATS = 'scheduledTaskStats',
  PENDING_SCHEDULED_TASK = 'pendingScheduledTask',
  TARGET_TAB_ID = 'targetTabId',
  UPDATE_AVAILABLE = 'updateAvailable',
  TIP_DISPLAY_COUNTS = 'tipDisplayCounts',
  NEW_TAB_NOTE = 'newTabNote',
  CUSTOM_APP_LINKS = 'customAppLinks',
  NOTIFICATIONS_ENABLED = 'notificationsEnabled',
  ANNOUNCEMENT_DISMISSED = 'announcementDismissed',
  MODEL_OVERRIDE_SEEN = 'modelOverrideSeen',
  SAVED_PROMPTS = 'savedPrompts',
  SAVED_PROMPT_CATEGORIES = 'savedPromptCategories',
  TAB_GROUPS = 'tabGroups',
  DISMISSED_TAB_GROUPS = 'dismissedTabGroups',
  MCP_TAB_GROUP_ID = 'mcpTabGroupId',
  MCP_CONNECTED = 'mcpConnected',
  QUICK_MODE_TIP_DISMISSED = 'quickModeTipDismissed',
  WIDGET_ORDER = 'widgetOrder'
}

export async function getStorageValue<T>(key: string, defaultValue: T): Promise<T>;
export async function getStorageValue<T = unknown>(key: string): Promise<T | undefined>;
export async function getStorageValue<T>(key: string, defaultValue?: T): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key);
  const storedValue = result[key] as T | undefined;
  return storedValue !== undefined ? storedValue : defaultValue;
}

export async function setStorageValue(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function removeStorageValues(keys: string | string[]): Promise<void> {
  const values = Array.isArray(keys) ? keys : [keys];
  await chrome.storage.local.remove(values);
}

const PRESERVED_KEYS = new Set(['anonymousId', 'updateAvailable']);

export async function setMultipleStorageValues(values: Record<string, unknown>): Promise<void> {
  await chrome.storage.local.set(values);
}

export async function clearAllStorage(): Promise<void> {
  const keysToRemove = Object.values(StorageKeys).filter((key) => !PRESERVED_KEYS.has(key));
  await removeStorageValues(keysToRemove);
}
