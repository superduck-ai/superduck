/**
 * Exponential-backoff reconnect scheduler.
 *
 * Calls the provided `onReconnect` callback after a delay from a fixed
 * schedule. Resets on successful reconnect. Stops after exhausting the
 * schedule. Skipped when explicitly disconnected.
 */
export class ReconnectScheduler {
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _attempt = 0;
  private _disabled = false;

  constructor(
    private readonly delays: number[],
    private readonly onReconnect: () => void
  ) {}

  /** Schedule the next reconnect attempt. No-op if disabled or exhausted. */
  schedule(): void {
    if (this._disabled) return;
    if (this._timer) return; // already scheduled
    if (this._attempt >= this.delays.length) return;

    const delay = this.delays[this._attempt];
    this._attempt++;
    this._timer = setTimeout(() => {
      this._timer = null;
      this.onReconnect();
    }, delay);
  }

  /** Cancel any pending reconnect timer. */
  cancel(): void {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /** Reset attempt counter (call after successful reconnect). */
  reset(): void {
    this._attempt = 0;
    this.cancel();
  }

  /** Disable scheduling (call on explicit/user-initiated disconnect). */
  disable(): void {
    this._disabled = true;
    this.cancel();
  }

  /** Re-enable scheduling (call when connect is attempted again). */
  enable(): void {
    this._disabled = false;
  }

  // ─── Test helpers (expose internal state for assertions) ─────────────

  /** Current attempt index (0-based, incremented on each schedule()). */
  get currentAttempt(): number {
    return this._attempt;
  }

  /** Whether a timer is currently pending. */
  get isPending(): boolean {
    return this._timer !== null;
  }

  /** Whether scheduling is disabled. */
  get isDisabled(): boolean {
    return this._disabled;
  }
}
