export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedThemeMode = Exclude<ThemeMode, 'system'>;

export const THEME_MODE_STORAGE_KEY = 'themeMode';

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';
const MODE_PARAM_NAMES = ['themeMode', 'colorScheme', 'appearance'];

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function resolveThemeMode(
  mode: unknown,
  prefersDark: boolean,
  forcedMode?: ResolvedThemeMode | null
): ResolvedThemeMode {
  if (forcedMode) return forcedMode;
  const normalizedMode = normalizeThemeMode(mode);
  return normalizedMode === 'system' ? (prefersDark ? 'dark' : 'light') : normalizedMode;
}

function getForcedThemeMode(): ResolvedThemeMode | null {
  const params = new URL(window.location.href).searchParams;
  for (const name of MODE_PARAM_NAMES) {
    const value = params.get(name);
    if (value === 'dark' || value === 'light') return value;
  }
  return null;
}

function applyThemeMode(theme: string, mode: ResolvedThemeMode): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.mode = mode;
  root.classList.toggle('dark', mode === 'dark');
}

export function initExtensionThemeMode(theme: string): () => void {
  const forcedMode = getForcedThemeMode();
  const media = window.matchMedia(DARK_MEDIA_QUERY);

  if (forcedMode) {
    applyThemeMode(theme, forcedMode);
    return () => undefined;
  }

  let storedMode: ThemeMode = 'system';
  const syncTheme = () => {
    applyThemeMode(theme, resolveThemeMode(storedMode, media.matches));
  };

  syncTheme();
  void chrome.storage.local.get([THEME_MODE_STORAGE_KEY]).then((result) => {
    storedMode = normalizeThemeMode(result[THEME_MODE_STORAGE_KEY]);
    syncTheme();
  });

  const handleStorageChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    if (areaName !== 'local' || !changes[THEME_MODE_STORAGE_KEY]) return;
    storedMode = normalizeThemeMode(changes[THEME_MODE_STORAGE_KEY].newValue);
    syncTheme();
  };
  const handleSystemThemeChange = () => {
    if (storedMode === 'system') syncTheme();
  };

  chrome.storage.onChanged.addListener(handleStorageChange);
  media.addEventListener('change', handleSystemThemeChange);

  return () => {
    chrome.storage.onChanged.removeListener(handleStorageChange);
    media.removeEventListener('change', handleSystemThemeChange);
  };
}
