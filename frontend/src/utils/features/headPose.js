/**
 * Head pose estimation (yaw, pitch, roll).
 *
 * Two approaches are provided:
 *  1. ``extractEulerAngles`` — reads angles from the 4×4 facial transformation
 *     matrix returned by MediaPipe FaceLandmarker. Preferred when available.
 *  2. ``estimatePoseFromLandmarks`` — a geometric fallback using the nose,
 *     eye, and chin positions. Less accurate but always usable.
 */
import {
  CHIN,
  LEFT_EYE_OUTER,
  NOSE_TIP,
  RIGHT_EYE_OUTER,
  dist,
} from './landmarks';

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Extract yaw/pitch/roll (degrees) from a 4×4 transformation matrix.
 *
 * Assumes WebGL-style column-major layout: ``data[row + col*4]``. Uses ZYX
 * Euler decomposition, which is the standard convention for head pose
 * (pitch = rotation about X, yaw = about Y, roll = about Z).
 *
 * @param {{data: Float32Array}} matrix
 * @returns {{yaw:number, pitch:number, roll:number}}
 */
export function extractEulerAngles(matrix) {
  const m = matrix.data;
  // Column-major indexing: m[row + col*4]
  const r00 = m[0], /* r01 = m[4], r02 = m[8], */
    r10 = m[1], r11 = m[5], r12 = m[9],
    r20 = m[2], r21 = m[6], r22 = m[10];

  const sy = Math.sqrt(r00 * r00 + r10 * r10);
  const singular = sy < 1e-6;

  let pitch;
  let yaw;
  let roll;

  if (!singular) {
    pitch = Math.atan2(r21, r22);
    yaw = Math.atan2(-r20, sy);
    roll = Math.atan2(r10, r00);
  } else {
    pitch = Math.atan2(-r12, r11);
    yaw = Math.atan2(-r20, sy);
    roll = 0;
  }

  return {
    yaw: yaw * RAD_TO_DEG,
    pitch: pitch * RAD_TO_DEG,
    roll: roll * RAD_TO_DEG,
  };
}

/**
 * Fallback geometric pose estimation from landmark positions.
 *
 * Used when ``outputFacialTransformationMatrixes`` is not available on the
 * landmarker result. The result is approximate and should be treated as a
 * coarse indicator only.
 *
 * @param {Array} lm - Face Mesh landmarks.
 * @returns {{yaw:number, pitch:number, roll:number}}
 */
export function estimatePoseFromLandmarks(lm) {
  const nose = lm[NOSE_TIP];
  const chin = lm[CHIN];
  const leftEye = lm[LEFT_EYE_OUTER];
  const rightEye = lm[RIGHT_EYE_OUTER];

  // Face centre (midpoint of eyes).
  const cx = (leftEye.x + rightEye.x) / 2;
  const cy = (leftEye.y + rightEye.y) / 2;

  // Yaw: horizontal offset of nose from face centre.
  const faceWidth = dist(leftEye, rightEye);
  const yaw = faceWidth > 0 ? ((nose.x - cx) / faceWidth) * 90 : 0;

  // Pitch: vertical offset of nose from mid-point between eyes and chin.
  const faceMidY = (cy + chin.y) / 2;
  const faceHeight = Math.abs(chin.y - cy);
  const pitch = faceHeight > 0 ? ((nose.y - faceMidY) / faceHeight) * 90 : 0;

  // Roll: tilt angle between eyes.
  const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * RAD_TO_DEG;

  return { yaw, pitch, roll };
}
