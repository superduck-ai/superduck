import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import _ from 'lodash';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { GrowthBook, GrowthBookProvider } from '@growthbook/growthbook-react';
import { FormattedMessage, useIntl } from 'react-intl';
import loginSvg from '@/login.svg';
import loginDarkSvg from '@/login_dark.svg';
import {
  StorageKeys,
  apiClient,
  FeatureProvider,
  getConfig,
  getOrCreateAnonymousId,
  getStorageValue,
  loginWithProvider,
  useFeatureValue
} from '@/extensionServices';
import { IntlMessageLoaderProvider } from '@/index-react-dom-intl';
import { Button } from '@/components/ui';

const EXPIRED_DATE = 'Thu, 01 Jan 1970 00:00:01 GMT';
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

const CookiesContext = createContext<any>(null);

const cookies = {
  get: (name: string): string | undefined => {
    const parts = document.cookie.split(';');
    for (let index = 0; index < parts.length; index += 1) {
      const [key, value] = parts[index].trim().split('=');
      if (name === key) return decodeURIComponent(value);
    }
  },
  set: (name: string, value: string, options: { maxAgeSeconds?: number } = {}) => {
    document.cookie = [
      `${name}=${encodeURIComponent(value)}`,
      `max-age=${options.maxAgeSeconds ?? 31536e3}`,
      'samesite=lax',
      'secure',
      'path=/'
    ].join('; ');
  },
  delete: (name: string) => {
    document.cookie = [
      `${name}=[removed]`,
      `expires=${EXPIRED_DATE}`,
      'samesite=lax',
      'secure',
      'path=/'
    ].join('; ');
  }
};

enum LogTag {
  LOCAL_STORAGE = '[LOCAL_STORAGE]'
}

const Logger = {
  warn: (_tag: string, ..._args: any[]) => {}
};

