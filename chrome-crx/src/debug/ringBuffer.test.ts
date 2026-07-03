import { describe, it, expect } from 'vitest';
import { RingBuffer } from './ringBuffer';

describe('RingBuffer', () => {
  it('pushes and reads back items under capacity', () => {
    const rb = new RingBuffer<number>(5);
    rb.push(1);
    rb.push(2);
    rb.push(3);
    expect(rb.length).toBe(3);
    expect(rb.isFull).toBe(false);
    expect(rb.toArray()).toEqual([1, 2, 3]);
  });

  it('evicts oldest when over capacity (FIFO)', () => {
    const rb = new RingBuffer<number>(3);
    for (let i = 1; i <= 5; i++) rb.push(i);
    expect(rb.length).toBe(3);
    expect(rb.isFull).toBe(true);
    expect(rb.toArray()).toEqual([3, 4, 5]);
  });

  it('handles exact capacity boundary', () => {
    const rb = new RingBuffer<number>(3);
    rb.push(1);
    rb.push(2);
    rb.push(3);
    expect(rb.length).toBe(3);
    expect(rb.toArray()).toEqual([1, 2, 3]);
    rb.push(4);
    expect(rb.toArray()).toEqual([2, 3, 4]);
  });

  it('tail returns most recent N in order', () => {
    const rb = new RingBuffer<number>(10);
    for (let i = 1; i <= 7; i++) rb.push(i);
    expect(rb.tail(3)).toEqual([5, 6, 7]);
    expect(rb.tail(100)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(rb.tail(0)).toEqual([]);
  });

  it('tail works after wrap-around', () => {
    const rb = new RingBuffer<number>(3);
    for (let i = 1; i <= 6; i++) rb.push(i);
    expect(rb.toArray()).toEqual([4, 5, 6]);
    expect(rb.tail(2)).toEqual([5, 6]);
  });

  it('clear resets the buffer', () => {
    const rb = new RingBuffer<number>(3);
    rb.push(1);
    rb.push(2);
    rb.clear();
    expect(rb.length).toBe(0);
    expect(rb.toArray()).toEqual([]);
    rb.push(99);
    expect(rb.toArray()).toEqual([99]);
  });

  it('rejects capacity < 1', () => {
    expect(() => new RingBuffer<number>(0)).toThrow();
  });

  it('handles single-capacity buffer', () => {
    const rb = new RingBuffer<number>(1);
    rb.push(1);
    rb.push(2);
    expect(rb.toArray()).toEqual([2]);
    expect(rb.length).toBe(1);
  });
});
