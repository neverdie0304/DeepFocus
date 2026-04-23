/**
 * Focus score computation.
 *
 * Two scorers are provided:
 *
 * 1. ``computeFocusScore`` — a deterministic, rule-based baseline using fixed
 *    penalty weights on four binary signals. This is the fallback scorer,
 *    used whenever the ML model is not loaded.
 *
 * 2. ``computeFocusScoreML`` — delegates to the TensorFlow.js model if
 *    loaded, otherwise derives boolean signals from the continuous feature
 *    vector and calls the rule-based scorer.
 *
 * A helper, ``assembleFeatureVector``, produces the 36-key feature vector
 * sent to the backend and fed to the model.
 */
import {
  PENALTY_FACE_MISSING,
  PENALTY_IDLE,
  PENALTY_IDLE_CAMERA_OFF,
  PENALTY_LOOKING_AWAY,
  PITCH_THRESHOLD_DEG,
  YAW_THRESHOLD_DEG,
} from '../constants';
import { isModelLoaded, predictFocusScore } from '../ml/FocusModel';

/**
 * @typedef {Object} RuleBasedInput
 * @property {boolean} isIdle
 * @property {boolean} isFaceMissing
 * @property {boolean} isLookingAway
 * @property {boolean} cameraEnabled
 */

/**
 * Rule-based focus score in the range [0, 100].
 *
 * Tab-switching is deliberately excluded from the penalty set because
 * switching between work-relevant tabs is a normal part of computer use
 * (see thesis Chapter 3 for the full rationale). Tab counts are retained
 * as ML features only.
 *
 * @param {RuleBasedInput} signals
 * @returns {number}
 */
export function computeFocusScore({ isIdle, isFaceMissing, isLookingAway, cameraEnabled }) {
  if (cameraEnabled) {
    let score = 100;
    if (isFaceMissing) score -= PENALTY_FACE_MISSING;
    if (isLookingAway) score -= PENALTY_LOOKING_AWAY;
    if (isIdle) score -= PENALTY_IDLE;
    return Math.max(0, score);
  }

  let score = 100;
  if (isIdle) score -= PENALTY_IDLE_CAMERA_OFF;
  return Math.max(0, score);
}

/**
 * Assemble the full ML feature vector from the four modality outputs.
 *
 * Result is a flat object whose keys match the backend SessionEvent model
 * field names exactly, so the same payload can be persisted and fed to the
 * model without translation.
 *
 * @param {Object} modalities
 * @param {Object} modalities.faceFeatures - Output of useFaceDetection.
 * @param {Object} modalities.behaviourFeatures - Output of useBehaviourSignals.
 * @param {Object} modalities.contextFeatures - Output of useContextSignals.
 * @param {Object} modalities.temporalFeatures - Output of useTemporalFeatures.
 * @returns {Object} The 36-key feature vector.
 */
export function assembleFeatureVector({
  faceFeatures = {},
  behaviourFeatures = {},
  contextFeatures = {},
  temporalFeatures = {},
} = {}) {
  return {
    // ── Visual (Face Mesh geometry) ──
    head_yaw: faceFeatures.headYaw ?? null,
    head_pitch: faceFeatures.headPitch ?? null,
    head_roll: faceFeatures.headRoll ?? null,
    ear_left: faceFeatures.earLeft ?? null,
    ear_right: faceFeatures.earRight ?? null,
    gaze_x: faceFeatures.gazeX ?? null,
    gaze_y: faceFeatures.gazeY ?? null,
    face_confidence: faceFeatures.faceConfidence ?? null,

    // ── Visual (blendshapes) ──
    brow_down_left: faceFeatures.browDownLeft ?? 0,
    brow_down_right: faceFeatures.browDownRight ?? 0,
    brow_inner_up: faceFeatures.browInnerUp ?? 0,
    eye_squint_left: faceFeatures.eyeSquintLeft ?? 0,
    eye_squint_right: faceFeatures.eyeSquintRight ?? 0,
    eye_wide_left: faceFeatures.eyeWideLeft ?? 0,
    eye_wide_right: faceFeatures.eyeWideRight ?? 0,
    jaw_open: faceFeatures.jawOpen ?? 0,
    mouth_frown_left: faceFeatures.mouthFrownLeft ?? 0,
    mouth_frown_right: faceFeatures.mouthFrownRight ?? 0,
    mouth_smile_left: faceFeatures.mouthSmileLeft ?? 0,
    mouth_smile_right: faceFeatures.mouthSmileRight ?? 0,

    // ── Behavioural ──
    keystroke_rate: behaviourFeatures.keystrokeRate ?? 0,
    mouse_velocity: behaviourFeatures.mouseVelocity ?? 0,
    mouse_distance: behaviourFeatures.mouseDistance ?? 0,
    click_rate: behaviourFeatures.clickRate ?? 0,
    scroll_rate: behaviourFeatures.scrollRate ?? 0,
    idle_duration: behaviourFeatures.idleDuration ?? 0,
    activity_level: behaviourFeatures.activityLevel ?? 0,

    // ── Contextual ──
    tab_switch_count: contextFeatures.tabSwitchCount5min ?? 0,
    window_blur_count: contextFeatures.windowBlurCount5min ?? 0,
    time_since_tab_return: contextFeatures.timeSinceTabReturn ?? 0,
    session_elapsed_ratio: contextFeatures.sessionElapsedRatio ?? 0,

    // ── Temporal ──
    focus_ema_30s: temporalFeatures.focusEma30s ?? 100,
    focus_ema_5min: temporalFeatures.focusEma5min ?? 100,
    focus_trend: temporalFeatures.focusTrend ?? 0,
    distraction_burst_count: temporalFeatures.distractionBurstCount ?? 0,
  };
}

/**
 * ML-based focus score in [0, 100].
 *
 * Tries the loaded TensorFlow.js model first; if unavailable or prediction
 * fails, derives rule-based booleans from the feature vector and delegates
 * to ``computeFocusScore``.
 *
 * @param {Object} featureVector - Output of ``assembleFeatureVector``.
 * @param {Object} [scalerParams] - Z-score normalisation parameters from training.
 * @returns {Promise<number>}
 */
export async function computeFocusScoreML(featureVector, scalerParams = null) {
  if (isModelLoaded()) {
    const mlScore = await predictFocusScore(featureVector, scalerParams);
    if (mlScore !== null) return mlScore;
  }

  // Fallback: derive booleans from continuous features.
  const isFaceMissing =
    featureVector.face_confidence === 0 || featureVector.face_confidence === null;
  const isLookingAway =
    featureVector.head_yaw !== null
    && (Math.abs(featureVector.head_yaw) > YAW_THRESHOLD_DEG
      || Math.abs(featureVector.head_pitch) > PITCH_THRESHOLD_DEG);
  const isIdle = featureVector.idle_duration > 15;
  const cameraEnabled = featureVector.face_confidence !== null;

  return computeFocusScore({ isIdle, isFaceMissing, isLookingAway, cameraEnabled });
}

/**
 * Format a duration in seconds as ``MM:SS`` or ``H:MM:SS``.
 *
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
