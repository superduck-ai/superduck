import React, {
  useState,
  useEffect,
  useCallback,
  useLayoutEffect,
  useRef,
  useMemo,
  createContext,
  useContext,
  forwardRef
} from 'react';
import { useIntl, FormattedMessage } from 'react-intl';
import { createLucideIcon } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { Slot, Slottable } from '@radix-ui/react-slot';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { GrowthBook, GrowthBookProvider } from '@growthbook/growthbook-react';
import { DateTime } from 'luxon';
import Calendar from 'react-calendar';
import _ from 'lodash';
import loginSvg from '../login.svg';
import loginDarkSvg from '../login_dark.svg';
import {
  StorageKeys,
  getStorageValue,
  getConfig,
  getOrCreateAnonymousId,
  apiClient,
  loginWithProvider,
  FeatureProvider,
  useFeatureValue
} from '../SavedPromptsService';
import { IntlMessageLoaderProvider } from '../index-react-dom-intl';
import { isChineseLocale } from '../utils/locale';

function cn(...inputs: any[]): string {
  return clsx(inputs);
}

// =============================================================================
// Cookie Context & Utility (export q)
// =============================================================================
//
// The extension runs on `chrome-extension://...` origins, so cross-subdomain
// cookie sharing (the original upstream `domain=.example.com` logic) is not
// applicable here. Cookies are scoped to the current extension origin only.

const CookiesContext = createContext<any>(null);
const EXPIRED_DATE = 'Thu, 01 Jan 1970 00:00:01 GMT';

const cookies = {
  get: (name: string): string | undefined => {
    const parts = document.cookie.split(';');
    for (let i = 0; i < parts.length; i++) {
      const [key, value] = parts[i].trim().split('=');
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

// =============================================================================
// Ref utilities
// =============================================================================

function setRef(ref: any, value: any) {
  if (typeof ref === 'function') return ref(value);
  if (typeof ref === 'object' && ref !== null && 'current' in ref) {
    ref.current = value;
  }
}

function composeRefs(...refs: any[]) {
  const cleanups = new Map();
  return (node: any) => {
    if (
      (refs.forEach((ref) => {
        const cleanup = setRef(ref, node);
        if (cleanup) cleanups.set(ref, cleanup);
      }),
      cleanups.size > 0)
    )
      return () => {
        refs.forEach((ref) => {
          const cleanup = cleanups.get(ref);
          cleanup ? cleanup() : setRef(ref, null);
        });
        cleanups.clear();
      };
  };
}

function useComposedRefs(...refs: any[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(composeRefs(...refs), refs);
}

// =============================================================================
// LogTag enum (export L)
// =============================================================================

export enum LogTag {
  LOCAL_DEV = '[LOCAL_DEV]',
  QUICK_ENTRY = '[QUICK_ENTRY]',
  DESKTOP_AUTH = '[DESKTOP_AUTH]',
  CHAT_COMPLETION = '[COMPLETION]',
  EVALS = '[EVALS]',
  TEST_ONLY = '[TEST_ONLY]',
  O11Y_INTERNALS = '[O11Y]',
  AGE_VERIFICATION_SERVER = '[Age Verification Server]',
  BOOTSTRAP = '[BOOTSTRAP]',
  USER_CONTENT_RENDERER = '[USER_CONTENT_RENDERER]',
  MCP = '[MCP]',
  ARTIFACTS = '[ARTIFACTS]',
  BILLING = '[BILLING]',
  WORKBENCH = '[WORKBENCH]',
  METAPROMPT = '[METAPROMPT]',
  LOCAL_STORAGE = '[LOCAL_STORAGE]',
  SERVICE_WORKER = '[SERVICE_WORKER]',
  FILE_UPLOAD = '[FILE_UPLOAD]',
  CLIPBOARD = '[CLIPBOARD]',
  SEGMENT_EVENT = '[SEGMENT_EVENT]',
  I18N = '[I18N]',
  DESKTOP_API = '[DESKTOP_API]',
  DOCS = '[DOCS]',
  EXPERIENCE_FRAMEWORK = '[EXPERIENCE_FRAMEWORK]',
  PRIVATE_API = '[PRIVATE_API]',
  LOCAL_SESSION = '[LOCAL_SESSION]',
  NEST_UPDATE_PROXY = '[NEST_UPDATE_PROXY]',
  CC_NATIVE_INTERNAL_PROXY = '[CC_NATIVE_INTERNAL_PROXY]',
  LTI = '[LTI]',
  REACT_QUERY_CLIENT = '[REACT_QUERY_CLIENT]',
  CODE_ONBOARDING = '[CODE_ONBOARDING]',
  FEATURE_FLAGS = '[FEATURE_FLAGS]',
  SESSION_RECOVERY = '[SESSION_RECOVERY]',
  VOICE_MODE = '[VOICE_MODE]',
  TUTOR = '[TUTOR]'
}

// =============================================================================
// Logger (export s)
// =============================================================================

const Logger = {
  debug: (_tag: string, ..._args: any[]) => {},
  info: (tag: string, ...args: any[]) => {
    console.info(tag, ...args);
  },
  warn: (_tag: string, ..._args: any[]) => {},
  error: (_tag: string, ..._args: any[]) => {},
  startGroup: (tag: string, ...args: any[]) => {
    console.group(tag, ...args);
    return () => {
      console.groupEnd();
    };
  }
};

// =============================================================================
// useLocalStorage hook (export k)
// =============================================================================

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
    } catch (e) {
      Logger.warn(LogTag.LOCAL_STORAGE, `Error reading localStorage key "${storageKey}"`, e);
    }
    return defaultValue;
  });

  useEffect(() => {
    if (getInitialValueInEffect) {
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
      } catch (e) {
        Logger.warn(LogTag.LOCAL_STORAGE, `Error reading localStorage key "${storageKey}"`, e);
      }
    }
  }, [storageKey, deserialize, getInitialValueInEffect]);

  const set = useCallback(
    (newValue: any) => {
      isUpdating.current = true;
      setValue((prev: any) => {
        const resolved = typeof newValue === 'function' ? newValue(prev) : newValue;
        try {
          const wrapped = { value: resolved, tabId: tabId.current, timestamp: Date.now() };
          const serialized = JSON.stringify(wrapped);
          if ((window.localStorage.setItem(storageKey, serialized), sync)) {
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
        } catch (err) {
          Logger.warn(LogTag.LOCAL_STORAGE, `Error writing localStorage key "${storageKey}"`, err);
        }
        return resolved;
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
  }, [storageKey, defaultValue]);

  useEffect(() => {
    if (!sync) return;
    const handler = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue && !isUpdating.current) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed && typeof parsed === 'object' && 'value' in parsed && 'tabId' in parsed) {
            if (parsed.tabId === tabId.current) return;
            setValue((prev: any) => (_.isEqual(prev, parsed.value) ? prev : parsed.value));
          } else {
            const deserialized = deserialize(e.newValue);
            setValue((prev: any) => (_.isEqual(prev, deserialized) ? prev : deserialized));
          }
        } catch (err) {
          Logger.warn(
            LogTag.LOCAL_STORAGE,
            `Error handling storage event for "${storageKey}"`,
            err
          );
        }
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [storageKey, sync, deserialize]);

  return [value, set, remove];
}

function useLocalStorage(key: string, defaultValue: any, sync = true) {
  return useLocalStorageInternal({
    key,
    defaultValue,
    deserialize: (e: string) => (e === undefined ? defaultValue : JSON.parse(e)),
    getInitialValueInEffect: false,
    sync
  });
}

// =============================================================================
// Theme (export y = useTheme, export t = ThemeProvider)
// =============================================================================

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';
const ThemeContext = createContext<any>(undefined);

function resolveMode(mode: string): string {
  if (typeof window !== 'undefined' && mode === 'auto') {
    return window?.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light';
  }
  return mode === 'auto' ? 'light' : mode;
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

function ThemeProvider({
  initialTheme,
  children
}: {
  initialTheme: string;
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState(initialTheme);
  const cookieUtil = (() => {
    const ctx = useContext(CookiesContext);
    if (typeof window !== 'undefined') return cookies;
    if (!ctx) throw new Error('useCookies must be used within a ServerCookiesProvider');
    return ctx;
  })();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const [mode, setMode] = useLocalStorage('userThemeMode', 'auto');
  const [resolvedMode, setResolvedMode] = useState(resolveMode(mode));

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
    const mq = window.matchMedia(DARK_MEDIA_QUERY);
    mq.addEventListener('change', handleMediaChange);
    return () => mq.removeEventListener('change', handleMediaChange);
  }, [mode, handleMediaChange]);

  useEffect(() => {
    (window as any).electronWindowControl?.setThemeMode?.(mode === 'auto' ? 'system' : mode);
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, setTheme, resolvedMode, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};

// =============================================================================
// LoadingSpinner (export V = ji)
// =============================================================================

const LoadingSpinner: React.FC = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-text-100" />
  </div>
);

// =============================================================================
// Lucide Icons (export F = createLucideIcon, export aq = CheckIcon, export G = ChevronDownIcon)
// =============================================================================

const CheckIcon = createLucideIcon('check', [['path', { d: 'M20 6 9 17l-5-5', key: '1gmf2c' }]]);

const ChevronDownIcon = createLucideIcon('chevron-down', [
  ['path', { d: 'm6 9 6 6 6-6', key: 'qrunsl' }]
]);

// =============================================================================
// SuperDuck SVG Icons (export I = SuperDuckIcon, export a = SuperDuckIconAlt, etc.)
// =============================================================================

const ICON_SIZE_MAP: Record<number, number> = {
  12: 16,
  14: 16,
  16: 20,
  20: 20,
  24: 24,
  28: 28,
  32: 32
};

interface SuperDuckIconProps {
  size?: number;
  vectorSizeOverride?: number;
  className?: string;
  alt?: string;
  viewBox?: string;
  children?: React.ReactNode;
}

const SuperDuckIcon: React.FC<SuperDuckIconProps> = ({
  size = 20,
  vectorSizeOverride,
  className,
  alt,
  viewBox = '0 0 20 20',
  children
}) => {
  const vectorSize = vectorSizeOverride || ICON_SIZE_MAP[size];
  const svg = (
    <svg
      width={vectorSize}
      height={vectorSize}
      viewBox={viewBox}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
      className={className}
      aria-label={alt}
      aria-hidden={!alt}
    >
      {children}
    </svg>
  );
  if (vectorSizeOverride) return svg;
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {svg}
    </div>
  );
};

