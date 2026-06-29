const SUPPORTED_LOCALES = ['en-US', 'zh-CN'] as const;
const DEFAULT_LOCALE = 'en-US';
const PREFERRED_LOCALE_STORAGE_KEY = 'preferred_locale';
const SUPPORTED_LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);
const AGENT_STATUS_KEYS = [
  'agent_status_working',
  'agent_status_helping',
  'agent_status_rushing',
  'agent_status_busy',
  'agent_status_outputting',
  'agent_status_takeover',
  'agent_status_full_power',
  'agent_status_showing_off',
  'agent_status_dont_move',
  'agent_status_working_duck',
  'agent_status_managed',
  'agent_status_online'
] as const;
const DEFAULT_I18N_MESSAGES: Record<string, string> = {
  agent_status_working: 'Duck is working hard',
  agent_status_helping: 'Quack quack~ Duck is helping you',
  agent_status_rushing: 'SuperDuck is rushing',
  agent_status_busy: 'Duck is busy doing things',
  agent_status_outputting: 'Duck is outputting like crazy',
  agent_status_takeover: 'Quack! Duck took over the browser',
  agent_status_full_power: 'Duck power at full capacity',
  agent_status_showing_off: 'SuperDuck is showing off',
  agent_status_dont_move: "Don't move! Duck is busy",
  agent_status_working_duck: 'Duck turned into working duck',
  agent_status_managed: 'This page is managed by Duck',
  agent_status_online: 'Quack agent is online',
  agent_take_over_button: 'Take over'
};

function normalizeLocale(locale: string): string {
  if (SUPPORTED_LOCALE_SET.has(locale)) {
    return locale;
  }
  const language = locale.split('-')[0];
  const matched = SUPPORTED_LOCALES.find((l) => l.startsWith(`${language}-`));
  return matched || DEFAULT_LOCALE;
}

export class I18nManager {
  private messages: Record<string, string> = DEFAULT_I18N_MESSAGES;
  private loaded = false;
  private locale = DEFAULT_LOCALE;
  private loadVersion = 0;
  onLocaleChanged: () => void = () => {};

  constructor() {
    chrome.storage.onChanged.addListener(this.handleLocaleChanged);
  }

  private handleLocaleChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ): void => {
    if (areaName !== 'local' || !changes[PREFERRED_LOCALE_STORAGE_KEY]) {
      return;
    }

    const nextLocale = normalizeLocale(
      (changes[PREFERRED_LOCALE_STORAGE_KEY].newValue as string) ||
        navigator.language ||
        DEFAULT_LOCALE
    );
    if (nextLocale === this.locale && this.loaded) {
      return;
    }

    this.loaded = false;
    void this.load().then(() => this.onLocaleChanged());
  };

  async load(): Promise<void> {
    if (this.loaded) return;
    const requestVersion = ++this.loadVersion;
    try {
      const stored = await chrome.storage.local.get(PREFERRED_LOCALE_STORAGE_KEY);
      const rawLocale: string =
        (stored[PREFERRED_LOCALE_STORAGE_KEY] as string) || navigator.language || DEFAULT_LOCALE;
      const locale = normalizeLocale(rawLocale);
      if (requestVersion !== this.loadVersion) return;
      this.messages = DEFAULT_I18N_MESSAGES;
      this.locale = locale;
      const response = await fetch(chrome.runtime.getURL(`i18n/${locale}.json`));
      if (requestVersion !== this.loadVersion) return;
      if (response.ok) {
        this.messages = { ...DEFAULT_I18N_MESSAGES, ...(await response.json()) };
      }
    } catch (e) {
      if (requestVersion !== this.loadVersion) return;
      this.messages = DEFAULT_I18N_MESSAGES;
      this.locale = DEFAULT_LOCALE;
    }
    if (requestVersion === this.loadVersion) {
      this.loaded = true;
    }
  }

  t(key: string, fallback: string = ''): string {
    return this.messages[key] || DEFAULT_I18N_MESSAGES[key] || fallback;
  }

  getRandomStatus(): string {
    const messages = AGENT_STATUS_KEYS.map((key) => this.t(key));
    return messages[Math.floor(Math.random() * messages.length)];
  }

  dispose(): void {
    chrome.storage.onChanged.removeListener(this.handleLocaleChanged);
  }
}
