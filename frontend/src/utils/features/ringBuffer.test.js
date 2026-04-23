import { describe, it, expect } from 'vitest';
import { createRingBuffer, pushRing, sumRing, meanRing } from './ringBuffer';

describe('createRingBuffer', () => {
  it('initialises an empty buffer of the given size', () => {
    const buf = createRingBuffer(5);
    expect(buf.data.length).toBe(5);
    expect(buf.count).toBe(0);
    expect(buf.idx).toBe(0);
  });
});

describe('pushRing', () => {
  it('fills slots in order up to the capacity', () => {
    const buf = createRingBuffer(3);
    pushRing(buf, 1);
    pushRing(buf, 2);
    pushRing(buf, 3);
    expect(Array.from(buf.data)).toEqual([1, 2, 3]);
    expect(buf.count).toBe(3);
  });

  it('overwrites the oldest slot once full (FIFO)', () => {
    const buf = createRingBuffer(3);
    pushRing(buf, 1);
    pushRing(buf, 2);
    pushRing(buf, 3);
    pushRing(buf, 4); // overwrites slot 0
    expect(Array.from(buf.data)).toEqual([4, 2, 3]);
    expect(buf.count).toBe(3); // count saturates at capacity
  });

  it('count does not exceed buffer size', () => {
    const buf = createRingBuffer(2);
    for (let i = 0; i < 10; i += 1) pushRing(buf, i);
    expect(buf.count).toBe(2);
  });
});

describe('sumRing', () => {
  it('returns 0 for an empty buffer', () => {
    expect(sumRing(createRingBuffer(5))).toBe(0);
  });

  it('sums only retained values', () => {
    const buf = createRingBuffer(3);
    pushRing(buf, 10);
    pushRing(buf, 20);
    expect(sumRing(buf)).toBe(30);
  });

  it('handles overwrites correctly', () => {
    const buf = createRingBuffer(3);
    pushRing(buf, 1);
    pushRing(buf, 2);
    pushRing(buf, 3);
    pushRing(buf, 4);
    expect(sumRing(buf)).toBe(4 + 2 + 3);
  });
});

describe('meanRing', () => {
  it('returns 0 for an empty buffer', () => {
    expect(meanRing(createRingBuffer(5))).toBe(0);
  });

  it('returns arithmetic mean of retained values', () => {
    const buf = createRingBuffer(4);
    pushRing(buf, 2);
    pushRing(buf, 4);
    pushRing(buf, 6);
    expect(meanRing(buf)).toBe(4);
  });
});