const ICON_SIZE_MAP_ALT: Record<number, number> = {
  12: 16,
  16: 20,
  20: 20,
  24: 24,
  28: 28,
  32: 32
};

const SuperDuckIconAlt: React.FC<SuperDuckIconProps> = ({
  size = 20,
  vectorSizeOverride,
  className,
  alt,
  viewBox = '0 0 20 20',
  children
}) => {
  const vectorSize = vectorSizeOverride || ICON_SIZE_MAP_ALT[size];
  const svg = (
    <svg
      width={vectorSize}
      height={vectorSize}
      viewBox={viewBox}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-label={alt}
      aria-hidden={!alt}
    >
      {children}
    </svg>
  );
  if (vectorSizeOverride) return svg;
  return (
    <div
      className={cn('flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {svg}
    </div>
  );
};

// Phosphor-style IconBase (export g = IconBase)
const PhosphorIconContext = createContext({
  color: 'currentColor',
  size: '1em',
  weight: 'regular',
  mirrored: false
});

const IconBase = forwardRef((props: any, ref: any) => {
  const { alt, color, size, weight, mirrored, children, weights, ...rest } = props;
  const ctx = useContext(PhosphorIconContext);
  return React.createElement(
    'svg',
    {
      ref,
      xmlns: 'http://www.w3.org/2000/svg',
      width: size ?? ctx.size,
      height: size ?? ctx.size,
      fill: color ?? ctx.color,
      viewBox: '0 0 256 256',
      transform: mirrored || ctx.mirrored ? 'scale(-1, 1)' : undefined,
      ...rest
    },
    alt && React.createElement('title', null, alt),
    children,
    weights.get(weight ?? ctx.weight)
  );
});
IconBase.displayName = 'IconBase';

// Small SVG icon components
const CalendarIcon: React.FC<any> = (props) => (
  <SuperDuckIcon {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M13.4999 2.00037C13.776 2.00037 13.9999 2.22422 13.9999 2.50037V3.00037H15.4999C16.3283 3.00037 16.9999 3.67194 16.9999 4.50037V15.5004C16.9997 16.3286 16.3282 17.0004 15.4999 17.0004H4.49988C3.67163 17.0003 3.00008 16.3286 2.99988 15.5004V4.50037C2.99988 3.67198 3.67151 3.00043 4.49988 3.00037H5.99988V2.50037C5.99988 2.22426 6.22379 2.00043 6.49988 2.00037C6.77602 2.00037 6.99988 2.22422 6.99988 2.50037V3.00037H12.9999V2.50037C12.9999 2.22426 13.2238 2.00043 13.4999 2.00037ZM3.99988 15.5004C4.00008 15.7763 4.22392 16.0003 4.49988 16.0004H15.4999C15.7759 16.0004 15.9997 15.7763 15.9999 15.5004V8.00037H3.99988V15.5004ZM4.49988 4.00037C4.22379 4.00043 3.99988 4.22427 3.99988 4.50037V7.00037H15.9999V4.50037C15.9999 4.22422 15.776 4.00037 15.4999 4.00037H13.9999V5.50037C13.9997 5.77634 13.7759 6.00037 13.4999 6.00037C13.2239 6.0003 13.0001 5.7763 12.9999 5.50037V4.00037H6.99988V5.50037C6.99968 5.77634 6.7759 6.00037 6.49988 6.00037C6.22391 6.0003 6.00008 5.7763 5.99988 5.50037V4.00037H4.49988Z"
    />
  </SuperDuckIcon>
);

const SmallChevronDownIcon: React.FC<any> = (props) => (
  <SuperDuckIcon {...props}>
    <path d="M14.128 7.16482C14.3126 6.95983 14.6298 6.94336 14.835 7.12771C15.0402 7.31242 15.0567 7.62952 14.8721 7.83477L10.372 12.835L10.2939 12.9053C10.2093 12.9667 10.1063 13 9.99995 13C9.85833 12.9999 9.72264 12.9402 9.62788 12.835L5.12778 7.83477L5.0682 7.75273C4.95072 7.55225 4.98544 7.28926 5.16489 7.12771C5.34445 6.96617 5.60969 6.95939 5.79674 7.09744L5.87193 7.16482L9.99995 11.7519L14.128 7.16482Z" />
  </SuperDuckIcon>
);

const ChevronLeftIcon: React.FC<any> = (props) => (
  <SuperDuckIcon {...props}>
    <path d="M12.2471 5.06828C12.4476 4.9506 12.7105 4.98555 12.8721 5.16496C13.0338 5.34458 13.0406 5.60972 12.9024 5.7968L12.835 5.872L8.24806 9.99997L12.835 14.1279C13.0402 14.3126 13.0567 14.6297 12.8721 14.835C12.6874 15.0402 12.3703 15.0568 12.1651 14.8721L7.16504 10.372L7.09473 10.2939C7.03341 10.2093 7 10.1062 7 9.99997C7.00007 9.85834 7.05978 9.72265 7.16504 9.62789L12.1651 5.12785L12.2471 5.06828Z" />
  </SuperDuckIcon>
);

const ChevronRightIcon: React.FC<any> = (props) => (
  <SuperDuckIcon {...props}>
    <path d="M7.12771 5.16489C7.28926 4.98544 7.55225 4.95072 7.75273 5.0682L7.83477 5.12778L12.835 9.62788C12.9402 9.72264 12.9999 9.85833 13 9.99995C13 10.1063 12.9667 10.2093 12.9053 10.2939L12.835 10.372L7.83477 14.8721C7.62952 15.0567 7.31242 15.0402 7.12771 14.835C6.94336 14.6298 6.95983 14.3126 7.16482 14.128L11.7519 9.99995L7.16482 5.87193L7.09744 5.79674C6.95939 5.60969 6.96617 5.34444 7.12771 5.16489Z" />
  </SuperDuckIcon>
);

const CheckmarkIcon: React.FC<any> = (props) => (
  <SuperDuckIcon {...props}>
    <path d="M15.1883 5.10908C15.3699 4.96398 15.6346 4.96153 15.8202 5.11592C16.0056 5.27067 16.0504 5.53125 15.9403 5.73605L15.8836 5.82003L8.38354 14.8202C8.29361 14.9279 8.16242 14.9925 8.02221 14.9989C7.88203 15.0051 7.74545 14.9526 7.64622 14.8534L4.14617 11.3533L4.08172 11.2752C3.95384 11.0811 3.97542 10.817 4.14617 10.6463C4.31693 10.4755 4.58105 10.4539 4.77509 10.5818L4.85321 10.6463L7.96556 13.7586L15.1161 5.1794L15.1883 5.10908Z" />
  </SuperDuckIcon>
);

const CircleCheckIcon: React.FC<any> = (props) => (
  <SuperDuckIcon {...props}>
    <path d="M10 2.5C14.1421 2.5 17.5 5.85786 17.5 10C17.5 14.1421 14.1421 17.5 10 17.5C5.85786 17.5 2.5 14.1421 2.5 10C2.5 5.85786 5.85786 2.5 10 2.5ZM10 3.5C6.41015 3.5 3.5 6.41015 3.5 10C3.5 13.5899 6.41015 16.5 10 16.5C13.5899 16.5 16.5 13.5899 16.5 10C16.5 6.41015 13.5899 3.5 10 3.5ZM12.6094 7.1875C12.7819 6.97187 13.0969 6.93687 13.3125 7.10938C13.5281 7.28188 13.5631 7.59687 13.3906 7.8125L9.39062 12.8125C9.30178 12.9236 9.16935 12.9912 9.02734 12.999C8.92097 13.0049 8.81649 12.9768 8.72852 12.9199L8.64648 12.8535L6.64648 10.8535L6.58203 10.7754C6.45387 10.5813 6.47562 10.3173 6.64648 10.1465C6.81735 9.97562 7.08131 9.95387 7.27539 10.082L7.35352 10.1465L8.97266 11.7656L12.6094 7.1875Z" />
  </SuperDuckIcon>
);

const VerticalDotsIcon: React.FC<any> = (props) => (
  <SuperDuckIcon {...props}>
    <path d="M10 14C10.5523 14 11 14.4477 11 15C11 15.5523 10.5523 16 10 16C9.44772 16 9 15.5523 9 15C9 14.4477 9.44772 14 10 14ZM10 9C10.5523 9 11 9.44772 11 10C11 10.5523 10.5523 11 10 11C9.44772 11 9 10.5523 9 10C9 9.44772 9.44772 9 10 9ZM10 4C10.5523 4 11 4.44772 11 5C11 5.55228 10.5523 6 10 6C9.44772 6 9 5.55228 9 5C9 4.44772 9.44772 4 10 4Z" />
  </SuperDuckIcon>
);

const PenIcon: React.FC<any> = (props) => (
  <SuperDuckIcon {...props}>
    <path d="M9.72821 2.87934C10.0318 2.10869 10.9028 1.72933 11.6735 2.03266L14.4655 3.13226C15.236 3.43593 15.6145 4.30697 15.3112 5.07758L11.3903 15.0307C11.2954 15.2717 11.1394 15.4835 10.9391 15.6459L10.8513 15.7123L7.7077 17.8979C7.29581 18.1843 6.73463 17.9917 6.57294 17.5356L6.54657 17.4409L5.737 13.6987C5.67447 13.4092 5.69977 13.107 5.80829 12.8315L9.72821 2.87934ZM6.73798 13.1987C6.70201 13.2903 6.69385 13.3906 6.71454 13.4868L7.44501 16.8627L10.28 14.892L10.3376 14.8452C10.3909 14.7949 10.4325 14.7332 10.4597 14.6645L13.0974 7.96723L9.37567 6.50141L6.73798 13.1987ZM11.3073 2.96332C11.0504 2.86217 10.7601 2.98864 10.6589 3.24555L9.74188 5.57074L13.4636 7.03754L14.3806 4.71137C14.4817 4.45445 14.3552 4.16413 14.0983 4.06293L11.3073 2.96332Z" />
  </SuperDuckIcon>
);

const MinusIcon: React.FC<any> = (props) => (
  <SuperDuckIcon {...props}>
    <path d="M16.5 9.5C16.7761 9.5 17 9.72386 17 10C17 10.2417 16.8286 10.4437 16.6006 10.4902L16.5 10.5H3.5C3.22386 10.5 3 10.2761 3 10C3 9.75829 3.17145 9.55629 3.39941 9.50977L3.5 9.5H16.5Z" />
  </SuperDuckIcon>
);

const TrashIcon: React.FC<any> = (props) => (
  <SuperDuckIcon {...props}>
    <path d="M11.3232 1.5C11.9365 1.50011 12.4881 1.87396 12.7158 2.44336L13.3379 4H17.5L17.6006 4.00977C17.8285 4.0563 18 4.25829 18 4.5C18 4.7417 17.8285 4.94371 17.6006 4.99023L17.5 5H15.9629L15.0693 16.6152C15.0091 17.3965 14.3578 17.9999 13.5742 18H6.42578C5.6912 17.9999 5.07237 17.4697 4.94824 16.7598L4.93066 16.6152L4.03711 5H2.5C2.22387 5 2.00002 4.77613 2 4.5C2 4.22386 2.22386 4 2.5 4H6.66211L7.28418 2.44336L7.33105 2.33887C7.58152 1.82857 8.10177 1.5001 8.67676 1.5H11.3232ZM5.92773 16.5381C5.94778 16.7985 6.16464 16.9999 6.42578 17H13.5742C13.8354 16.9999 14.0522 16.7985 14.0723 16.5381L14.9609 5H5.03906L5.92773 16.5381ZM8.5 8C8.77613 8 8.99998 8.22388 9 8.5V13.5C9 13.7761 8.77614 14 8.5 14C8.22386 14 8 13.7761 8 13.5V8.5C8.00002 8.22388 8.22387 8 8.5 8ZM11.5 8C11.7761 8 12 8.22386 12 8.5V13.5C12 13.7761 11.7761 14 11.5 14C11.2239 14 11 13.7761 11 13.5V8.5C11 8.22386 11.2239 8 11.5 8ZM8.67676 2.5C8.49802 2.5001 8.33492 2.59525 8.24609 2.74609L8.21289 2.81445L7.73828 4H12.2617L11.7871 2.81445C11.7112 2.62471 11.5276 2.50011 11.3232 2.5H8.67676Z" />
  </SuperDuckIcon>
);

const WarningIcon: React.FC<any> = (props) => (
  <SuperDuckIcon {...props}>
    <path d="M8.70798 3.70804C9.25201 2.78523 10.5372 2.72763 11.1738 3.53519L11.292 3.70804L17.792 14.7383C18.3812 15.7382 17.6606 17 16.5 17H3.49995C2.33937 17 1.61881 15.7382 2.20795 14.7383L8.70798 3.70804ZM10.3916 4.15824C10.1794 3.88887 9.75069 3.90817 9.56931 4.21586L3.06928 15.2461C2.87297 15.5794 3.11314 16 3.49995 16H16.5C16.8869 16 17.1271 15.5794 16.9307 15.2461L10.4306 4.21586L10.3916 4.15824ZM9.99998 13C10.4142 13 10.75 13.3358 10.75 13.75C10.7499 14.1642 10.4142 14.5 9.99998 14.5C9.58582 14.5 9.25002 14.1642 9.24998 13.75C9.24998 13.3358 9.58579 13.0001 9.99998 13ZM9.99998 8.00003C10.2761 8.00003 10.5 8.22389 10.5 8.50003V11.5C10.4999 11.7761 10.2761 12 9.99998 12C9.72389 12 9.50003 11.7761 9.49998 11.5V8.50003C9.49998 8.22391 9.72386 8.00007 9.99998 8.00003Z" />
  </SuperDuckIcon>
);

const CloseIcon: React.FC<any> = (props) => (
  <SuperDuckIcon {...props}>
    <path d="M15.1465 4.14642C15.3418 3.95121 15.6583 3.95118 15.8536 4.14642C16.0487 4.34168 16.0488 4.65822 15.8536 4.85346L10.7071 9.99997L15.8536 15.1465C16.0487 15.3417 16.0488 15.6583 15.8536 15.8535C15.6828 16.0244 15.4187 16.0461 15.2247 15.918L15.1465 15.8535L10 10.707L4.85352 15.8535C4.65827 16.0486 4.34168 16.0486 4.14648 15.8535C3.95129 15.6583 3.95142 15.3418 4.14648 15.1465L9.293 9.99997L4.14648 4.85346C3.95142 4.65818 3.95129 4.34162 4.14648 4.14642C4.34168 3.95128 4.65825 3.95138 4.85352 4.14642L10 9.29294L15.1465 4.14642Z" />
  </SuperDuckIcon>
);

// =============================================================================
// getModelDisplayName (export d)
// =============================================================================

function getModelDisplayName(model: string, config: any): string {
  if (config.options) {
    for (const opt of config.options) {
      if (typeof opt !== 'string' && opt.model === model) return opt.name;
    }
  }
  if (config.models) {
    const found = config.models.find((m: any) => m.model === model);
    if (found) return found.name;
  }
  const fallback = config.modelFallbacks?.[model];
  if (fallback) return fallback.currentModelName;
  const match = model.match(/claude-(sonnet|opus|haiku)-(\d+(?:\.\d+)?)/i);
  return match ? `${match[1].charAt(0).toUpperCase() + match[1].slice(1)} ${match[2]}` : model;
}

// =============================================================================
// getModelsConfig (export e)
// =============================================================================

function getModelsConfig() {
  return useFeatureValue('chrome_ext_models', {});
}

// =============================================================================
// Dropdown styles
// =============================================================================

const DROPDOWN_CONTENT_CLASS =
  'z-dropdown bg-bg-000 border-0.5 border-border-200 backdrop-blur-xl rounded-xl min-w-[8rem] text-text-300 shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] dark:shadow-[0px_2px_8px_0px_hsl(var(--always-black)/24%)]';
const DROPDOWN_MAX_HEIGHT_CLASS =
  'max-h-[min(var(--radix-select-content-available-height,var(--radix-dropdown-menu-content-available-height)),var(--dropdown-max-height,24rem))] overflow-y-auto overflow-x-hidden';
const DROPDOWN_ITEM_CLASS =
  'font-base min-h-8 px-2 py-1.5 rounded-lg cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis grid grid-cols-[minmax(0,_1fr)_auto] gap-2 items-center outline-none select-none [&[data-highlighted]]:bg-bg-200 [&[data-highlighted]]:text-text-000';

// =============================================================================
// Tooltip components (export T = TooltipRoot, export $ = TooltipContent)
// =============================================================================

const TooltipRoot = TooltipPrimitive.Root;
const TooltipProvider = TooltipPrimitive.Provider;
const TooltipTrigger = TooltipPrimitive.Trigger;

const DefaultTooltipContent = forwardRef<any, any>(({ className, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    className={cn(
      'px-2 py-1 text-xs font-normal font-ui leading-tight rounded-md shadow-md text-always-white bg-always-black/80 backdrop-blur break-words z-tooltip max-w-[13rem] text-pretty [*:disabled_&]:hidden',
      className
    )}
    {...props}
  />
));
DefaultTooltipContent.displayName = 'DefaultContent';

// =============================================================================
// Button variant styles
// =============================================================================

const primaryStyle =
  'bg-accent-main-100 text-oncolor-100 shadow-[inset_0_0.5px_0_hsla(var(--bg-000)/15%),0_0.5px_0.5px_hsla(var(--always-black)/18%)]';
const secondaryStyle =
  'bg-bg-000 text-text-200 border-border-300 hover:border-border-200 shadow-[0_0.5px_0.5px_hsla(var(--always-black)/6%)]';
const ghostStyle = 'bg-transparent text-text-200 hover:bg-bg-200';
const dangerStyle =
  'bg-danger-000 text-oncolor-100 shadow-[inset_0_0.5px_0_hsla(var(--bg-000)/15%),0_0.5px_0.5px_hsla(var(--always-black)/18%)]';
const superduckStyle = 'bg-accent-main-100 text-oncolor-100';

const buttonVariants = cva(
  'inline-flex items-center justify-center relative shrink-0 can-focus select-none disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none disabled:drop-shadow-none',
  {
    variants: {
      variant: {
        primary:
          'font-base-bold relative overflow-hidden transition-transform will-change-transform ease-[cubic-bezier(0.165,0.85,0.45,1)] duration-150 hover:scale-y-[1.015] hover:scale-x-[1.005] backface-hidden',
        superduck: 'font-base-bold transition-colors',
        secondary:
          'font-base-bold border-0.5 relative overflow-hidden transition duration-100 backface-hidden',
        ghost:
          'border-transparent transition font-base duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)]',
        danger:
          'font-base-bold transition hover:scale-y-[1.015] hover:scale-x-[1.005] hover:opacity-95'
      },
      size: {
        default: 'h-9 px-4 py-2 rounded-lg min-w-[5rem] active:scale-[0.985] whitespace-nowrap',
        sm: 'h-8 rounded-md px-3 min-w-[4rem] active:scale-[0.985] whitespace-nowrap !text-xs',
        lg: 'h-11 rounded-[0.6rem] px-5 min-w-[6rem] active:scale-[0.985] whitespace-nowrap !text-base',
        icon: 'h-9 w-9 rounded-md active:scale-95 shrink-0',
        icon_xs: 'h-6 w-6 rounded-md active:scale-95',
        icon_sm: 'h-8 w-8 rounded-md active:scale-95',
        icon_lg: 'h-11 w-11 rounded-[0.6rem] active:scale-95'
      },
      option: { rounded: '!rounded-full', prepend: '', append: '' }
    },
    compoundVariants: [
      { size: 'default', option: 'prepend', class: 'pl-2 pr-3 gap-1' },
      { size: 'lg', option: 'prepend', class: 'pl-2.5 pr-3.5 gap-1' },
      { size: 'sm', option: 'prepend', class: 'pl-2 pr-2.5 gap-1' },
      { size: 'default', option: 'append', class: 'pl-3 pr-2 gap-1' },
      { size: 'lg', option: 'append', class: 'pl-3.5 pr-2.5 gap-1' },
      { size: 'sm', option: 'append', class: 'pl-2.5 pr-2 gap-1' }
    ],
    defaultVariants: { variant: 'primary', size: 'default' }
  }
);

const Button = forwardRef<HTMLButtonElement, any>(
  (
    {
      className,
      variant = 'primary',
      size,
      option,
      loading,
      href,
      onLinkClick,
      target,
      prepend,
      append,
      disabled,
      children,
      type = 'button',
      tooltip,
      tooltipSide = 'bottom',
      tooltipDelay,
      tooltipDisabled,
      tooltipHoverable = false,
      shortcut,
      colorized,
      ...rest
    },
    ref
  ) => {
    if (prepend) option = 'prepend';
    if (append || shortcut) option = 'append';

    const isColorized =
      colorized && (variant === 'primary' || variant === 'secondary' || variant === 'ghost');
    const isIconOnly = !children || (size && size.startsWith('icon'));

    const variantStyle = (() => {
      switch (variant) {
        case 'secondary':
          return secondaryStyle;
        case 'ghost':
          return ghostStyle;
        case 'danger':
          return dangerStyle;
        case 'superduck':
          return superduckStyle;
        default:
          return primaryStyle;
      }
    })();

    const buttonClass = cn(
      buttonVariants({ variant, size, option, className }),
      variantStyle,
      loading && '!text-transparent ![text-shadow:_none]'
    );

    const content = (
      <>
        {loading && (
          <div className={cn('absolute inset-0 flex items-center justify-center')}>
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
          </div>
        )}
        {prepend}
        {children && <Slottable>{children}</Slottable>}
        {shortcut && <kbd className="ml-1 text-xs opacity-60">{shortcut}</kbd>}
        {append}
      </>
    );

    const button = href ? (
      <a
        ref={ref as any}
        href={href}
        target={target}
        className={buttonClass}
        onClick={onLinkClick}
        {...rest}
      >
        {content}
      </a>
    ) : (
      <button
        ref={ref}
        type={type}
        className={buttonClass}
        disabled={disabled || loading}
        aria-label={
          !rest['aria-label'] && tooltip && isIconOnly && typeof tooltip === 'string'
            ? tooltip
            : undefined
        }
        {...rest}
      >
        {content}
      </button>
    );

    if (tooltip && !tooltipDisabled) {
      return (
        <TooltipRoot delayDuration={tooltipDelay}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipPrimitive.Portal>
            <DefaultTooltipContent side={tooltipSide}>{tooltip}</DefaultTooltipContent>
          </TooltipPrimitive.Portal>
        </TooltipRoot>
      );
    }

    return button;
  }
);
Button.displayName = 'Button';

// =============================================================================
// Spinner / Login prompt (export a3 = Spinner)
// =============================================================================

const Spinner: React.FC = () => {
  const intl = useIntl();
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div className="flex flex-col items-center">
      <img
        src={loginSvg}
        alt={intl.formatMessage({ defaultMessage: 'Login', id: 'login' })}
        className="dark:hidden"
        style={{ width: '96px', height: '96px', marginBottom: '20px' }}
      />
      <img
        src={loginDarkSvg}
        alt={intl.formatMessage({ defaultMessage: 'Login', id: 'login' })}
        className="hidden dark:block"
        style={{ width: '96px', height: '96px', marginBottom: '20px' }}
      />
      <h2
        className="text-text-100 text-center font-heading"
        style={{ fontSize: '28px', lineHeight: '130%' }}
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
          } catch {
            // ignore
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

// =============================================================================
// useProfileQuery (export a4 = oA)
// =============================================================================

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

// =============================================================================
// Auth Context & Provider (export K = useAuth)
// =============================================================================

const AuthContext = createContext<any>(null);

const CurrentAccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasToken, setHasToken] = useState(false);
  const [isCheckingToken, setIsCheckingToken] = useState(true);

  useEffect(() => {
    (async () => {
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
        const newValue = changes[StorageKeys.ACCESS_TOKEN].newValue;
        setHasToken(!!newValue);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  const { data: userProfile, isLoading, error } = useProfileQuery(hasToken);
  const value = {
    userProfile: userProfile ?? null,
    isLoading: isCheckingToken || (hasToken && isLoading),
    error,
    isAuthenticated: hasToken && !!userProfile
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useCurrentAccount must be used within a CurrentAccountProvider');
  return ctx;
};

// =============================================================================
// Analytics Context & Provider (export b = useAnalytics)
// =============================================================================

const AnalyticsContext = createContext<any>(null);
let analyticsInstance: any = null;
let analyticsPromise: Promise<{ analytics: any }> | null = null;

const FeatureGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = (() => {
    try {
      const { isAuthenticated } = useAuth();
      return isAuthenticated;
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
          //   analyticsInstance = AnalyticsBrowser.load(
          //     { writeKey: config.segmentWriteKey },
          //     { user: { persist: false } },
          //   );
          //   analyticsInstance.setAnonymousId(anonymousId);
          //   analyticsInstance.register({
          //     name: "Extension Version Plugin",
          //     type: "before",
          //     version: "1.0.0",
          //     load: () => Promise.resolve(),
          //     isLoaded: () => true,
          //     track: (ctx: any) => (ctx.updateEvent("properties.extension_version", version), ctx),
          //     page: (ctx: any) => (ctx.updateEvent("properties.extension_version", version), ctx),
          //   });
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
  }, [isAuthenticated, userProfile, analytics]);

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

  const value = useMemo(() => ({ analytics, resetAnalytics }), [analytics, resetAnalytics]);

  if (isLoading) return <LoadingSpinner />;
  if (isAuthenticated) {
    return (
      <AnalyticsContext.Provider value={value}>
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
  const ctx = useContext(AnalyticsContext);
  if (!ctx) throw new Error('useAnalytics must be used within an AnalyticsProvider');
  return ctx;
};

// =============================================================================
// GrowthBook & QueryClient instances
// =============================================================================

const growthbook = new GrowthBook();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 3e5, gcTime: 6e5 } }
});

// =============================================================================
// AppProvider (export a5)
// =============================================================================

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

// =============================================================================
// Label (export M via FormattedMessage re-export)
// =============================================================================

const Label = forwardRef<
  HTMLLabelElement,
  { label?: React.ReactNode; id?: string; className?: string }
>(({ label, id, className }, ref) =>
  label ? (
    <label htmlFor={id} className={cn('text-text-200 mb-1 block font-base', className)} ref={ref}>
      {label}
    </label>
  ) : null
);
Label.displayName = 'Label';

function useGeneratedId({ id, label }: { id?: string; label?: React.ReactNode }) {
  return useMemo(
    () =>
      id ||
      (label && typeof label === 'string' ? _.uniqueId(`${_.camelCase(label)}_`) : _.uniqueId()),
    [label, id]
  );
}

// =============================================================================
// TextInput styles
// =============================================================================

const inputVariants = cva(
  'text-text-100 py-0 transition-colors can-focus cursor-text appearance-none w-full bg-bg-000 border border-border-300 hover:border-border-200 placeholder:text-text-500 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        default: 'h-9 px-3 text-sm rounded-lg',
        sm: 'h-8 px-2 text-sm rounded-md',
        lg: 'h-11 px-3 text-base rounded-[0.6rem]'
      },
      error: {
        true: 'border-danger-100 hover:border-danger-100 focus:border-danger-100',
        false: ''
      }
    },
    defaultVariants: { size: 'default', error: false }
  }
);

// =============================================================================
// TextInput (export P = TextInput)
// =============================================================================

const TextInput = forwardRef<HTMLInputElement, any>(
  (
    {
      autoFocus,
      className,
      id,
      label,
      secondaryLabel,
      size = 'default',
      error,
      type,
      value,
      currencySymbol = '$',
      labelClassName,
      onChange,
      onValueChange,
      automaticallyFocusAndSelect,
      prepend,
      append,
      ...rest
    },
    ref
  ) => {
    const inputClass = cn(inputVariants({ size, error, className }), className);
    const generatedId = useGeneratedId({ id, label });
    const innerRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (automaticallyFocusAndSelect) {
        innerRef.current?.focus();
        innerRef.current?.select();
      }
    }, []);

    const isComposing = useRef(false);
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => {
      if (!isComposing.current) {
        setLocalValue(value);
      }
    }, [value]);

    const { defaultValue: _dv, step: _step, ...filteredRest } = rest;
    const isSimple = type !== 'currency' && !(prepend || append);

    const handleCompositionStart = () => {
      isComposing.current = true;
    };

    const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
      isComposing.current = false;
      const newValue = e.currentTarget.value;
      setLocalValue(newValue);
      onValueChange?.(newValue);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setLocalValue(newValue);
      onChange?.(e);
      if (!isComposing.current) {
        onValueChange?.(newValue);
      }
    };

    return (
      <>
        {label && <Label label={label} id={generatedId} className={labelClassName} />}
        {(prepend || append) && (
          <div
            className={cn(
              inputClass,
              'inline-flex cursor-text items-stretch gap-2 can-focus-within'
            )}
            onClick={() => innerRef.current?.focus()}
          >
            {prepend && <div className="flex items-center">{prepend}</div>}
            <input
              id={generatedId}
              autoFocus={autoFocus}
              type={type}
              className="w-full placeholder:text-text-500 m-0 bg-transparent p-0 hide-focus-ring disabled:cursor-not-allowed disabled:opacity-50"
              ref={useComposedRefs(ref, innerRef)}
              value={localValue}
              onChange={handleChange}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              {...rest}
            />
            {append && (
              <div
                className={cn(
                  'flex items-center',
                  size === 'default' && '-mr-2',
                  size === 'sm' && '-mr-2',
                  size === 'lg' && '-mr-1.5'
                )}
              >
                {append}
              </div>
            )}
          </div>
        )}
        {isSimple && (
          <input
            id={generatedId}
            autoFocus={autoFocus}
            type={type}
            className={inputClass}
            ref={useComposedRefs(ref, innerRef)}
            value={localValue}
            onChange={handleChange}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            {...rest}
          />
        )}
        {secondaryLabel && <div className="text-text-400 mt-1 text-sm">{secondaryLabel}</div>}
      </>
    );
  }
);
TextInput.displayName = 'TextInput';

