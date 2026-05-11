import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import { FormattedMessage, IntlProvider, useIntl, type IntlShape } from 'react-intl';

export const DEFAULT_LOCALE = 'en-US';

export const SUPPORTED_LOCALES = [
  'en-US',
  'zh-CN'
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_DISPLAY_NAMES: Record<SupportedLocale, string> = {
  'en-US': 'English',
  'zh-CN': '简体中文'
};

const PREFERRED_LOCALE_STORAGE_KEY = 'preferred_locale';
const missingTranslationCache = new Set<string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

function resolveBrowserLocale(): SupportedLocale {
  const browserLocale = navigator.language;
  if (isSupportedLocale(browserLocale)) {
    return browserLocale;
  }

  const language = browserLocale.split('-')[0];
  const matchedLocale = SUPPORTED_LOCALES.find((locale) => locale.startsWith(`${language}-`));

  return matchedLocale ?? DEFAULT_LOCALE;
}

function shallowEqual(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined
): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const key of aKeys) {
    if (a[key] !== b[key] || !Object.prototype.hasOwnProperty.call(b, key)) {
      return false;
    }
  }

  return true;
}

function handleIntlError(error: { message?: string }): void {
  if (!error.message?.includes('MISSING_TRANSLATION')) {
    return;
  }

  if (missingTranslationCache.has(error.message)) {
    return;
  }

  missingTranslationCache.add(error.message);
}

export function useIntlSafe(): IntlShape {
  const intl = useIntl();
  if (!intl) {
    throw new Error(
      '[React Intl] Could not find required `intl` object. <IntlProvider> needs to exist in the component ancestry.'
    );
  }

  return intl;
}

export function usePreferredLocale(): {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => Promise<void>;
  isLoading: boolean;
} {
  const [locale, setLocaleState] = useState<SupportedLocale>(DEFAULT_LOCALE);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isDisposed = false;

    const loadLocale = async (): Promise<void> => {
      try {
        const stored = await chrome.storage.local.get(PREFERRED_LOCALE_STORAGE_KEY);
        const storedLocale = stored[PREFERRED_LOCALE_STORAGE_KEY];

        if (!isDisposed) {
          setLocaleState(isSupportedLocale(storedLocale) ? storedLocale : resolveBrowserLocale());
        }
      } catch {
        if (!isDisposed) {
          setLocaleState(resolveBrowserLocale());
        }
      } finally {
        if (!isDisposed) {
          setIsLoading(false);
        }
      }
    };

    void loadLocale();

    const handleStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ): void => {
      if (areaName !== 'local') {
        return;
      }

      const localeChange = changes[PREFERRED_LOCALE_STORAGE_KEY];
      if (!localeChange) {
        return;
      }

      if (isSupportedLocale(localeChange.newValue)) {
        setLocaleState(localeChange.newValue);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChanged);
    return () => {
      isDisposed = true;
      chrome.storage.onChanged.removeListener(handleStorageChanged);
    };
  }, []);

  const setLocale = useCallback(async (nextLocale: SupportedLocale) => {
    await chrome.storage.local.set({ [PREFERRED_LOCALE_STORAGE_KEY]: nextLocale });
    setLocaleState(nextLocale);
  }, []);

  return { locale, setLocale, isLoading };
}

type FormattedMessageProps = React.ComponentProps<typeof FormattedMessage>;

function FormattedMessageInner(props: FormattedMessageProps): React.ReactElement {
  return React.createElement(FormattedMessage, props);
}

export const MemoizedFormattedMessage = memo(FormattedMessageInner, (previous, next) => {
  const previousValues = isRecord(previous.values) ? previous.values : undefined;
  const nextValues = isRecord(next.values) ? next.values : undefined;

  const { values: _previousValues, ...previousRest } = previous;
  const { values: _nextValues, ...nextRest } = next;

  return (
    shallowEqual(previousValues ?? null, nextValues ?? null) && shallowEqual(previousRest, nextRest)
  );
});

MemoizedFormattedMessage.displayName = 'MemoizedFormattedMessage';

export function IntlMessageLoaderProvider({
  children
}: PropsWithChildren): React.ReactElement | null {
  const { locale, isLoading } = usePreferredLocale();
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [isMessagesLoading, setIsMessagesLoading] = useState(true);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    let isDisposed = false;

    const loadMessages = async (): Promise<void> => {
      setIsMessagesLoading(true);

      try {
        const response = await fetch(chrome.runtime.getURL(`i18n/${locale}.json`));
        if (!response.ok) {
          if (!isDisposed) {
            setMessages({});
          }
          return;
        }

        const responseBody: unknown = await response.json();
        const nextMessages = isStringRecord(responseBody) ? responseBody : {};
        if (!isDisposed) {
          setMessages(nextMessages);
        }
      } catch {
        if (!isDisposed) {
          setMessages({});
        }
      } finally {
        if (!isDisposed) {
          setIsMessagesLoading(false);
        }
      }
    };

    void loadMessages();

    return () => {
      isDisposed = true;
    };
  }, [locale, isLoading]);

  const providerProps = useMemo(
    () => ({
      defaultLocale: DEFAULT_LOCALE,
      locale,
      messages,
      onError: handleIntlError
    }),
    [locale, messages]
  );

  if (isLoading || isMessagesLoading) {
    return null;
  }

  return React.createElement(IntlProvider, providerProps, children);
}

export function getReactDom(): typeof ReactDOM {
  return ReactDOM;
}

export const ReactDomClient = ReactDOMClient;

export {
  SUPPORTED_LOCALES as A,
  IntlMessageLoaderProvider as I,
  LOCALE_DISPLAY_NAMES as L,
  MemoizedFormattedMessage as M,
  ReactDomClient as R,
  usePreferredLocale as a,
  getReactDom as r,
  useIntlSafe as u
};
