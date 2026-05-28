import { describe, expect, it } from 'vitest';
import { formatLocalDateString, getTodayLocalDateString, parseLocalDateString } from './date';

describe('formatLocalDateString', () => {
  it('uses local calendar components', () => {
    const date = new Date(2024, 2, 15, 23, 59, 59);
    expect(formatLocalDateString(date)).toBe('2024-03-15');
  });

  it('round-trips with parseLocalDateString', () => {
    const original = new Date(2025, 11, 31);
    const str = formatLocalDateString(original);
    expect(parseLocalDateString(str).getTime()).toBe(original.getTime());
  });
});

describe('getTodayLocalDateString', () => {
  it('matches formatLocalDateString of now', () => {
    expect(getTodayLocalDateString()).toBe(formatLocalDateString(new Date()));
  });
});

describe('parseLocalDateString', () => {
  it('does not apply UTC offset for date-only strings', () => {
    const parsed = parseLocalDateString('2024-06-01');
    expect(parsed.getFullYear()).toBe(2024);
    expect(parsed.getMonth()).toBe(5);
    expect(parsed.getDate()).toBe(1);
  });
});
