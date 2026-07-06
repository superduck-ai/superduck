import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  initialize: vi.fn(),
  findGroupByTab: vi.fn(),
  createGroup: vi.fn()
}));

// Stub the mcpRuntime module so importing the unit under test does not pull in
// the real tab-lease singletons (which touch chrome.* APIs at import time).
vi.mock('../../../mcpRuntime', () => ({
  tabGroupManager: {
    initialize: fixtures.initialize,
    findGroupByTab: fixtures.findGroupByTab,
    createGroup: fixtures.createGroup
  }
}));

import { deriveSidepanelGroupTitle, ensureSidepanelManagedGroup } from './sidepanelGroupTitle';

beforeEach(() => {
  for (const fn of Object.values(fixtures)) fn.mockReset();
  fixtures.initialize.mockResolvedValue(undefined);
  fixtures.findGroupByTab.mockResolvedValue(null);
  fixtures.createGroup.mockResolvedValue(undefined);
});

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

describe('ensureSidepanelManagedGroup', () => {
  it('does not regroup a tab that already belongs to an unmanaged Chrome group', async () => {
    fixtures.findGroupByTab.mockResolvedValue({
      isUnmanaged: true,
      chromeGroupId: 123
    });

    await ensureSidepanelManagedGroup(42);

    expect(fixtures.initialize).toHaveBeenCalledWith(true);
    expect(fixtures.createGroup).not.toHaveBeenCalled();
  });

  it('creates a managed group only when the tab is ungrouped', async () => {
    await ensureSidepanelManagedGroup(42);

    expect(fixtures.createGroup).toHaveBeenCalledWith(42);
  });
});
