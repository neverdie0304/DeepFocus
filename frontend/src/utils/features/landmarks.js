/**
 * MediaPipe Face Mesh landmark indices and geometric helpers.
 *
 * Exported as pure functions so they are easy to unit-test and reuse
 * outside the React hook layer.
 */

/* ───────────────────────────────────────────────────
   Landmark indices (MediaPipe Face Mesh 478 points)
   ─────────────────────────────────────────────────── */

// Head-pose reference points (used by the geometric-fallback pose estimator).
export const NOSE_TIP = 1;
export const CHIN = 152;
export const LEFT_EYE_OUTER = 263;
export const RIGHT_EYE_OUTER = 33;

// EAR (Eye Aspect Ratio) — six-point definition per eye.
export const R_EYE = [33, 160, 158, 133, 153, 144];
export const L_EYE = [362, 385, 387, 263, 373, 380];

// Iris centres (available when FaceLandmarker outputs iris).
export const LEFT_IRIS_CENTER = 468;
export const RIGHT_IRIS_CENTER = 473;

// Eye corners for gaze normalisation.
export const L_EYE_INNER = 362;
export const L_EYE_OUTER_FOR_GAZE = 263;
export const R_EYE_INNER = 133;
export const R_EYE_OUTER_FOR_GAZE = 33;

/**
 * Euclidean distance between two landmark points.
 *
 * @param {{x:number,y:number,z?:number}} a
 * @param {{x:number,y:number,z?:number}} b
 * @returns {number}
 */
export function dist(a, b) {
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + dz * dz);
}
