import { afterEach, describe, expect, it, vi } from 'vitest';
import { initExtensionThemeMode, normalizeThemeMode, resolveThemeMode } from './themeMode';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('themeMode', () => {
  it('normalizes unknown stored values to system mode', () => {
    expect(normalizeThemeMode(undefined)).toBe('system');
    expect(normalizeThemeMode('auto')).toBe('system');
    expect(normalizeThemeMode('light')).toBe('light');
    expect(normalizeThemeMode('dark')).toBe('dark');
  });

  it('resolves system mode from the current browser appearance', () => {
    expect(resolveThemeMode('system', false)).toBe('light');
    expect(resolveThemeMode('system', true)).toBe('dark');
  });

  it('keeps explicit and URL-forced modes independent of the system appearance', () => {
    expect(resolveThemeMode('light', true)).toBe('light');
    expect(resolveThemeMode('dark', false)).toBe('dark');
    expect(resolveThemeMode('light', false, 'dark')).toBe('dark');
  });

  it('syncs stored and system mode changes onto an extension surface', async () => {
    let prefersDark = false;
    let mediaListener: (() => void) | undefined;
    let storageListener:
      | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
      | undefined;
    const dataset: Record<string, string> = {};
    const toggle = vi.fn();
    const removeMediaListener = vi.fn();
    const removeStorageListener = vi.fn();

    vi.stubGlobal('document', {
      documentElement: { dataset, classList: { toggle } }
    });
    vi.stubGlobal('window', {
      location: { href: 'chrome-extension://superduck/sidepanel.html' },
      matchMedia: () => ({
        get matches() {
          return prefersDark;
        },
        addEventListener: (_event: string, listener: () => void) => {
          mediaListener = listener;
        },
        removeEventListener: removeMediaListener
      })
    });
    vi.stubGlobal('chrome', {
      storage: {
        local: { get: vi.fn().mockResolvedValue({ themeMode: 'dark' }) },
        onChanged: {
          addListener: (listener: typeof storageListener) => {
            storageListener = listener;
          },
          removeListener: removeStorageListener
        }
      }
    });

    const cleanup = initExtensionThemeMode('superduck');
    await vi.waitFor(() => expect(dataset.mode).toBe('dark'));
    expect(dataset.theme).toBe('superduck');
    expect(toggle).toHaveBeenLastCalledWith('dark', true);

    storageListener?.({ themeMode: { oldValue: 'dark', newValue: 'light' } }, 'local');
    expect(dataset.mode).toBe('light');
    expect(toggle).toHaveBeenLastCalledWith('dark', false);

    storageListener?.({ themeMode: { oldValue: 'light', newValue: 'system' } }, 'local');
    prefersDark = true;
    mediaListener?.();
    expect(dataset.mode).toBe('dark');

    cleanup();
    expect(removeMediaListener).toHaveBeenCalledOnce();
    expect(removeStorageListener).toHaveBeenCalledOnce();
  });
});
