import { describe, expect, it, vi } from 'vitest';

// Stub the mcpRuntime module so importing the unit under test does not pull in
// the real tab-lease singletons (which touch chrome.* APIs at import time).
vi.mock('../../../mcpRuntime', () => ({
  tabGroupManager: {}
}));

import { deriveSidepanelGroupTitle } from './sidepanelGroupTitle';

describe('deriveSidepanelGroupTitle', () => {
  it('normalizes whitespace from the user prompt', () => {
    expect(deriveSidepanelGroupTitle('  find   pricing\nplans  ', 'en-US')).toBe(
      'find pricing plans'
    );
  });

  it('uses a localized fallback for image-only prompts', () => {
    expect(deriveSidepanelGroupTitle('', 'zh-CN')).toBe('图片任务');
    expect(deriveSidepanelGroupTitle('', 'en-US')).toBe('Image task');
  });

  it('truncates long prompts', () => {
    const title = deriveSidepanelGroupTitle(
      'research every supplier page and compare pricing across the full checkout flow',
      'en-US'
    );

    expect(title).toBe('research every supplier page and compare pric...');
    expect(title.length).toBeLessThanOrEqual(48);
  });
});
