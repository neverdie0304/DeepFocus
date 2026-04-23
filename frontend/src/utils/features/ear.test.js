import { describe, it, expect } from 'vitest';
import { computeEAR } from './ear';

/**
 * Construct a minimal landmarks array with six test points laid out as a
 * simple rectangle-like eye. Indices used: 0..5 (p1..p6).
 *
 *     p2 --- p3
 *   /           \
 *  p1            p4
 *   \           /
 *     p6 --- p5
 */
function rectEye(width, height) {
  return [
    { x: 0, y: height / 2, z: 0 },               // p1 - left corner
    { x: width * 0.3, y: 0, z: 0 },              // p2 - top left
    { x: width * 0.7, y: 0, z: 0 },              // p3 - top right
    { x: width, y: height / 2, z: 0 },           // p4 - right corner
    { x: width * 0.7, y: height, z: 0 },         // p5 - bottom right
    { x: width * 0.3, y: height, z: 0 },         // p6 - bottom left
  ];
}

describe('computeEAR', () => {
  const indices = [0, 1, 2, 3, 4, 5];

  it('is ~0.5 for a wide-open eye (vertical ~ half of horizontal)', () => {
    const landmarks = rectEye(10, 5);
    const ear = computeEAR(landmarks, indices);
    expect(ear).toBeCloseTo(0.5, 1);
  });

  it('approaches 0 for a closed eye (vertical distance near zero)', () => {
    const landmarks = rectEye(10, 0.01);
    const ear = computeEAR(landmarks, indices);
    expect(ear).toBeLessThan(0.01);
  });

  it('returns 0 when horizontal distance is zero (degenerate)', () => {
    const degenerate = Array.from({ length: 6 }, () => ({ x: 0, y: 0, z: 0 }));
    expect(computeEAR(degenerate, indices)).toBe(0);
  });

  it('is symmetric in eye orientation (left vs right)', () => {
    const left = rectEye(10, 5);
    const right = left.map((p) => ({ ...p, x: -p.x })); // mirror
    const earL = computeEAR(left, indices);
    const earR = computeEAR(right, indices);
    expect(earL).toBeCloseTo(earR, 6);
  });

  it('scales invariantly with size (EAR is a ratio)', () => {
    const small = rectEye(10, 5);
    const big = rectEye(100, 50);
    expect(computeEAR(small, indices)).toBeCloseTo(
      computeEAR(big, indices),
      6,
    );
  });
});