// =============================================================================
// ErrorMessage (export Q = ErrorMessage)
// =============================================================================

function ErrorMessage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-1', className)}>
      <WarningIcon className="text-danger-000 mt-1 shrink-0" size={16} />
      <p className="text-danger-000 text-sm">{children}</p>
    </div>
  );
}

// =============================================================================
// TextArea (export S = TextArea)
// =============================================================================

const TextArea = forwardRef<HTMLTextAreaElement, any>(
  (
    {
      id,
      className,
      rows = 3,
      minRows,
      label,
      insetLabel,
      value,
      labelClassName,
      error,
      onChange,
      onValueChange,
      customScrollbar,
      fullHeight,
      placeholder,
      ...rest
    },
    ref
  ) => {
    const generatedId = useGeneratedId({ id, label });
    const innerRef = useRef<HTMLTextAreaElement>(null);
    const isArrayPlaceholder = Array.isArray(placeholder);
    const placeholderText = isArrayPlaceholder ? '' : placeholder;

    const isComposing = useRef(false);
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => {
      if (!isComposing.current) {
        setLocalValue(value);
      }
    }, [value]);

    useEffect(() => {
      const el = innerRef.current;
      if (el && !fullHeight) {
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
      }
    }, [localValue, fullHeight]);

    const handleCompositionStart = () => {
      isComposing.current = true;
    };

    const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
      isComposing.current = false;
      const newValue = e.currentTarget.value;
      setLocalValue(newValue);
      onValueChange?.(newValue);
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setLocalValue(newValue);
      onChange?.(e);
      if (!isComposing.current) {
        onValueChange?.(newValue);
      }
    };

    return (
      <div className={cn(fullHeight && 'h-full flex flex-col')}>
        {label && !insetLabel && (
          <Label label={label} id={generatedId} className={labelClassName} />
        )}
        <div className={cn('relative', fullHeight && 'flex-1')}>
          {isArrayPlaceholder && (
            <PlaceholderRotator
              placeholders={placeholder as string[]}
              isShown={!localValue}
              className="text-text-500 font-base"
            />
          )}
          <textarea
            id={generatedId}
            ref={useComposedRefs(ref, innerRef)}
            rows={minRows || rows}
            value={localValue}
            placeholder={placeholderText}
            className={cn(
              'text-text-100 w-full bg-bg-000 border border-border-300 hover:border-border-200 rounded-lg p-3 transition-colors can-focus resize-none placeholder:text-text-500 disabled:cursor-not-allowed disabled:opacity-50',
              error && 'border-danger-100',
              fullHeight && 'h-full',
              customScrollbar && 'custom-scrollbar',
              className
            )}
            onChange={handleChange}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            {...rest}
          />
        </div>
        {typeof error === 'string' && error && (
          <div className="mt-1.5">
            <ErrorMessage>{error}</ErrorMessage>
          </div>
        )}
      </div>
    );
  }
);
TextArea.displayName = 'TextArea';

