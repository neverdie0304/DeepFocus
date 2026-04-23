/**
 * Fixed-size ring buffer for sliding-window aggregation.
 *
 * Used by ``useBehaviourSignals`` to accumulate per-sample counts over a
 * rolling window without allocating new arrays on every push.
 */

/**
 * Create a new ring buffer.
 *
 * @param {number} size - Maximum number of samples retained.
 * @returns {{data: Float64Array, idx: number, count: number}}
 */
export function createRingBuffer(size) {
  return { data: new Float64Array(size), idx: 0, count: 0 };
}

/** Append a value, overwriting the oldest sample once full. */
export function pushRing(buf, value) {
  buf.data[buf.idx] = value;
  buf.idx = (buf.idx + 1) % buf.data.length;
  if (buf.count < buf.data.length) buf.count += 1;
}

/** Sum of retained values. */
export function sumRing(buf) {
  let s = 0;
  for (let i = 0; i < buf.count; i += 1) s += buf.data[i];
  return s;
}

/** Mean of retained values (0 if empty). */
export function meanRing(buf) {
  return buf.count > 0 ? sumRing(buf) / buf.count : 0;
}
