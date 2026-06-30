import { describe, expect, it } from 'vitest';
import {
  calculateContextUsageMetrics,
  calculateMessageLimitFromUsage,
  calculateUsageTokens
} from './messageLimits';

describe('messageLimits token accounting', () => {
  it('includes cache tokens in usage totals', () => {
    const usage = {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 20,
      cache_read_input_tokens: 30
    };
    expect(calculateUsageTokens(usage)).toBe(200);
  });

  it('uses the same budget math for debug UI and compaction triggers', () => {
    const usage = {
      input_tokens: 180_000,
      output_tokens: 5_000,
      cache_read_input_tokens: 4_000
    };
    const metrics = calculateContextUsageMetrics(usage, 200_000);
    const limit = calculateMessageLimitFromUsage(usage, 200_000);

    expect(metrics.totalUsed).toBe(189_000);
    expect(metrics.tokenBudget).toBe(190_000);
    expect(metrics.percentUsed).toBe(99);
    expect(limit.type).toBe('exceeded_limit');
    expect(limit.percentUsed).toBe(metrics.percentUsed);
  });
});
