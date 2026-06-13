import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReconnectScheduler } from './ReconnectScheduler';

describe('ReconnectScheduler', () => {
  let calls: number;
  let scheduler: ReconnectScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    calls = 0;
    scheduler = new ReconnectScheduler([100, 200, 500], () => {
      calls++;
    });
  });

  afterEach(() => {
    scheduler.cancel();
    vi.useRealTimers();
  });

  test('schedule() fires after the first delay', async () => {
    scheduler.schedule();
    expect(calls).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(1);
  });

  test('schedule() does not fire before the delay', async () => {
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(50);
    expect(calls).toBe(0);
    await vi.advanceTimersByTimeAsync(50);
    expect(calls).toBe(1);
  });

  test('schedule() is idempotent (double call does not double-fire)', async () => {
    scheduler.schedule();
    scheduler.schedule(); // should be no-op
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(1);
  });

  test('attempt counter increments on each schedule()', () => {
    expect(scheduler.currentAttempt).toBe(0);
    scheduler.schedule();
    expect(scheduler.currentAttempt).toBe(1);
    scheduler.cancel();
    scheduler.schedule();
    expect(scheduler.currentAttempt).toBe(2);
  });

  test('reset() clears attempt counter and cancels pending timer', () => {
    scheduler.schedule();
    expect(scheduler.isPending).toBe(true);
    expect(scheduler.currentAttempt).toBe(1);

    scheduler.reset();
    expect(scheduler.isPending).toBe(false);
    expect(scheduler.currentAttempt).toBe(0);
  });

  test('reset() causes schedule() to start from first delay again', async () => {
    scheduler.schedule(); // attempt 0 → uses delay[0]
    scheduler.cancel();
    scheduler.schedule(); // attempt 1 → uses delay[1]
    scheduler.cancel();
    scheduler.reset(); // back to attempt 0
    scheduler.schedule(); // attempt 0 → uses delay[0] again
    expect(scheduler.currentAttempt).toBe(1);
  });

  test('keeps retrying at the last delay after exhausting the schedule', async () => {
    // Schedule has 3 delays: 100, 200, 500
    // Fire through all 3
    for (let i = 0; i < 3; i++) {
      scheduler.schedule();
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(calls).toBe(3);

    // 4th schedule should still fire (using last delay: 500ms)
    scheduler.schedule();
    expect(scheduler.isPending).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toBe(4);

    // 5th should also fire
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toBe(5);
  });

  test('disable() prevents schedule() from firing', async () => {
    scheduler.disable();
    scheduler.schedule();
    expect(scheduler.isPending).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(calls).toBe(0);
  });

  test('disable() cancels any pending timer', async () => {
    scheduler.schedule();
    expect(scheduler.isPending).toBe(true);

    scheduler.disable();
    expect(scheduler.isPending).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(calls).toBe(0);
  });

  test('enable() re-enables scheduling after disable()', async () => {
    scheduler.disable();
    scheduler.schedule();
    expect(calls).toBe(0);

    scheduler.enable();
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(1);
  });

  test('cancel() does not reset attempt counter', () => {
    scheduler.schedule();
    expect(scheduler.currentAttempt).toBe(1);

    scheduler.cancel();
    expect(scheduler.currentAttempt).toBe(1); // not reset
    expect(scheduler.isPending).toBe(false);
  });

  test('full lifecycle: connect → disconnect → reconnect → disconnect → reconnect', async () => {
    // First disconnect → schedule reconnect
    scheduler.schedule();
    expect(scheduler.currentAttempt).toBe(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(1); // reconnect fired after 100ms

    // Reconnect succeeded → reset
    scheduler.reset();
    expect(scheduler.currentAttempt).toBe(0);

    // Second disconnect → schedule reconnect from delay[0] again
    scheduler.schedule();
    expect(scheduler.currentAttempt).toBe(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(2);

    // User explicitly disconnects
    scheduler.disable();
    scheduler.schedule(); // should be no-op
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toBe(2); // no new reconnect
  });
});
