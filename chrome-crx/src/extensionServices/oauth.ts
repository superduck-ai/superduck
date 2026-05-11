import {
  clearAllStorage,
  getConfig,
  getStorageValue,
  removeStorageValues,
  setMultipleStorageValues,
  StorageKeys,
  type OAuthConfig
} from './core';

interface TokenEndpointResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenSuccess {
  success: true;
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
}

interface TokenFailure {
  success: false;
  error: string;
}

type TokenResult = TokenSuccess | TokenFailure;

interface OAuthProfile {
  account?: {
    uuid?: string;
  };
  organization?: {
    uuid?: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function parseTokenEndpointResponse(value: unknown): TokenEndpointResponse {
  if (!isRecord(value)) {
    return {};
  }

  return {
    access_token: getOptionalString(value.access_token),
    refresh_token: getOptionalString(value.refresh_token),
    expires_in: getOptionalNumber(value.expires_in),
    error: getOptionalString(value.error),
    error_description: getOptionalString(value.error_description)
  };
}

function parseOAuthProfile(value: unknown): OAuthProfile | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const account = isRecord(value.account)
    ? { uuid: getOptionalString(value.account.uuid) }
    : undefined;
  const organization = isRecord(value.organization)
    ? { uuid: getOptionalString(value.organization.uuid) }
    : undefined;

  return { account, organization };
}

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function saveTokens(
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt?: number;
  },
  state?: string
): Promise<void> {
  await setMultipleStorageValues({
    [StorageKeys.ACCESS_TOKEN]: tokens.accessToken,
    [StorageKeys.REFRESH_TOKEN]: tokens.refreshToken,
    [StorageKeys.TOKEN_EXPIRY]: tokens.expiresAt,
    [StorageKeys.OAUTH_STATE]: state
  });
}

async function refreshToken(token: string, oauthConfig: OAuthConfig): Promise<TokenResult> {
  try {
    const response = await fetch(oauthConfig.TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: oauthConfig.CLIENT_ID,
        refresh_token: token
      })
    });
    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `Token refresh failed: ${response.status} ${text}`
      };
    }
    const responseBody: unknown = await response.json();
    const data = parseTokenEndpointResponse(responseBody);
    if (data.error) {
      return {
        success: false,
        error: data.error_description || data.error
      };
    }
    if (!data.access_token) {
      return { success: false, error: 'Token refresh response missing access token' };
    }
    return {
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || token,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error during token refresh'
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
      StorageKeys.TOKEN_EXPIRY
    ]);
    const accessToken = getOptionalString(stored[StorageKeys.ACCESS_TOKEN]);
    if (!accessToken) {
      return { isValid: false, isRefreshed: false };
    }

    const now = Date.now();
    const expiry = getOptionalNumber(stored[StorageKeys.TOKEN_EXPIRY]);
    const isCurrentlyValid = !!expiry && now < expiry;
    const needsRefresh = !!expiry && now >= expiry - 3_600_000;
    if (!needsRefresh) return { isValid: isCurrentlyValid, isRefreshed: false };
    const refreshTokenValue = getOptionalString(stored[StorageKeys.REFRESH_TOKEN]);
    if (!refreshTokenValue) return { isValid: isCurrentlyValid, isRefreshed: false };

    const config = getConfig();
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await refreshToken(refreshTokenValue, config.oauth);
      if (result.success) {
        await saveTokens(result);
        return { isValid: true, isRefreshed: true };
      }
      if (attempt === 2) {
        if (!isCurrentlyValid) {
          await removeStorageValues([
            StorageKeys.ACCESS_TOKEN,
            StorageKeys.REFRESH_TOKEN,
            StorageKeys.TOKEN_EXPIRY
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
  if (!(await validateAndRefreshToken()).isValid) return undefined;
  return (await getStorageValue<string>(StorageKeys.ACCESS_TOKEN)) || undefined;
}

async function fetchProfile(): Promise<OAuthProfile | undefined> {
  const token = await getAccessToken();
  if (!token) return undefined;

  try {
    const config = getConfig();
    const response = await fetch(`${config.apiBaseUrl}/api/oauth/profile`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) return undefined;
    const responseBody: unknown = await response.json();
    return parseOAuthProfile(responseBody);
  } catch {
    return undefined;
  }
}

export async function getUserUUID(): Promise<string | undefined> {
  const profile = await fetchProfile();
  return profile?.account?.uuid;
}

export async function getOrganizationId(): Promise<string | undefined> {
  const profile = await fetchProfile();
  return profile?.organization?.uuid;
}

async function exchangeCodeForToken(
  code: string,
  state: string,
  codeVerifier: string,
  oauthConfig: OAuthConfig
): Promise<TokenResult> {
  try {
    const response = await fetch(oauthConfig.TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: oauthConfig.CLIENT_ID,
        code,
        redirect_uri: oauthConfig.REDIRECT_URI,
        state,
        code_verifier: codeVerifier
      })
    });
    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `Token exchange failed: ${response.status} ${text}`
      };
    }
    const responseBody: unknown = await response.json();
    const data = parseTokenEndpointResponse(responseBody);
    if (data.error) {
      return {
        success: false,
        error: data.error_description || data.error
      };
    }
    if (!data.access_token || !data.refresh_token) {
      return { success: false, error: 'Token exchange response missing token fields' };
    }
    return {
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error during token exchange'
    };
  }
}

export async function handleOAuthRedirect(
  redirectUrl: string,
  tabId?: number
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const params = new URLSearchParams(new URL(redirectUrl).search);
    const code = params.get('code');
    const error = params.get('error');
    const errorDesc = params.get('error_description');
    const state = params.get('state');

    if (error) {
      return {
        success: false,
        error: `Authentication failed: ${error}${errorDesc ? ` - ${errorDesc}` : ''}`
      };
    }
    if (!code) {
      return { success: false, error: 'No authorization code received' };
    }

    const codeVerifier = (await getStorageValue<string>(StorageKeys.CODE_VERIFIER)) || '';
    const config = getConfig();
    const tokenResult = await exchangeCodeForToken(
      code,
      state || '',
      codeVerifier,
      config.oauth
    );

    if (tokenResult.success) {
      await saveTokens(tokenResult, state || undefined);
      const successUrl = 'https://superduck-ai.github.io/superduck/';
      if (tabId) {
        await chrome.tabs.update(tabId, { url: successUrl });
      }
      return { success: true, message: 'Authentication successful!' };
    }

    return {
      success: false,
      error: tokenResult.error || 'Failed to exchange authorization code for token'
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred during authentication'
    };
  }
}

export async function clearAuthData(): Promise<void> {
  await clearAllStorage();
}

export async function openOnboardingPage(): Promise<void> {
  const config = getConfig();
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const codeVerifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const challengeBytes = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', challengeBytes);
  const codeChallenge = base64UrlEncode(new Uint8Array(digest));

  await setMultipleStorageValues({
    [StorageKeys.OAUTH_STATE]: state,
    [StorageKeys.CODE_VERIFIER]: codeVerifier
  });

  const params = new URLSearchParams({
    client_id: config.oauth.CLIENT_ID,
    response_type: 'code',
    scope: config.oauth.SCOPES_STR,
    redirect_uri: config.oauth.REDIRECT_URI,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });

  chrome.tabs.create({
    url: `${config.oauth.AUTHORIZE_URL}?${params.toString()}`
  });
}

export const loginWithProvider = openOnboardingPage;
