import { describe, it, expect, vi, beforeEach } from 'vitest';

import { waitForTabLoading } from './tabLifecycle';

describe('waitForTabLoading', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns immediately when tab is not loading', async () => {
    const mockGet = vi.fn().mockResolvedValue({ status: 'complete' });
    vi.stubGlobal('chrome', { tabs: { get: mockGet } });

    await waitForTabLoading(1, 3000);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith(1);
  });

  it('polls until tab stops loading', async () => {
    let callCount = 0;
    const mockGet = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({ status: callCount < 3 ? 'loading' : 'complete' });
    });
    vi.stubGlobal('chrome', { tabs: { get: mockGet } });

    await waitForTabLoading(1, 5000);
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it('returns on chrome.tabs.get error', async () => {
    const mockGet = vi.fn().mockRejectedValue(new Error('tab not found'));
    vi.stubGlobal('chrome', { tabs: { get: mockGet } });

    await waitForTabLoading(999, 3000);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('respects timeout', async () => {
    const mockGet = vi.fn().mockResolvedValue({ status: 'loading' });
    vi.stubGlobal('chrome', { tabs: { get: mockGet } });

    const start = Date.now();
    await waitForTabLoading(1, 300);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(1000);
  });
});
