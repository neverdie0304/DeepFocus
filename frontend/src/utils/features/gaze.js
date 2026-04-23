/**
 * Iris-based gaze estimation.
 *
 * Computes the position of each iris relative to its eye opening,
 * averaged across both eyes, and returns normalised (x, y) coordinates in
 * the approximate range [-1, 1] where 0 indicates the iris centred in the
 * eye. Requires MediaPipe landmarks produced with iris refinement.
 */
import {
  LEFT_IRIS_CENTER,
  L_EYE_INNER,
  L_EYE_OUTER_FOR_GAZE,
  RIGHT_IRIS_CENTER,
  R_EYE_INNER,
  R_EYE_OUTER_FOR_GAZE,
  dist,
} from './landmarks';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Compute normalised gaze direction from iris landmarks.
 *
 * @param {Array} landmarks - Face Mesh landmarks (with iris points at 468/473).
 * @returns {{gazeX:number, gazeY:number}} in [-1, 1]. Falls back to (0, 0) if
 *   iris landmarks are not present.
 */
export function computeGaze(landmarks) {
  const lIris = landmarks[LEFT_IRIS_CENTER];
  const rIris = landmarks[RIGHT_IRIS_CENTER];
  if (!lIris || !rIris) {
    return { gazeX: 0, gazeY: 0 };
  }

  const lInner = landmarks[L_EYE_INNER];
  const lOuter = landmarks[L_EYE_OUTER_FOR_GAZE];
  const rInner = landmarks[R_EYE_INNER];
  const rOuter = landmarks[R_EYE_OUTER_FOR_GAZE];

  const lWidth = dist(lInner, lOuter);
  const rWidth = dist(rInner, rOuter);

  // Horizontal: iris x relative to the midpoint of the corners.
  const lRatioX =
    lWidth > 0 ? (lIris.x - (lOuter.x + lInner.x) / 2) / (lWidth / 2) : 0;
  const rRatioX =
    rWidth > 0 ? (rIris.x - (rOuter.x + rInner.x) / 2) / (rWidth / 2) : 0;
  const gazeX = (lRatioX + rRatioX) / 2;

  // Vertical: iris y relative to eye centre y.
  const lMidY = (lOuter.y + lInner.y) / 2;
  const rMidY = (rOuter.y + rInner.y) / 2;
  const lRatioY = lWidth > 0 ? (lIris.y - lMidY) / (lWidth / 2) : 0;
  const rRatioY = rWidth > 0 ? (rIris.y - rMidY) / (rWidth / 2) : 0;
  const gazeY = (lRatioY + rRatioY) / 2;

  return {
    gazeX: clamp(gazeX, -1, 1),
    gazeY: clamp(gazeY, -1, 1),
  };
}
