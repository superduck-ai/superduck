/**
 * Fixed-capacity ring buffer used as the in-memory event store.
 *
 * Service worker / sidepanel keep a small bounded buffer so a runaway render
 * loop or CDP firehose cannot OOM the extension. When debug is disabled the
 * recorder never allocates one of these.
 */

export class RingBuffer<T> {
  private slots: (T | undefined)[];
  private head = 0;
  private count = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    if (capacity < 1) throw new Error('RingBuffer capacity must be >= 1');
    this.capacity = Math.floor(capacity);
    this.slots = new Array<T | undefined>(this.capacity);
  }

  push(item: T): void {
    this.slots[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  get length(): number {
    return this.count;
  }

  get isFull(): boolean {
    return this.count >= this.capacity;
  }

  toArray(): T[] {
    const out: T[] = new Array(this.count);
    if (this.count < this.capacity) {
      for (let i = 0; i < this.count; i++) out[i] = this.slots[i] as T;
    } else {
      for (let i = 0; i < this.capacity; i++) {
        out[i] = this.slots[(this.head + i) % this.capacity] as T;
      }
    }
    return out;
  }

  /** Most-recent N items, newest last. */
  tail(n: number): T[] {
    const total = this.count;
    const take = Math.min(n, total);
    if (take === 0) return [];
    const out: T[] = new Array(take);
    for (let i = 0; i < take; i++) {
      const idx = (this.head - take + i + this.capacity) % this.capacity;
      out[i] = this.slots[idx] as T;
    }
    return out;
  }

  clear(): void {
    this.slots = new Array<T | undefined>(this.capacity);
    this.head = 0;
    this.count = 0;
  }
}
