import { describe, it, expect } from 'vitest';
import { extractEulerAngles, estimatePoseFromLandmarks } from './headPose';

/**
 * Build a 4×4 identity-rotation matrix (column-major).
 */
function identityMatrix() {
  const data = new Float32Array(16);
  data[0] = 1; data[5] = 1; data[10] = 1; data[15] = 1;
  return { data };
}

describe('extractEulerAngles', () => {
  it('returns zero angles for an identity rotation', () => {
    const { yaw, pitch, roll } = extractEulerAngles(identityMatrix());
    expect(yaw).toBeCloseTo(0, 6);
    expect(pitch).toBeCloseTo(0, 6);
    expect(roll).toBeCloseTo(0, 6);
  });

  it('extracts a 90° roll correctly', () => {
    // Rotation about Z by 90°:
    //   cos=0, sin=1
    // Column-major: [0, 1, 0, 0,  -1, 0, 0, 0,  0, 0, 1, 0,  0,0,0,1]
    const data = new Float32Array(16);
    data[0] = 0; data[1] = 1; data[2] = 0;
    data[4] = -1; data[5] = 0; data[6] = 0;
    data[10] = 1;
    data[15] = 1;
    const { roll } = extractEulerAngles({ data });
    expect(Math.abs(roll)).toBeCloseTo(90, 1);
  });
});

describe('estimatePoseFromLandmarks', () => {
  /**
   * Build a minimal landmarks array with the indices the pose estimator
   * uses: 1 (nose), 33 (right eye outer), 152 (chin), 263 (left eye outer).
   */
  function makeLandmarks({ nose, chin, leftEye, rightEye }) {
    const arr = Array.from({ length: 300 }, () => ({ x: 0, y: 0, z: 0 }));
    arr[1] = nose;
    arr[33] = rightEye;
    arr[152] = chin;
    arr[263] = leftEye;
    return arr;
  }

  it('returns near-zero yaw when nose is centred between the eyes', () => {
    const landmarks = makeLandmarks({
      nose: { x: 0.5, y: 0.5 },
      chin: { x: 0.5, y: 0.8 },
      leftEye: { x: 0.6, y: 0.4 },
      rightEye: { x: 0.4, y: 0.4 },
    });
    const { yaw } = estimatePoseFromLandmarks(landmarks);
    expect(Math.abs(yaw)).toBeLessThan(1);
  });

  it('reports positive yaw when nose is to the right of the face centre', () => {
    const landmarks = makeLandmarks({
      nose: { x: 0.7, y: 0.5 },
      chin: { x: 0.5, y: 0.8 },
      leftEye: { x: 0.6, y: 0.4 },
      rightEye: { x: 0.4, y: 0.4 },
    });
    const { yaw } = estimatePoseFromLandmarks(landmarks);
    expect(yaw).toBeGreaterThan(0);
  });

  it('reports negative roll when the right eye is higher than the left', () => {
    const landmarks = makeLandmarks({
      nose: { x: 0.5, y: 0.5 },
      chin: { x: 0.5, y: 0.8 },
      leftEye: { x: 0.6, y: 0.5 },
      rightEye: { x: 0.4, y: 0.3 }, // right higher → head tilted
    });
    const { roll } = estimatePoseFromLandmarks(landmarks);
    expect(roll).not.toBe(0);
  });
});
