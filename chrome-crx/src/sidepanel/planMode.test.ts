import { describe, expect, it, vi } from 'vitest';

vi.mock('../mcpRuntime', () => ({
  shouldShowPlanMode: vi.fn(() => false)
}));

import { checkToolAllowed } from './planMode';

describe('checkToolAllowed browser_batch on system pages', () => {
  it('allows navigate-first browser_batch on system pages', () => {
    const result = checkToolAllowed(
      'browser_batch',
      'system',
      'skip_all_permission_checks',
      false,
      {
        actions: [
          { tool: 'navigate', input: { url: 'https://example.com' } },
          { tool: 'read_page', input: { filter: 'interactive' } }
        ]
      }
    );

    expect(result.allowed).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  it('allows Claude-style name aliases for navigate-first browser_batch', () => {
    const result = checkToolAllowed(
      'browser_batch',
      'non-script',
      'skip_all_permission_checks',
      false,
      {
        actions: [
          { name: 'navigate', input: { url: 'https://example.com' } },
          { name: 'read_page', input: { filter: 'interactive' } }
        ]
      }
    );

    expect(result.allowed).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  it('blocks browser_batch on system pages when it does not start with navigate', () => {
    const result = checkToolAllowed(
      'browser_batch',
      'system',
      'skip_all_permission_checks',
      false,
      {
        actions: [
          { tool: 'read_page', input: { filter: 'interactive' } },
          { tool: 'computer', input: { action: 'screenshot' } }
        ]
      }
    );

    expect(result.allowed).toBe(false);
    expect(result.errorMessage).toBe('browser_batch cannot run on system pages.');
    expect(result.suggestedGuidance).toContain('use navigate by itself');
  });
});
