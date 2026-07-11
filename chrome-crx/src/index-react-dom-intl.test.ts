import { describe, expect, it } from 'vitest';
import { resolveBrowserLocale } from './index-react-dom-intl';

describe('resolveBrowserLocale', () => {
  it('uses the first supported system locale', () => {
    expect(resolveBrowserLocale(['fr-FR', 'zh-CN', 'en-US'])).toBe('zh-CN');
  });

  it('matches regional variants by language', () => {
    expect(resolveBrowserLocale(['zh-SG'])).toBe('zh-CN');
    expect(resolveBrowserLocale(['en-GB'])).toBe('en-US');
  });

  it('falls back to English when no system locale is supported', () => {
    expect(resolveBrowserLocale(['fr-FR', 'de-DE'])).toBe('en-US');
  });
});
