import { initExtensionThemeMode } from '@/themeMode';

export function initSidepanelThemeMode(): () => void {
  return initExtensionThemeMode('superduck');
}
