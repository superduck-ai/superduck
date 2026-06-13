import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { ReconnectScheduler } from './ReconnectScheduler';

describe('ReconnectScheduler', () => {
  let calls: number;
  let scheduler: ReconnectScheduler;

  beforeEach(() => {
    calls = 0;
    scheduler = new ReconnectScheduler([30, 50, 80], () => {
      calls++;
    });
  });

  afterEach(() => {
    scheduler.cancel();
  });

  test('schedule() fires after the first delay', async () => {
    scheduler.schedule();
    expect(calls).toBe(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(1);
  });

  test('schedule() does not fire before the delay', async () => {
    scheduler.schedule();
    await new Promise((r) => setTimeout(r, 15));
    expect(calls).toBe(0);
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toBe(1);
  });

  test('schedule() is idempotent (double call does not double-fire)', async () => {
    scheduler.schedule();
    scheduler.schedule(); // should be no-op
    await new Promise((r) => setTimeout(r, 50));
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
    // Schedule has 3 delays: 30, 50, 80
    // Fire through all 3
    for (let i = 0; i < 3; i++) {
      scheduler.schedule();
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(calls).toBe(3);

    // 4th schedule should still fire (using last delay: 80ms)
    scheduler.schedule();
    expect(scheduler.isPending).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toBe(4);

    // 5th should also fire
    scheduler.schedule();
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toBe(5);
  });

  test('disable() prevents schedule() from firing', async () => {
    scheduler.disable();
    scheduler.schedule();
    expect(scheduler.isPending).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(0);
  });

  test('disable() cancels any pending timer', async () => {
    scheduler.schedule();
    expect(scheduler.isPending).toBe(true);

    scheduler.disable();
    expect(scheduler.isPending).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(0);
  });

  test('enable() re-enables scheduling after disable()', async () => {
    scheduler.disable();
    scheduler.schedule();
    expect(calls).toBe(0);

    scheduler.enable();
    scheduler.schedule();
    await new Promise((r) => setTimeout(r, 50));
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
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(1); // reconnect fired after 30ms

    // Reconnect succeeded → reset
    scheduler.reset();
    expect(scheduler.currentAttempt).toBe(0);

    // Second disconnect → schedule reconnect from delay[0] again
    scheduler.schedule();
    expect(scheduler.currentAttempt).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(2);

    // User explicitly disconnects
    scheduler.disable();
    scheduler.schedule(); // should be no-op
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toBe(2); // no new reconnect
  });
});
