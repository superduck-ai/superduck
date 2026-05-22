import { describe, expect, it } from 'vitest';

import enUS from '../i18n/en-US.json';
import zhCN from '../i18n/zh-CN.json';

const AGENT_INDICATOR_I18N_KEYS = [
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
  'agent_status_online',
  'agent_take_over_button'
] as const;

const LOCALES = {
  'en-US': enUS,
  'zh-CN': zhCN
} as const;

describe('agent visual indicator i18n keys', () => {
  for (const [locale, messages] of Object.entries(LOCALES)) {
    it(`contains all status keys in ${locale}`, () => {
      for (const key of AGENT_INDICATOR_I18N_KEYS) {
        expect(messages[key]).toBeTruthy();
      }
    });
  }
});