// =============================================================================
// PlaceholderRotator
// =============================================================================

const PlaceholderRotator: React.FC<{
  placeholders: string[];
  isShown: boolean;
  className?: string;
  interval?: number;
}> = ({ placeholders, isShown, className, interval = 3000 }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (isShown) {
      const timer = setInterval(() => {
        setIndex((i) => (i + 1) % placeholders.length);
      }, interval);
      return () => clearInterval(timer);
    }
  }, [placeholders.length, interval, isShown]);

  return (
    <div
      className={cn(
        'absolute top-0 left-0 right-0 bottom-0 w-full h-full p-3 pointer-events-none',
        !isShown && 'opacity-0',
        className
      )}
    >
      <AnimatePresence>
        <motion.p
          key={index}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.3 } }}
          exit={{ opacity: 0, y: -4 }}
          className="break-words absolute"
        >
          {placeholders[index]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
};

// =============================================================================
// SegmentedControl (export U = SegmentedControl)
// =============================================================================

interface SegmentedControlOption {
  key: string;
  label: string;
  ariaLabel?: string;
}

const SegmentedControl: React.FC<{
  options: SegmentedControlOption[];
  onSelect?: (key: string) => void;
  initialKey?: string;
  selectedKey?: string;
  testId?: string;
  className?: string;
  itemClassName?: string;
  renderItem?: (
    element: React.ReactNode,
    option: SegmentedControlOption,
    state: { isSelected: boolean }
  ) => React.ReactNode;
  disabled?: boolean;
  rounded?: 'default' | 'full';
}> = ({
  options,
  onSelect,
  initialKey,
  selectedKey,
  testId,
  className,
  itemClassName,
  renderItem,
  disabled,
  rounded = 'default',
  ...rest
}) => {
  const isControlled = selectedKey !== undefined;
  const [internalKey, setInternalKey] = useState(initialKey);
  const bgRef = useRef<HTMLDivElement>(null);
  const [hasTransition, setHasTransition] = useState(false);
  const initialized = useRef(false);
  const activeKey = isControlled ? selectedKey : internalKey;

  useEffect(() => {
    const bg = bgRef.current;
    const parent = bg?.parentElement;
    if (bg && parent) {
      const parentStyle = window.getComputedStyle(parent);
      const paddingLeft = parseFloat(parentStyle.paddingLeft);
      const borderRadius = parseFloat(parentStyle.borderRadius);
      const innerRadius = Math.max(0, borderRadius - paddingLeft);
      if (activeKey) {
        const idx = options.findIndex((o) => o.key === activeKey);
        const child = bg.children[idx] as HTMLElement;
        if (child) {
          const totalWidth = bg.offsetWidth;
          if (totalWidth > 0) {
            const left = child.offsetLeft;
            const right = child.offsetLeft + child.offsetWidth;
            const isFirst = idx === 0;
            const clipRight = idx === options.length - 1 ? 0 : 100 - (right / totalWidth) * 100;
            const clipLeft = isFirst ? 0 : (left / totalWidth) * 100;
            bg.style.clipPath = `inset(0 ${clipRight > 0 ? clipRight : 0}% 0 ${clipLeft > 0 ? clipLeft : 0}% round ${innerRadius}px)`;
            if (!initialized.current) {
              initialized.current = true;
              requestAnimationFrame(() => setHasTransition(true));
            }
          }
        }
      } else {
        bg.style.clipPath = `rect(0% ${2 * innerRadius}px 100% 0% round ${innerRadius}px)`;
      }
    }
  }, [activeKey, options]);

  const itemClass = 'flex items-center justify-center h-[28px] min-w-7 gap-1.5 px-3 rounded-lg';
  const roundedClass = useMemo(
    () => (rounded === 'full' ? 'rounded-full' : 'rounded-[.625rem]'),
    [rounded]
  );

  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={activeKey}
      className={cn(
        'group/segmented-control relative inline-flex w-fit h-8 text-sm font-medium bg-bg-300 p-0.5 cursor-pointer select-none',
        className,
        roundedClass
      )}
      disabled={disabled}
      onValueChange={(val) => {
        if (val !== '') {
          setInternalKey(val);
          onSelect?.(val);
        }
      }}
      {...rest}
    >
      {options.map((opt) => {
        const isSelected = activeKey === opt.key;
        const item = (
          <ToggleGroupPrimitive.Item
            key={opt.key}
            value={opt.key}
            aria-label={opt.ariaLabel}
            className={cn(
              itemClass,
              "text-text-500 hover:text-text-300 data-[state='on']:text-text-100 transition-colors duration-[250ms] motion-reduce:duration-0",
              itemClassName
            )}
            data-testid={`${testId}-${opt.key}`}
          >
            {opt.label}
          </ToggleGroupPrimitive.Item>
        );
        return renderItem ? renderItem(item, opt, { isSelected }) : item;
      })}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 p-0.5 transition-[opacity] duration-[250ms]',
          !activeKey && 'opacity-0',
          roundedClass
        )}
        style={{ filter: 'drop-shadow(0px 0px 0.5px hsl(var(--border-300)/30%))' }}
      >
        <div
          ref={bgRef}
          className={cn(
            'relative flex bg-bg-000',
            hasTransition && 'transition-[clip-path] duration-[250ms] motion-reduce:duration-0 ease'
          )}
          style={{ clipPath: 'rect(0% 0% 100% 0%)' }}
        >
          {options.map((opt) => (
            <div key={opt.key} className={cn(itemClass, 'text-transparent')} aria-hidden>
              {opt.label}
            </div>
          ))}
        </div>
      </div>
    </ToggleGroupPrimitive.Root>
  );
};

