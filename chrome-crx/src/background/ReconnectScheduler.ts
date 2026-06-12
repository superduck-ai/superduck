/**
 * Exponential-backoff reconnect scheduler.
 *
 * Calls the provided `onReconnect` callback after a delay from a fixed
 * schedule. Resets on successful reconnect. Stops after exhausting the
 * schedule. Skipped when explicitly disconnected.
 */
export class ReconnectScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private disabled = false;

  constructor(
    private readonly delays: number[],
    private readonly onReconnect: () => void
  ) {}

  /** Schedule the next reconnect attempt. No-op if disabled or exhausted. */
  schedule(): void {
    if (this.disabled) return;
    if (this.timer) return; // already scheduled
    if (this.attempt >= this.delays.length) return;

    const delay = this.delays[this.attempt];
    this.attempt++;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.onReconnect();
    }, delay);
  }

  /** Cancel any pending reconnect and reset the attempt counter. */
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Reset attempt counter (call after successful reconnect). */
  reset(): void {
    this.attempt = 0;
    this.cancel();
  }

  /** Disable scheduling (call on explicit/user-initiated disconnect). */
  disable(): void {
    this.disabled = true;
    this.cancel();
  }

  /** Re-enable scheduling (call when connect is attempted again). */
  enable(): void {
    this.disabled = false;
  }

  // ─── Test helpers (expose internal state for assertions) ─────────────

  /** Current attempt index (0-based, incremented on each schedule()). */
  get currentAttempt(): number {
    return this.attempt;
  }

  /** Whether a timer is currently pending. */
  get isPending(): boolean {
    return this.timer !== null;
  }

  /** Whether scheduling is disabled. */
  get isDisabled(): boolean {
    return this.disabled;
  }
}
