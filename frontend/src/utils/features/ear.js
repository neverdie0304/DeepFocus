/**
 * Eye Aspect Ratio (EAR).
 *
 * Soukupová & Čech (2016): EAR = (|p2-p6| + |p3-p5|) / (2·|p1-p4|)
 *
 * Low values indicate closed eyes (potentially drowsy); high values indicate
 * wide-open eyes. Typical open-eye baselines are around 0.25–0.35.
 */
import { dist } from './landmarks';

/**
 * Compute EAR for one eye given its six landmarks.
 *
 * @param {Array<{x:number,y:number,z?:number}>} landmarks - The full 478 Face Mesh array.
 * @param {number[]} indices - Six indices identifying p1..p6 for this eye.
 * @returns {number} EAR in the approximate range [0, 0.5]. Returns 0 if the
 *   horizontal distance is zero (degenerate landmark case).
 */
export function computeEAR(landmarks, indices) {
  const [p1, p2, p3, p4, p5, p6] = indices.map((i) => landmarks[i]);
  const vertical1 = dist(p2, p6);
  const vertical2 = dist(p3, p5);
  const horizontal = dist(p1, p4);
  if (horizontal === 0) return 0;
  return (vertical1 + vertical2) / (2 * horizontal);
}
