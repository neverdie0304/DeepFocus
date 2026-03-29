/* ═══════════════════════════════════════════════════
   scoring.js
   Focus score computation — rule-based baseline
   + ML feature vector assembly for future model
   ═══════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────────
   Rule-based scoring (original, kept as fallback)
   ─────────────────────────────────────────────────── */
export function computeFocusScore({ isIdle, isFaceMissing, isLookingAway, cameraEnabled }) {
  // Tab switching removed from penalty: it is a normal part of computer work,
  // not a reliable distraction signal. Retained as ML feature only.
  if (cameraEnabled) {
    let score = 100;
    if (isFaceMissing) score -= 50;
    if (isLookingAway) score -= 35;
    if (isIdle) score -= 15;
    return Math.max(0, score);
  } else {
    let score = 100;
    if (isIdle) score -= 100;
    return Math.max(0, score);
  }
}

/* ───────────────────────────────────────────────────
   Assemble full ML feature vector from all hooks.
   Returns a flat object with ~25 named features,
   ready for storage and future model inference.
   ─────────────────────────────────────────────────── */
export function assembleFeatureVector({
  faceFeatures = {},
  behaviourFeatures = {},
  contextFeatures = {},
  temporalFeatures = {},
  cameraEnabled = false,
}) {
  return {
    // ── Visual (Face Mesh) ──
    head_yaw: faceFeatures.headYaw ?? null,
    head_pitch: faceFeatures.headPitch ?? null,
    head_roll: faceFeatures.headRoll ?? null,
    ear_left: faceFeatures.earLeft ?? null,
    ear_right: faceFeatures.earRight ?? null,
    gaze_x: faceFeatures.gazeX ?? null,
    gaze_y: faceFeatures.gazeY ?? null,
    face_confidence: faceFeatures.faceConfidence ?? null,

    // ── Behavioral ──
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

/* ───────────────────────────────────────────────────
   ML-based scoring.
   Attempts TF.js model inference; falls back to
   rule-based if model is not loaded.
   ─────────────────────────────────────────────────── */
import { isModelLoaded, predictFocusScore } from '../ml/FocusModel';

export async function computeFocusScoreML(featureVector, scalerParams = null) {
  // Try ML model first
  if (isModelLoaded()) {
    const mlScore = await predictFocusScore(featureVector, scalerParams);
    if (mlScore !== null) return mlScore;
  }

  // Fallback: derive booleans from continuous features
  const isFaceMissing = featureVector.face_confidence === 0 || featureVector.face_confidence === null;
  const isLookingAway =
    featureVector.head_yaw !== null &&
    (Math.abs(featureVector.head_yaw) > 25 || Math.abs(featureVector.head_pitch) > 20);
  const isIdle = featureVector.idle_duration > 15;
  const cameraEnabled = featureVector.face_confidence !== null;

  return computeFocusScore({ isIdle, isFaceMissing, isLookingAway, cameraEnabled });
}

/* ───────────────────────────────────────────────────
   Time formatting utility
   ─────────────────────────────────────────────────── */
export function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
