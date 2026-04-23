import { describe, it, expect } from 'vitest';
import { computeGaze } from './gaze';
import {
  LEFT_IRIS_CENTER,
  L_EYE_INNER,
  L_EYE_OUTER_FOR_GAZE,
  RIGHT_IRIS_CENTER,
  R_EYE_INNER,
  R_EYE_OUTER_FOR_GAZE,
} from './landmarks';

/**
 * Helper: assemble a minimal landmarks array with the four eye-corner
 * indices and the two iris centres needed by ``computeGaze``.
 */
function makeLandmarks({ lIris, rIris, lCorners, rCorners }) {
  const arr = Array.from({ length: 500 }, () => ({ x: 0, y: 0, z: 0 }));
  arr[LEFT_IRIS_CENTER] = lIris;
  arr[RIGHT_IRIS_CENTER] = rIris;
  arr[L_EYE_INNER] = lCorners.inner;
  arr[L_EYE_OUTER_FOR_GAZE] = lCorners.outer;
  arr[R_EYE_INNER] = rCorners.inner;
  arr[R_EYE_OUTER_FOR_GAZE] = rCorners.outer;
  return arr;
}

describe('computeGaze', () => {
  it('returns (0, 0) when iris landmarks are missing', () => {
    const { gazeX, gazeY } = computeGaze([]);
    expect(gazeX).toBe(0);
    expect(gazeY).toBe(0);
  });

  it('returns near-zero gaze when irises sit in the centre of each eye', () => {
    const landmarks = makeLandmarks({
      lIris: { x: 0.5, y: 0.5 },
      rIris: { x: 0.5, y: 0.5 },
      lCorners: { inner: { x: 0.3, y: 0.5 }, outer: { x: 0.7, y: 0.5 } },
      rCorners: { inner: { x: 0.3, y: 0.5 }, outer: { x: 0.7, y: 0.5 } },
    });
    const { gazeX, gazeY } = computeGaze(landmarks);
    expect(Math.abs(gazeX)).toBeLessThan(0.01);
    expect(Math.abs(gazeY)).toBeLessThan(0.01);
  });

  it('reports positive gazeX when irises are displaced toward higher x', () => {
    const landmarks = makeLandmarks({
      lIris: { x: 0.65, y: 0.5 },
      rIris: { x: 0.65, y: 0.5 },
      lCorners: { inner: { x: 0.3, y: 0.5 }, outer: { x: 0.7, y: 0.5 } },
      rCorners: { inner: { x: 0.3, y: 0.5 }, outer: { x: 0.7, y: 0.5 } },
    });
    const { gazeX } = computeGaze(landmarks);
    expect(gazeX).toBeGreaterThan(0);
  });

  it('clamps gazeX into [-1, 1]', () => {
    // Place irises far outside the corners.
    const landmarks = makeLandmarks({
      lIris: { x: 10, y: 0.5 },
      rIris: { x: 10, y: 0.5 },
      lCorners: { inner: { x: 0.3, y: 0.5 }, outer: { x: 0.7, y: 0.5 } },
      rCorners: { inner: { x: 0.3, y: 0.5 }, outer: { x: 0.7, y: 0.5 } },
    });
    const { gazeX } = computeGaze(landmarks);
    expect(gazeX).toBe(1);
  });
});
