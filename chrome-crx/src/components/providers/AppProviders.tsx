import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import _ from 'lodash';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GrowthBook, GrowthBookProvider } from '@growthbook/growthbook-react';
import { type ModelsConfigFeatureValue } from '@/extensionServices';
import { IntlMessageLoaderProvider } from '@/index-react-dom-intl';

const EXPIRED_DATE = 'Thu, 01 Jan 1970 00:00:01 GMT';
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

type CookieStore = {
  get: (name: string) => string | undefined;
  set: (name: string, value: string, options?: { maxAgeSeconds?: number }) => void;
  delete: (name: string) => void;
};

type ElectronThemeMode = 'light' | 'dark' | 'system';

type AppWindow = Window & {
  electronWindowControl?: {
    setThemeMode?: (mode: ElectronThemeMode) => void;
  };
};

const CookiesContext = createContext<CookieStore | null>(null);

const cookies: CookieStore = {
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
  warn: (_tag: string, ..._args: unknown[]) => {}
};

interface LocalStorageEnvelope<T> {
  value: T;
  tabId: string;
  timestamp: number;
}

function isLocalStorageEnvelope<T>(value: unknown): value is LocalStorageEnvelope<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    'tabId' in value &&
    typeof (value as { tabId?: unknown }).tabId === 'string'
  );
}

function useLocalStorageInternal<T>({
  key,
  defaultValue,
  deserialize = JSON.parse,
  getInitialValueInEffect = false,
  sync = true
}: {
  key: string;
  defaultValue: T;
  deserialize?: (value: string) => T;
  getInitialValueInEffect?: boolean;
  sync?: boolean;
}): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
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
        const parsed = JSON.parse(raw) as unknown;
        return isLocalStorageEnvelope<T>(parsed) ? parsed.value : deserialize(raw);
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
        const parsed = JSON.parse(raw) as unknown;
        setValue(isLocalStorageEnvelope<T>(parsed) ? parsed.value : deserialize(raw));
      }
    } catch (error) {
      Logger.warn(LogTag.LOCAL_STORAGE, `Error reading localStorage key "${storageKey}"`, error);
    }
  }, [deserialize, getInitialValueInEffect, storageKey]);

  const set = useCallback(
    (nextValue: React.SetStateAction<T>) => {
      isUpdating.current = true;
      setValue((previousValue) => {
        const resolvedValue =
          typeof nextValue === 'function'
            ? (nextValue as (value: T) => T)(previousValue)
            : nextValue;
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
          Logger.warn(
            LogTag.LOCAL_STORAGE,
            `Error writing localStorage key "${storageKey}"`,
            error
          );
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
          const parsed = JSON.parse(event.newValue) as unknown;
          if (isLocalStorageEnvelope<T>(parsed)) {
            if (parsed.tabId === tabId.current) return;
            setValue((previousValue) =>
              _.isEqual(previousValue, parsed.value) ? previousValue : parsed.value
            );
            return;
          }
          const deserialized = deserialize(event.newValue);
          setValue((previousValue) =>
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

function useLocalStorage<T>(key: string, defaultValue: T, sync = true) {
  return useLocalStorageInternal({
    key,
    defaultValue,
    deserialize: (value: string) => (value === undefined ? defaultValue : JSON.parse(value)),
    getInitialValueInEffect: false,
    sync
  });
}

interface ThemeContextValue {
  theme: string;
  mode: string;
  setMode: React.Dispatch<React.SetStateAction<string>>;
  setTheme: React.Dispatch<React.SetStateAction<string>>;
  resolvedMode: string;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

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
  const cookieUtil = typeof window !== 'undefined' ? cookies : (cookieContext ?? cookies);
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
    const appWindow = window as AppWindow;
    appWindow.electronWindowControl?.setThemeMode?.(mode === 'auto' ? 'system' : mode);
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
  return (
    <div className="flex flex-col items-center">
      <LoadingSpinner />
    </div>
  );
};

interface AnalyticsContextValue {
  resetAnalytics: () => Promise<void>;
}

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);
let analyticsPromise: Promise<void> | null = null;

const AnalyticsProviderInner: React.FC<{ children: React.ReactNode; pageName: string }> = ({
  children,
  pageName
}) => {
  if (!analyticsPromise) {
    analyticsPromise = (async () => {
      try {
        const { initializeAnalytics } = await import('@/mcpRuntime/analytics');
        await initializeAnalytics();
      } catch {
        // best-effort
      }
    })();
  }

  React.use(analyticsPromise);

  useEffect(() => {
    if (pageName) {
      import('@/mcpRuntime/analytics')
        .then(({ trackEvent }) => {
          void trackEvent('superduck.page_view', { page: pageName });
        })
        .catch(() => {});
    }
  }, [pageName]);

  const resetAnalytics = useCallback(async () => {
    // PostHog is stateless — nothing to reset
  }, []);

  const contextValue = useMemo(() => ({ resetAnalytics }), [resetAnalytics]);

  return <AnalyticsContext.Provider value={contextValue}>{children}</AnalyticsContext.Provider>;
};

const AnalyticsProvider: React.FC<{ children: React.ReactNode; pageName: string }> = ({
  children,
  pageName
}) => (
  <React.Suspense fallback={<LoadingSpinner />}>
    <AnalyticsProviderInner pageName={pageName}>{children}</AnalyticsProviderInner>
  </React.Suspense>
);

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
            <AnalyticsProvider pageName={pageName}>{children}</AnalyticsProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </GrowthBookProvider>
    </IntlMessageLoaderProvider>
  );
};

function getModelsConfig(): ModelsConfigFeatureValue {
  return {};
}

export { AnalyticsContext, AppProvider, CookiesContext, Spinner, getModelsConfig };
