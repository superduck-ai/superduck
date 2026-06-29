import { describe, it, expect } from 'vitest';

import { extractAppName, formatTabsOutput, normalizeUrl } from './urlUtils';

describe('normalizeUrl', () => {
  it('keeps http URLs unchanged', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('keeps https URLs unchanged', () => {
    expect(normalizeUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
  });

  it('prefixes bare hostnames with https://', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
    expect(normalizeUrl('foo.bar/baz')).toBe('https://foo.bar/baz');
  });
});

describe('extractAppName', () => {
  it('returns the second-level domain for normal hosts', () => {
    expect(extractAppName('https://www.google.com/search')).toBe('google');
    expect(extractAppName('https://app.example.co/path')).toBe('example');
  });

  it('returns the hostname when it has fewer than two parts', () => {
    expect(extractAppName('http://localhost:3000')).toBe('localhost');
  });

  it('returns undefined for invalid URLs', () => {
    expect(extractAppName('not a url')).toBeUndefined();
  });
});

describe('formatTabsOutput', () => {
  it('returns a placeholder when no tabs are provided', () => {
    expect(formatTabsOutput([])).toBe('No tabs available.');
    expect(formatTabsOutput(null)).toBe('No tabs available.');
  });

  it('formats a list of tabs and marks the active one', () => {
    const tabs = [
      { id: 1, title: 'A', url: 'https://a.com' },
      { id: 2, title: 'B', url: 'https://b.com' }
    ];
    const out = formatTabsOutput(tabs, 42, 2);
    expect(out).toContain('Tab Group 42:');
    expect(out).toContain('- tabId 1: "A" (https://a.com)');
    expect(out).toContain('- tabId 2: "B" (https://b.com) (active)');
  });

  it('falls back to "unknown" group when none is supplied', () => {
    const out = formatTabsOutput([{ id: 1, title: 'x', url: 'https://x' }]);
    expect(out.startsWith('Tab Group unknown:')).toBe(true);
  });
});