// =============================================================================
// SimpleSelect (export j$ internally)
// =============================================================================

interface SimpleSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

function SimpleSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  className,
  label
}: {
  value: string;
  onChange: (value: string) => void;
  options: SimpleSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  return (
    <div className={className}>
      {label && <label className="block font-base text-text-200 mb-1">{label}</label>}
      <div ref={containerRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            if (!disabled) {
              if (buttonRef.current) {
                const rect = buttonRef.current.getBoundingClientRect();
                const spaceBelow = window.innerHeight - rect.bottom;
                const spaceAbove = rect.top;
                const menuHeight = Math.min(240, 40 * options.length + 16);
                setPosition(spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'top' : 'bottom');
              }
              setIsOpen(!isOpen);
            }
          }}
          disabled={disabled}
          className={cn(
            'w-full h-9 px-3 py-2 text-left',
            'border border-border-300 rounded-lg',
            'bg-bg-000 text-text-100 text-sm',
            'flex items-center justify-between',
            'transition-colors can-focus',
            !disabled && 'hover:border-border-200 cursor-pointer',
            isOpen && 'border-border-200',
            disabled && 'opacity-50 cursor-not-allowed bg-bg-100'
          )}
        >
          <span className="flex items-center gap-2">
            {selected?.icon}
            <span className={selected || placeholder ? '' : 'text-text-400'}>
              {selected?.label || placeholder}
            </span>
          </span>
          <ChevronDownIcon size={16} className="text-text-400" />
        </button>
        {isOpen && (
          <div
            className={cn(
              'absolute z-dropdown w-full bg-bg-000 border-0.5 border-border-200 rounded-xl backdrop-blur-xl shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] dark:shadow-[0px_2px_8px_0px_hsl(var(--always-black)/24%)] p-1.5 max-h-60 overflow-auto',
              position === 'bottom' ? 'mt-1 top-full' : 'mb-1 bottom-full'
            )}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full px-2 py-2 text-left rounded-md transition-colors',
                  'hover:bg-bg-200',
                  'flex items-center justify-between',
                  'font-base'
                )}
              >
                <span className="flex items-center gap-2">
                  {opt.icon}
                  <span className="text-text-100">{opt.label}</span>
                </span>
                {value === opt.value && (
                  <CheckIcon size={16} className="text-accent-secondary-100" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// DatePicker component
// =============================================================================

function DatePicker({
  value,
  onChange,
  label,
  className,
  minDate
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
  minDate?: Date;
}) {
  const intl = useIntl();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const dateValue = value ? new Date(value) : null;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString(intl.locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className={className}>
      {label && <label className="block font-base text-text-200 mb-1">{label}</label>}
      <div ref={containerRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            if (buttonRef.current) {
              const rect = buttonRef.current.getBoundingClientRect();
              const spaceBelow = window.innerHeight - rect.bottom;
              const spaceAbove = rect.top;
              const menuHeight = 320;
              setPosition(spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'top' : 'bottom');
            }
            setIsOpen(!isOpen);
          }}
          className={cn(
            'w-full h-9 px-3 py-2 text-left',
            'border border-border-300 rounded-lg',
            'bg-bg-000 text-text-100 text-sm',
            'flex items-center justify-between gap-2',
            'transition-all duration-200 can-focus',
            'hover:border-border-200 hover:shadow-sm cursor-pointer',
            isOpen && 'border-border-200 shadow-sm'
          )}
        >
          <span
            className={cn(
              'min-w-0 flex-1 whitespace-nowrap overflow-hidden text-ellipsis',
              value ? '' : 'text-text-400'
            )}
          >
            {value ? formatDisplayDate(value) : intl.formatMessage({ defaultMessage: 'Select date', id: 'select_date' })}
          </span>
          <CalendarIcon size={16} className="text-text-400 shrink-0" />
        </button>
        {isOpen && (
          <div
            className={cn(
              'absolute z-dropdown min-w-[280px] bg-bg-000 border-0.5 border-border-200 rounded-xl backdrop-blur-xl shadow-[0px_4px_16px_0px_hsl(var(--always-black)/12%)] dark:shadow-[0px_4px_16px_0px_hsl(var(--always-black)/32%)] p-3',
              position === 'bottom' ? 'mt-1 top-full' : 'mb-1 bottom-full'
            )}
          >
            <Calendar
              value={dateValue}
              onChange={(date: any) => {
                if (date instanceof Date) {
                  onChange(date.toISOString().split('T')[0]);
                  setIsOpen(false);
                }
              }}
              minDate={minDate}
              locale={intl.locale}
              className="datetime-input-calendar"
              formatDay={(locale, date) => date.getDate().toString()}
              formatShortWeekday={(locale, date) => {
                const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
                const weekdaysEn = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
                return isChineseLocale(locale) ? weekdays[date.getDay()] : weekdaysEn[date.getDay()];
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// TimeInput helpers
// =============================================================================

function isValidTime(value: string): boolean {
  return /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.test(value);
}

function parseTimeInput(input: string): string | null {
  const trimmed = input.trim();
  if (isValidTime(trimmed)) {
    const [h, m] = trimmed.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }

  const normalized = trimmed
    .replace(/上午/g, 'AM ')
    .replace(/下午/g, 'PM ')
    .replace(/中午/g, 'PM ')
    .replace(/凌晨/g, 'AM ')
    .replace(/\s+/g, ' ')
    .trim();
  const match = normalized.match(/^(?:(am|pm|AM|PM)\s*)?(\d{1,2}):(\d{2})(?:\s*(am|pm|AM|PM))?$/);
  if (match) {
    const prefixPeriod = match[1];
    const suffixPeriod = match[4];
    let hours = parseInt(match[2], 10);
    const mins = match[3];
    const period = (prefixPeriod || suffixPeriod)?.toUpperCase();
    if (!period) return null;
    if (hours < 1 || hours > 12 || parseInt(mins, 10) > 59) return null;
    if (period === 'PM' && hours !== 12) hours += 12;
    else if (period === 'AM' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${mins}`;
  }
  return null;
}

function formatTime12h(value: string): string {
  if (!isValidTime(value)) return value;
  const [h, m] = value.split(':');
  const hour = parseInt(h, 10);
  return `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:${m} ${hour < 12 ? 'AM' : 'PM'}`;
}

function formatTimeForLocale(value: string, locale?: string): string {
  if (!isValidTime(value)) return value;
  if (isChineseLocale(locale)) return value;
  return formatTime12h(value);
}

// =============================================================================
// TimeInput (export S$ internally)
// =============================================================================

function TimeInput({
  value,
  onChange,
  label,
  className
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}) {
  const intl = useIntl();
  const isChinese = isChineseLocale(intl.locale);
  const [display, setDisplay] = useState(formatTimeForLocale(value, intl.locale));
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const timeOptions: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const val = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      const lbl = isChinese ? val : formatTime12h(val);
      timeOptions.push({ value: val, label: lbl });
    }
  }

  useEffect(() => {
    setDisplay(formatTimeForLocale(value, intl.locale));
    setError(null);
  }, [value, intl.locale]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      )
        setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setDisplay(val);
      setError(null);
      const parsed = parseTimeInput(val);
      if (parsed) onChange(parsed);
    },
    [onChange]
  );

  const handleBlur = useCallback(() => {
    const parsed = parseTimeInput(display);
    if (parsed) {
      setDisplay(formatTimeForLocale(parsed, intl.locale));
      onChange(parsed);
      setError(null);
    } else if (display.trim() !== '') {
      setError(intl.formatMessage({ defaultMessage: 'Invalid time format', id: '/6iExgDC34' }));
      setDisplay(formatTimeForLocale(value, intl.locale));
    }
  }, [display, onChange, value, intl]);

  const selectTime = useCallback(
    (val: string) => {
      onChange(val);
      setDisplay(formatTimeForLocale(val, intl.locale));
      setIsOpen(false);
      setError(null);
    },
    [onChange, intl.locale]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleBlur();
        setIsOpen(false);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        setDisplay(formatTimeForLocale(value, intl.locale));
        setError(null);
      } else if (e.key === 'ArrowDown' && !isOpen) {
        setIsOpen(true);
      }
    },
    [handleBlur, isOpen, value, intl.locale]
  );

  return (
    <div className={`relative ${className || ''}`}>
      {label && (
        <label className="block font-ui-serif text-sm font-semibold text-text-200 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={display}
          onChange={handleInputChange}
          onFocus={() => {
            if (inputRef.current) {
              const rect = inputRef.current.getBoundingClientRect();
              const spaceBelow = window.innerHeight - rect.bottom;
              const spaceAbove = rect.top;
              const menuHeight = Math.min(192, 40 * timeOptions.length + 16);
              setPosition(spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'top' : 'bottom');
            }
            setIsOpen(true);
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          lang={intl.locale}
          placeholder={intl.formatMessage({
            defaultMessage: 'e.g., 9:30 AM or 14:00',
            id: 'time_input_placeholder'
          })}
          className={
            'w-full h-9 px-3 pr-10 py-2 border rounded-lg bg-bg-000 text-text-100 text-sm transition-colors can-focus hover:border-border-200 ' +
            (error ? 'border-danger-100' : 'border-border-300')
          }
        />
        <button
          type="button"
          onClick={() => {
            if (inputRef.current) {
              const rect = inputRef.current.getBoundingClientRect();
              const spaceBelow = window.innerHeight - rect.bottom;
              const spaceAbove = rect.top;
              const menuHeight = Math.min(192, 40 * timeOptions.length + 16);
              setPosition(spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'top' : 'bottom');
            }
            setIsOpen(!isOpen);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-300 hover:text-text-100"
          tabIndex={-1}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      {error && <p className="text-xs text-danger-100 mt-1">{error}</p>}
      {isOpen && (
        <div
          ref={dropdownRef}
          className={cn(
            'absolute z-dropdown w-full max-h-48 overflow-auto bg-bg-000 border-0.5 border-border-200 rounded-xl backdrop-blur-xl shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] dark:shadow-[0px_2px_8px_0px_hsl(var(--always-black)/24%)] p-1.5',
            position === 'bottom' ? 'mt-1 top-full' : 'mb-1 bottom-full'
          )}
        >
          {timeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                selectTime(opt.value);
              }}
              className={
                'w-full text-left px-2 py-2 rounded-md transition-colors hover:bg-bg-200 text-sm ' +
                (opt.value === value ? 'bg-bg-200 text-text-100' : 'text-text-100')
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// getOrdinalLabel
// =============================================================================

function getOrdinalLabel(n: number, locale: string): string {
  if (isChineseLocale(locale)) return `${n}号`;
  if (n === 1 || n === 21 || n === 31) return `${n}st`;
  if (n === 2 || n === 22) return `${n}nd`;
  if (n === 3 || n === 23) return `${n}rd`;
  return `${n}th`;
}

// =============================================================================
// SchedulingFields (export U = SchedulingFields)
// =============================================================================

interface SchedulingFieldsProps {
  scheduleEnabled: boolean;
  setScheduleEnabled: (v: boolean) => void;
  repeatType: string;
  setRepeatType: (v: string) => void;
  specificDate: string;
  setSpecificDate: (v: string) => void;
  dayOfWeek: number;
  setDayOfWeek: (v: number) => void;
  dayOfMonth: number;
  setDayOfMonth: (v: number) => void;
  month: number;
  setMonth: (v: number) => void;
  day: number;
  setDay: (v: number) => void;
  specificTime: string;
  setSpecificTime: (v: string) => void;
  monthLabels: string[];
  daysOfWeekLabels: string[];
  url: string;
  setUrl: (v: string) => void;
  urlError?: string;
  selectedModel?: string;
  onModelChange?: (v: string) => void;
  availableModels?: any[];
  compact?: boolean;
  model?: string;
  setModel?: (v: string) => void;
  modelConfig?: any;
}

function SchedulingFields({
  scheduleEnabled,
  setScheduleEnabled,
  repeatType,
  setRepeatType,
  specificDate,
  setSpecificDate,
  dayOfWeek,
  setDayOfWeek,
  dayOfMonth,
  setDayOfMonth,
  month,
  setMonth,
  day,
  setDay,
  specificTime,
  setSpecificTime,
  monthLabels,
  daysOfWeekLabels,
  url,
  setUrl,
  urlError,
  selectedModel,
  onModelChange,
  availableModels,
  compact,
  model,
  setModel,
  modelConfig
}: SchedulingFieldsProps) {
  const intl = useIntl();

  const repeatOptions = [
    { value: 'once', label: intl.formatMessage({ defaultMessage: 'Once', id: 'once' }) },
    { value: 'daily', label: intl.formatMessage({ defaultMessage: 'Daily', id: 'daily' }) },
    { value: 'weekly', label: intl.formatMessage({ defaultMessage: 'Weekly', id: 'weekly' }) },
    { value: 'monthly', label: intl.formatMessage({ defaultMessage: 'Monthly', id: 'monthly' }) },
    { value: 'annually', label: intl.formatMessage({ defaultMessage: 'Annually', id: 'annually' }) }
  ];

  const dayOfMonthOptions = Array.from({ length: 31 }, (_, i) => i + 1).map((n) => ({
    value: String(n),
    label: getOrdinalLabel(n, intl.locale)
  }));

  // Resolve model props: prefer selectedModel/onModelChange, fall back to model/setModel/modelConfig
  const resolvedModel = selectedModel ?? model;
  const resolvedOnModelChange = onModelChange ?? setModel;
  const resolvedModels = availableModels ?? (modelConfig?.options as any[] | undefined);

  const renderUrlField = () => (
    <div>
      <span className="font-base text-text-200 block mb-1">
        <FormattedMessage defaultMessage="Start from" id="start_from" />
      </span>
      <TextInput
        type="text"
        value={url}
        onChange={(e: any) => setUrl(e.target.value)}
        placeholder={intl.formatMessage({ defaultMessage: 'https://example.com', id: 'url_placeholder' })}
        className="w-full text-sm"
        error={!!urlError}
      />
      {urlError && <ErrorMessage className="mt-1">{urlError}</ErrorMessage>}
    </div>
  );

  const renderScheduleToggle = () => (
    <div className="flex items-center justify-between">
      <span className="font-base text-text-200">
        <FormattedMessage defaultMessage="Schedule" id="schedule" />
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={scheduleEnabled}
        onClick={() => setScheduleEnabled(!scheduleEnabled)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out can-focus',
          scheduleEnabled ? 'bg-accent-secondary-100' : 'bg-bg-400'
        )}
      >
        <span
          // Keep the knob movement inline so it does not depend on generated utility classes.
          className="pointer-events-none absolute rounded-full bg-bg-000 shadow-sm ring-0 transition-transform duration-200 ease-in-out"
          style={{
            top: '2px',
            left: '2px',
            width: '16px',
            height: '16px',
            transform: scheduleEnabled ? 'translateX(16px)' : 'translateX(0)'
          }}
        />
      </button>
    </div>
  );

  const renderModelField = () => {
    if (!resolvedOnModelChange || !resolvedModel || !resolvedModels) return null;
    return (
      <div>
        <span className="font-base text-text-200 block mb-1">
          <FormattedMessage defaultMessage="Model" id="model" />
        </span>
        <SimpleSelect
          value={resolvedModel}
          onChange={resolvedOnModelChange}
          options={resolvedModels.map((m: any) => ({
            value: m.model ?? m.value,
            label: m.name ?? m.label
          }))}
          placeholder={intl.formatMessage({ defaultMessage: 'Select model', id: 'select_model' })}
        />
      </div>
    );
  };

  const renderScheduleFields = () => (
    <div className="flex gap-2 items-end flex-wrap">
      <div className="flex-1 min-w-[140px]">
        <SimpleSelect value={repeatType || 'once'} onChange={setRepeatType} options={repeatOptions} />
      </div>
      {repeatType === 'once' && (
        <div className="flex-1 min-w-[140px]">
          <DatePicker
            value={specificDate}
            onChange={setSpecificDate}
            minDate={new Date(Date.now() - 864e5)}
          />
        </div>
      )}
      {repeatType === 'weekly' && (
        <div className="flex-1 min-w-[140px]">
          <SimpleSelect
            value={dayOfWeek.toString()}
            onChange={(v) => setDayOfWeek(parseInt(v))}
            options={daysOfWeekLabels.map((lbl, i) => ({ value: i.toString(), label: lbl }))}
          />
        </div>
      )}
      {repeatType === 'monthly' && (
        <div className="flex-1 min-w-[140px]">
          <SimpleSelect
            value={dayOfMonth.toString()}
            onChange={(v) => setDayOfMonth(parseInt(v))}
            options={dayOfMonthOptions}
          />
        </div>
      )}
      {repeatType === 'annually' && (
        <>
          <div className="flex-1 min-w-[140px]">
            <SimpleSelect
              value={month.toString()}
              onChange={(v) => setMonth(parseInt(v))}
              options={monthLabels.map((lbl, i) => ({ value: (i + 1).toString(), label: lbl }))}
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <SimpleSelect
              value={day.toString()}
              onChange={(v) => setDay(parseInt(v))}
              options={dayOfMonthOptions}
            />
          </div>
        </>
      )}
      <div className="flex-1 min-w-[140px]">
        <TimeInput value={specificTime} onChange={setSpecificTime} />
      </div>
    </div>
  );

  if (compact) {
    return (
      <div className="space-y-3">
        {scheduleEnabled && renderScheduleFields()}
        {scheduleEnabled && renderModelField()}
      </div>
    );
  }

  // Full layout
  return (
    <div className="space-y-4">
      {renderUrlField()}
      {renderScheduleToggle()}
      {scheduleEnabled && renderScheduleFields()}
      {scheduleEnabled && renderModelField()}
    </div>
  );
}

// =============================================================================
// EditIcon alias
// =============================================================================

const EditIcon = PenIcon;

// =============================================================================
// Modal (recovered from bundle TN/RN)
// =============================================================================

function ModalFooter({
  children,
  layout = 'right',
  className: cls
}: {
  children: React.ReactNode;
  layout?: 'left' | 'center' | 'right' | 'between';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mt-4 flex flex-col gap-2',
        layout === 'left' && 'sm:flex-row',
        layout === 'center' && 'justify-center sm:flex-row',
        layout === 'right' && 'sm:flex-row justify-end',
        layout === 'between' && 'justify-between sm:flex-row',
        cls
      )}
    >
      {children}
    </div>
  );
}

function Modal({
  title,
  subtitle,
  isOpen,
  className: cls,
  children,
  onClose,
  icon,
  modalSize = 'md',
  hasCloseButton = false,
  overlayClassName,
  placement = 'center'
}: {
  title?: string;
  subtitle?: string;
  isOpen: boolean;
  className?: string;
  children: React.ReactNode;
  onClose: () => void;
  icon?: React.ReactNode;
  modalSize?: 'sm' | 'md' | 'lg' | '2lg' | 'xl' | '2xl' | '3xl';
  hasCloseButton?: boolean;
  overlayClassName?: string;
  placement?: 'center' | 'top' | 'center-locked';
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [lockedTop, setLockedTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!isOpen || placement !== 'center-locked' || lockedTop !== null || !modalRef.current) return;
    const rect = modalRef.current.getBoundingClientRect();
    setLockedTop(Math.max(16, rect.top));
  }, [isOpen, placement, lockedTop]);

  if (!isOpen) return null;
  return (
    <div
      className={cn(
        'fixed z-50 inset-0 grid justify-items-center bg-always-black overflow-y-auto md:p-10 p-4',
        placement === 'top' || (placement === 'center-locked' && lockedTop !== null)
          ? 'items-start'
          : 'items-center',
        '[background-color:hsl(var(--always-black)/0.5)]',
        overlayClassName
      )}
      style={
        placement === 'center-locked' && lockedTop !== null
          ? { paddingTop: `${lockedTop}px` }
          : undefined
      }
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className={cn(
          'flex flex-col focus:outline-none relative text-text-100 text-left shadow-xl border-0.5 border-border-300 rounded-2xl md:p-6 p-4 w-full min-w-0 bg-bg-100',
          modalSize === 'sm' && 'max-w-sm',
          modalSize === 'md' && 'max-w-md',
          modalSize === 'lg' && 'max-w-lg',
          modalSize === '2lg' && 'max-w-xl',
          modalSize === 'xl' && 'max-w-3xl',
          modalSize === '2xl' && 'max-w-5xl',
          modalSize === '3xl' && 'max-w-6xl',
          cls
        )}
      >
        <div className="min-h-full flex flex-col">
          {!!(title || hasCloseButton) && (
            <div
              className={cn('flex items-center gap-4', title ? 'justify-between' : 'justify-end')}
            >
              {title && (
                <h2 className="font-xl-bold text-text-100 flex w-full min-w-0 items-center leading-6 break-words">
                  {icon && <span className="mr-2">{icon}</span>}
                  <span className="[overflow-wrap:anywhere]">{title}</span>
                </h2>
              )}
              {hasCloseButton && (
                <Button
                  size="icon_sm"
                  variant="ghost"
                  className="!text-text-500 hover:!text-text-400 -mx-2"
                  onClick={onClose}
                >
                  <CloseIcon size={16} />
                </Button>
              )}
            </div>
          )}
          {subtitle && <p className="text-text-300 mb-2 text-sm">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// DropdownMenu (recovered from bundle WN/JN)
// =============================================================================

const DROPDOWN_ITEM_BASE_CLASS =
  'font-base min-h-8 px-2 py-1.5 rounded-lg cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis grid grid-cols-[minmax(0,_1fr)_auto] gap-2 items-center outline-none select-none hover:bg-bg-200 hover:text-text-000';

function DropdownMenu({
  trigger,
  children,
  unstyledTrigger = false
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  unstyledTrigger?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-bg-000 border-0.5 border-border-200 backdrop-blur-xl rounded-xl min-w-[8rem] text-text-300 shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] p-1.5">
          {React.Children.map(children, (child) =>
            React.isValidElement(child)
              ? React.cloneElement(child as React.ReactElement<any>, {
                  __closeMenu: () => setOpen(false)
                })
              : child
          )}
        </div>
      )}
    </div>
  );
}

function DropdownMenuItem({
  icon,
  children,
  onSelect,
  danger,
  trailing,
  __closeMenu
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  trailing?: React.ReactNode;
  __closeMenu?: () => void;
}) {
  return (
    <div
      className={cn(DROPDOWN_ITEM_BASE_CLASS, danger && '!text-danger-000 hover:bg-danger-900')}
      onClick={() => {
        onSelect?.();
        __closeMenu?.();
      }}
    >
      {icon || trailing ? (
        <div className="flex items-center gap-2 w-full font-base group">
          {icon}
          <span className="flex-1 truncate">{children}</span>
          {trailing && <div className="flex items-center flex-shrink-0 -mr-2">{trailing}</div>}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

// =============================================================================
// Exports
// =============================================================================

export {
  // Third-party re-exports
  AnimatePresence,
  motion,
  Slot,
  Slottable,
  FormattedMessage,
  createLucideIcon,

  // Custom utilities
  cn,
  cookies,
  Logger,
  useLocalStorage,
  useComposedRefs,
  useTheme,
  ThemeProvider,
  useGeneratedId,

  // Icons
  SuperDuckIcon,
  SuperDuckIconAlt,
  IconBase,
  PhosphorIconContext,
  CalendarIcon,
  SmallChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckmarkIcon,
  CircleCheckIcon,
  EditIcon,
  MinusIcon,
  TrashIcon,
  WarningIcon,
  CloseIcon,
  VerticalDotsIcon,
  CheckIcon,
  ChevronDownIcon,

  // Tooltip
  TooltipRoot,
  TooltipProvider,
  TooltipTrigger,
  DefaultTooltipContent,

  // Dropdown styles
  DROPDOWN_CONTENT_CLASS,
  DROPDOWN_MAX_HEIGHT_CLASS,
  DROPDOWN_ITEM_CLASS,

  // Dropdown Menu
  DropdownMenu,
  DropdownMenuItem,

  // Modal
  Modal,
  ModalFooter,

  // Components
  Button,
  buttonVariants,
  Spinner,
  LoadingSpinner,
  Label,
  TextInput,
  inputVariants,
  ErrorMessage,
  TextArea,
  SegmentedControl,
  SimpleSelect,
  TimeInput,
  DatePicker,
  SchedulingFields,

  // Model helpers
  getModelDisplayName,
  getModelsConfig,

  // Auth & Analytics
  useAuth,
  useAnalytics,
  useProfileQuery,
  AppProvider,
  CurrentAccountProvider,
  AnalyticsContext,
  AuthContext,
  PenIcon,
  CookiesContext
};