function useLocalStorageInternal({
  key,
  defaultValue,
  deserialize = JSON.parse,
  getInitialValueInEffect = false,
  sync = true
}: {
  key: string;
  defaultValue: any;
  deserialize?: (value: string) => any;
  getInitialValueInEffect?: boolean;
  sync?: boolean;
}): [any, (value: any) => void, () => void] {
  const storageKey = `LSS-${key}`;
  const tabId = useRef(
    crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const isUpdating = useRef(false);
  const [value, setValue] = useState(() => {
    if (getInitialValueInEffect) return defaultValue;
    try {
      if (typeof window === 'undefined') return defaultValue;
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && 'value' in parsed
          ? parsed.value
          : deserialize(raw);
      }
    } catch (error) {
      Logger.warn(LogTag.LOCAL_STORAGE, `Error reading localStorage key "${storageKey}"`, error);
    }
    return defaultValue;
  });

  useEffect(() => {
    if (!getInitialValueInEffect) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setValue(
          parsed && typeof parsed === 'object' && 'value' in parsed
            ? parsed.value
            : deserialize(raw)
        );
      }
    } catch (error) {
      Logger.warn(LogTag.LOCAL_STORAGE, `Error reading localStorage key "${storageKey}"`, error);
    }
  }, [deserialize, getInitialValueInEffect, storageKey]);

  const set = useCallback(
    (nextValue: any) => {
      isUpdating.current = true;
      setValue((previousValue: any) => {
        const resolvedValue = typeof nextValue === 'function' ? nextValue(previousValue) : nextValue;
        try {
          const wrapped = { value: resolvedValue, tabId: tabId.current, timestamp: Date.now() };
          const serialized = JSON.stringify(wrapped);
          window.localStorage.setItem(storageKey, serialized);
          if (sync) {
            const event = new StorageEvent('storage', {
              key: storageKey,
              newValue: serialized,
              oldValue: window.localStorage.getItem(storageKey),
              storageArea: window.localStorage,
              url: window.location.href
            });
            setTimeout(() => {
              window.dispatchEvent(event);
            }, 0);
          }
        } catch (error) {
          Logger.warn(LogTag.LOCAL_STORAGE, `Error writing localStorage key "${storageKey}"`, error);
        }
        return resolvedValue;
      });
      Promise.resolve().then(() => {
        isUpdating.current = false;
      });
    },
    [storageKey, sync]
  );

  const remove = useCallback(() => {
    window.localStorage.removeItem(storageKey);
    setValue(defaultValue);
  }, [defaultValue, storageKey]);

  useEffect(() => {
    if (!sync) return;
    const handler = (event: StorageEvent) => {
      if (event.key === storageKey && event.newValue && !isUpdating.current) {
        try {
          const parsed = JSON.parse(event.newValue);
          if (parsed && typeof parsed === 'object' && 'value' in parsed && 'tabId' in parsed) {
            if (parsed.tabId === tabId.current) return;
            setValue((previousValue: any) => (_.isEqual(previousValue, parsed.value) ? previousValue : parsed.value));
            return;
          }
          const deserialized = deserialize(event.newValue);
          setValue((previousValue: any) =>
            _.isEqual(previousValue, deserialized) ? previousValue : deserialized
          );
        } catch (error) {
          Logger.warn(
            LogTag.LOCAL_STORAGE,
            `Error handling storage event for "${storageKey}"`,
            error
          );
        }
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [deserialize, storageKey, sync]);

  return [value, set, remove];
}

function useLocalStorage(key: string, defaultValue: any, sync = true) {
  return useLocalStorageInternal({
    key,
    defaultValue,
    deserialize: (value: string) => (value === undefined ? defaultValue : JSON.parse(value)),
    getInitialValueInEffect: false,
    sync
  });
}

const ThemeContext = createContext<any>(undefined);

function resolveMode(mode: string): string {
  if (typeof window !== 'undefined' && mode === 'auto') {
    return window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light';
  }
  return mode === 'auto' ? 'light' : mode;
}

function updateThemeColor() {
  const style = getComputedStyle(document.documentElement);
  const [h, s, l] = style.getPropertyValue('--bg-200').split(' ');
  const color = `hsl(${h},${s},${l})`;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', color);
}

function applyTheme(theme: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  updateThemeColor();
}

function applyMode(mode: string, cookieUtil: typeof cookies) {
  if (typeof document === 'undefined') return;
  const resolved = resolveMode(mode);
  cookieUtil.set('CH-prefers-color-scheme', resolved);
  document.documentElement.dataset.mode = resolved;
  updateThemeColor();
}

function ThemeProvider({
  initialTheme,
  children
}: {
  initialTheme: string;
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState(initialTheme);
  const cookieContext = useContext(CookiesContext);
  const cookieUtil = typeof window !== 'undefined' ? cookies : cookieContext;
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useLocalStorage('userThemeMode', 'auto');
  const [resolvedMode, setResolvedMode] = useState(resolveMode(mode));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setResolvedMode(resolveMode(mode));
  }, [mode]);

  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => applyMode(mode, cookieUtil), [cookieUtil, mode]);

  const handleMediaChange = useCallback(() => {
    applyMode(mode, cookieUtil);
    setResolvedMode(resolveMode(mode));
  }, [cookieUtil, mode]);

  useEffect(() => {
    if (mode !== 'auto') return;
    const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);
    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, [handleMediaChange, mode]);

  useEffect(() => {
    (window as any).electronWindowControl?.setThemeMode?.(mode === 'auto' ? 'system' : mode);
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, setTheme, resolvedMode, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

const LoadingSpinner: React.FC = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-text-100" />
  </div>
);

const Spinner: React.FC = () => {
  const intl = useIntl();
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div className="flex flex-col items-center">
      <img
        src={loginSvg}
        alt={intl.formatMessage({ defaultMessage: 'Login', id: 'login' })}
        className="dark:hidden"
        style={{ width: 96, height: 96, marginBottom: 20 }}
      />
      <img
        src={loginDarkSvg}
        alt={intl.formatMessage({ defaultMessage: 'Login', id: 'login' })}
        className="hidden dark:block"
        style={{ width: 96, height: 96, marginBottom: 20 }}
      />
      <h2
        className="text-text-100 text-center font-heading"
        style={{ fontSize: 28, lineHeight: '130%' }}
      >
        <FormattedMessage defaultMessage="Log in" id="log_in" />
      </h2>
      <p className="font-base text-text-300 text-center mt-[11px]">
        <FormattedMessage
          defaultMessage="SuperDuck in Chrome is available to"
          id="superduck_in_chrome_is_available_to"
        />
        <br />
        <FormattedMessage
          defaultMessage="all paid plan subscribers"
          id="all_paid_plan_subscribers"
        />
      </p>
      <Button
        onClick={async () => {
          setIsLoading(true);
          try {
            await loginWithProvider();
          } finally {
            setIsLoading(false);
          }
        }}
        loading={isLoading}
        className="mt-6"
        size="lg"
      >
        <FormattedMessage defaultMessage="Log in" id="log_in" />
      </Button>
    </div>
  );
};

const useProfileQuery = (enabled = true) =>
  useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => apiClient.fetch('/api/oauth/profile'),
    enabled,
    staleTime: 3e5,
    gcTime: 6e5,
    retry: (failureCount: number, error: Error) => {
      if (error.message.includes('401')) return false;
      if (error.message.includes('403')) return false;
      return failureCount < 3;
    }
  });

const AuthContext = createContext<any>(null);

const CurrentAccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasToken, setHasToken] = useState(false);
  const [isCheckingToken, setIsCheckingToken] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const token = await getStorageValue(StorageKeys.ACCESS_TOKEN);
        setHasToken(!!token);
      } catch {
        setHasToken(false);
      } finally {
        setIsCheckingToken(false);
      }
    })();

    const listener = (changes: any) => {
      if (StorageKeys.ACCESS_TOKEN in changes) {
        const nextValue = changes[StorageKeys.ACCESS_TOKEN].newValue;
        setHasToken(!!nextValue);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const { data: userProfile, isLoading, error } = useProfileQuery(hasToken);

  return (
    <AuthContext.Provider
      value={{
        userProfile: userProfile ?? null,
        isLoading: isCheckingToken || (hasToken && isLoading),
        error,
        isAuthenticated: hasToken && !!userProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within a CurrentAccountProvider');
  return context;
};

const AnalyticsContext = createContext<any>(null);
let analyticsInstance: any = null;
let analyticsPromise: Promise<{ analytics: any }> | null = null;

const FeatureGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = (() => {
    try {
      return useAuth().isAuthenticated;
    } catch {
      return false;
    }
  })();

  return isAuthenticated ? <>{children}</> : <LoadingSpinner />;
};

const AnalyticsProviderInner: React.FC<{ children: React.ReactNode; pageName: string }> = ({
  children,
  pageName
}) => {
  if (!analyticsPromise) {
    analyticsPromise = (async () => {
      try {
        const version = chrome.runtime.getManifest().version;
        const anonymousId = await getOrCreateAnonymousId();
        const config = getConfig();
        if (!analyticsInstance && config.segmentWriteKey) {
          void version;
          void anonymousId;
        }
        return { analytics: null };
      } catch {
        return { analytics: null };
      }
    })();
  }

  const { analytics } = React.use(analyticsPromise);
  const { userProfile, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isAuthenticated && userProfile && analytics) {
      analytics.identify(userProfile.account.uuid, {
        email: userProfile.account.email,
        organizationID: userProfile.organization.uuid,
        organizationUUID: userProfile.organization.uuid,
        applicationSlug: 'claude-browser-use',
        isMax: userProfile.account.has_claude_max,
        isPro: userProfile.account.has_claude_pro,
        orgType: userProfile.organization.organization_type
      });
    }
  }, [analytics, isAuthenticated, userProfile]);

  useEffect(() => {
    if (analytics) analytics.page('Extension', pageName);
  }, [analytics, pageName]);

  const resetAnalytics = useCallback(async () => {
    try {
      if (analytics) {
        analytics.reset();
        const id = await getOrCreateAnonymousId();
        analytics.setAnonymousId(id);
      }
    } catch {
      // ignore
    }
  }, [analytics]);

  const contextValue = useMemo(() => ({ analytics, resetAnalytics }), [analytics, resetAnalytics]);

  if (isLoading) return <LoadingSpinner />;
  if (isAuthenticated) {
    return (
      <AnalyticsContext.Provider value={contextValue}>
        <FeatureProvider>
          <FeatureGate>{children}</FeatureGate>
        </FeatureProvider>
      </AnalyticsContext.Provider>
    );
  }

  return (
    <div className="bg-bg-100 flex h-screen items-center justify-center">
      <Spinner />
    </div>
  );
};

const AnalyticsProvider: React.FC<{ children: React.ReactNode; pageName: string }> = ({
  children,
  pageName
}) => (
  <React.Suspense fallback={<LoadingSpinner />}>
    <AnalyticsProviderInner pageName={pageName}>{children}</AnalyticsProviderInner>
  </React.Suspense>
);

const useAnalytics = () => {
  const context = useContext(AnalyticsContext);
  if (!context) throw new Error('useAnalytics must be used within an AnalyticsProvider');
  return context;
};

const growthbook = new GrowthBook();
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 3e5, gcTime: 6e5 } }
});

const AppProvider: React.FC<{ children: React.ReactNode; pageName: string }> = ({
  children,
  pageName
}) => {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'superduck');
  }, []);

  return (
    <IntlMessageLoaderProvider>
      <GrowthBookProvider growthbook={growthbook}>
        <ThemeProvider initialTheme="superduck">
          <QueryClientProvider client={queryClient}>
            <CurrentAccountProvider>
              <AnalyticsProvider pageName={pageName}>{children}</AnalyticsProvider>
            </CurrentAccountProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </GrowthBookProvider>
    </IntlMessageLoaderProvider>
  );
};

function getModelsConfig() {
  return useFeatureValue('chrome_ext_models', {});
}

export {
  AnalyticsContext,
  AppProvider,
  AuthContext,
  CookiesContext,
  Spinner,
  getModelsConfig,
  useAnalytics,
  useAuth
};
