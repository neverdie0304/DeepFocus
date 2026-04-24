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
  INPUT_REQUIRED_TASKS,
  PENALTY_FACE_MISSING,
  PENALTY_IDLE,
  PENALTY_IDLE_CAMERA_OFF,
  PENALTY_LOOKING_AWAY,
  PENALTY_PHONE_USE,
  PITCH_THRESHOLD_DEG,
  SAMPLE_INTERVAL_MS,
  YAW_THRESHOLD_DEG,
} from '../constants';
import { isModelLoaded, predictFocusScore } from '../ml/FocusModel';

const SAMPLE_SECONDS = SAMPLE_INTERVAL_MS / 1000;

/**
 * @typedef {Object} RuleBasedInput
 * @property {boolean} isIdle
 * @property {boolean} isFaceMissing
 * @property {boolean} isLookingAway
 * @property {boolean} isPhonePresent
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
export function computeFocusScore({
  isIdle,
  isFaceMissing,
  isLookingAway,
  isPhonePresent,
  cameraEnabled,
}) {
  if (cameraEnabled) {
    let score = 100;
    if (isFaceMissing) score -= PENALTY_FACE_MISSING;
    if (isPhonePresent) score -= PENALTY_PHONE_USE;
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

    // ── Visual (object detection) ──
    phone_confidence: faceFeatures.phoneConfidence ?? 0,

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
  const isPhonePresent = (featureVector.phone_confidence ?? 0) > 0;
  const isIdle = featureVector.idle_duration > 15;
  const cameraEnabled = featureVector.face_confidence !== null;

  return computeFocusScore({
    isIdle,
    isFaceMissing,
    isLookingAway,
    isPhonePresent,
    cameraEnabled,
  });
}

/**
 * Decide whether a system-wide idle observation should count as a
 * distraction for the given task type.
 *
 * Input-required tasks (coding, writing) cannot plausibly be happening
 * when the user has not touched any input device anywhere on the
 * system. Input-optional tasks (reading, video, study, other) can —
 * reading a book, watching a lecture, or thinking with a paper
 * notebook all produce no input yet remain on-task — so the idle
 * signal is suppressed for them to avoid false positives.
 *
 * @param {string} taskType - One of the TASK_TYPES value strings.
 * @param {boolean} systemIdle - Output of ``useIdleDetection``.
 * @returns {boolean}
 */
export function isIdleForTask(taskType, systemIdle) {
  return INPUT_REQUIRED_TASKS.has(taskType) && Boolean(systemIdle);
}

/**
 * Seconds within a session where every distraction flag is false.
 *
 * Counting events (rather than ``duration - sum(time_*)``) avoids
 * double-counting samples where multiple flags fire simultaneously —
 * looking at a phone below the camera typically triggers both
 * ``is_phone_present`` and ``is_looking_away`` in the same event.
 *
 * ``is_idle`` is included because it is already task-type-gated at
 * the sampling layer (see ``isIdleForTask``): for reading / video /
 * study / other sessions it is always false, so the filter has no
 * effect; for coding / writing sessions it correctly excludes
 * zero-input samples.
 *
 * @param {Array} events - SessionEvents from the detail endpoint.
 * @returns {number}
 */
export function computeLockedInSeconds(events) {
  if (!events || events.length === 0) return 0;
  const clean = events.filter((e) => (
    !e.is_face_missing
      && !e.is_looking_away
      && !e.is_phone_present
      && !e.is_idle
  ));
  return clean.length * SAMPLE_SECONDS;
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

/**
 * Human-friendly duration: "1h 23m", "5m 42s", "38s".
 *
 * Used in the session report where numbers read like English sentences
 * rather than clocks — "Locked in for 42m 30s" is easier to parse than
 * "42:30".
 *
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return r > 0 ? `${h}h ${m}m ${r}s` : `${h}h ${m}m`;
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
}
