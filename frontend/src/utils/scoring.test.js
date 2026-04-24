import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../ml/FocusModel', () => ({
  isModelLoaded: vi.fn(() => false),
  predictFocusScore: vi.fn(async () => null),
  loadModel: vi.fn(async () => false),
}));

import {
  assembleFeatureVector,
  computeFocusScore,
  computeFocusScoreML,
  computeLockedInSeconds,
  formatDuration,
  formatTime,
  isIdleForTask,
} from './scoring';
import { isModelLoaded, predictFocusScore } from '../ml/FocusModel';

describe('computeFocusScore (rule-based)', () => {
  describe('camera enabled', () => {
    it('returns 100 when all signals are normal', () => {
      const score = computeFocusScore({
        isIdle: false, isFaceMissing: false, isLookingAway: false, cameraEnabled: true,
      });
      expect(score).toBe(100);
    });

    it('subtracts 50 for missing face', () => {
      const score = computeFocusScore({
        isIdle: false, isFaceMissing: true, isLookingAway: false, cameraEnabled: true,
      });
      expect(score).toBe(50);
    });

    it('subtracts 35 for looking away', () => {
      const score = computeFocusScore({
        isIdle: false, isFaceMissing: false, isLookingAway: true, cameraEnabled: true,
      });
      expect(score).toBe(65);
    });

    it('subtracts 45 for phone present', () => {
      const score = computeFocusScore({
        isIdle: false, isFaceMissing: false, isLookingAway: false,
        isPhonePresent: true, cameraEnabled: true,
      });
      expect(score).toBe(55);
    });

    it('subtracts 15 for idle', () => {
      const score = computeFocusScore({
        isIdle: true, isFaceMissing: false, isLookingAway: false, cameraEnabled: true,
      });
      expect(score).toBe(85);
    });

    it('stacks all penalties and clamps at zero', () => {
      const score = computeFocusScore({
        isIdle: true, isFaceMissing: true, isLookingAway: true,
        isPhonePresent: true, cameraEnabled: true,
      });
      // 100 - 50 - 45 - 35 - 15 = -45 → clamp to 0
      expect(score).toBe(0);
    });

    it('clamps at zero (cannot go negative)', () => {
      const score = computeFocusScore({
        isIdle: true, isFaceMissing: true, isLookingAway: true,
        isPhonePresent: true, cameraEnabled: true,
      });
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('camera disabled', () => {
    it('returns 100 when not idle', () => {
      const score = computeFocusScore({
        isIdle: false, isFaceMissing: false, isLookingAway: false, cameraEnabled: false,
      });
      expect(score).toBe(100);
    });

    it('drops to 0 when idle', () => {
      const score = computeFocusScore({
        isIdle: true, isFaceMissing: false, isLookingAway: false, cameraEnabled: false,
      });
      expect(score).toBe(0);
    });

    it('ignores visual signals when camera disabled', () => {
      const score = computeFocusScore({
        isIdle: false, isFaceMissing: true, isLookingAway: true,
        isPhonePresent: true, cameraEnabled: false,
      });
      expect(score).toBe(100);
    });
  });

  describe('tab switching not penalised', () => {
    it('does not include tab hidden as a parameter that affects score', () => {
      // Design decision: tab switching is not a rule-based penalty.
      const score = computeFocusScore({
        isIdle: false, isFaceMissing: false, isLookingAway: false, cameraEnabled: true,
      });
      expect(score).toBe(100);
    });
  });
});

describe('assembleFeatureVector', () => {
  it('returns all 36 named feature keys', () => {
    const vector = assembleFeatureVector({});
    const expectedKeys = [
      'head_yaw', 'head_pitch', 'head_roll',
      'ear_left', 'ear_right', 'gaze_x', 'gaze_y', 'face_confidence',
      'phone_confidence',
      'brow_down_left', 'brow_down_right', 'brow_inner_up',
      'eye_squint_left', 'eye_squint_right', 'eye_wide_left', 'eye_wide_right',
      'jaw_open', 'mouth_frown_left', 'mouth_frown_right',
      'mouth_smile_left', 'mouth_smile_right',
      'keystroke_rate', 'mouse_velocity', 'mouse_distance',
      'click_rate', 'scroll_rate', 'idle_duration', 'activity_level',
      'tab_switch_count', 'window_blur_count',
      'time_since_tab_return', 'session_elapsed_ratio',
      'focus_ema_30s', 'focus_ema_5min', 'focus_trend', 'distraction_burst_count',
    ];
    for (const key of expectedKeys) {
      expect(vector).toHaveProperty(key);
    }
  });

  it('maps phone_confidence from faceFeatures', () => {
    const vector = assembleFeatureVector({
      faceFeatures: { phoneConfidence: 0.72 },
    });
    expect(vector.phone_confidence).toBe(0.72);
  });

  it('defaults phone_confidence to 0 when not provided', () => {
    const vector = assembleFeatureVector({});
    expect(vector.phone_confidence).toBe(0);
  });

  it('does not include camera_enabled in the output', () => {
    const vector = assembleFeatureVector({ cameraEnabled: true });
    expect(vector).not.toHaveProperty('camera_enabled');
  });

  it('maps face features with correct snake_case names', () => {
    const vector = assembleFeatureVector({
      faceFeatures: {
        headYaw: 5.5,
        headPitch: -3.2,
        headRoll: 1.0,
        earLeft: 0.28,
        earRight: 0.30,
        gazeX: 0.1,
        gazeY: -0.05,
        faceConfidence: 1.0,
      },
    });
    expect(vector.head_yaw).toBe(5.5);
    expect(vector.head_pitch).toBe(-3.2);
    expect(vector.head_roll).toBe(1.0);
    expect(vector.ear_left).toBeCloseTo(0.28);
    expect(vector.gaze_x).toBeCloseTo(0.1);
    expect(vector.face_confidence).toBe(1.0);
  });

  it('maps blendshapes', () => {
    const vector = assembleFeatureVector({
      faceFeatures: {
        browDownLeft: 0.15,
        mouthSmileRight: 0.4,
        jawOpen: 0.02,
      },
    });
    expect(vector.brow_down_left).toBe(0.15);
    expect(vector.mouth_smile_right).toBe(0.4);
    expect(vector.jaw_open).toBe(0.02);
  });

  it('defaults visual features to null when face not detected', () => {
    const vector = assembleFeatureVector({ faceFeatures: {} });
    expect(vector.head_yaw).toBeNull();
    expect(vector.face_confidence).toBeNull();
  });

  it('defaults blendshapes to 0 when not provided', () => {
    const vector = assembleFeatureVector({ faceFeatures: {} });
    expect(vector.brow_down_left).toBe(0);
    expect(vector.mouth_smile_left).toBe(0);
  });

  it('maps behavioural features', () => {
    const vector = assembleFeatureVector({
      behaviourFeatures: {
        keystrokeRate: 2.5,
        mouseVelocity: 150.0,
        clickRate: 0.3,
        idleDuration: 5.2,
      },
    });
    expect(vector.keystroke_rate).toBe(2.5);
    expect(vector.mouse_velocity).toBe(150.0);
    expect(vector.click_rate).toBe(0.3);
    expect(vector.idle_duration).toBe(5.2);
  });

  it('maps contextual features', () => {
    const vector = assembleFeatureVector({
      contextFeatures: {
        tabSwitchCount5min: 3,
        windowBlurCount5min: 1,
        timeSinceTabReturn: 12.5,
        sessionElapsedRatio: 0.25,
      },
    });
    expect(vector.tab_switch_count).toBe(3);
    expect(vector.window_blur_count).toBe(1);
    expect(vector.time_since_tab_return).toBe(12.5);
    expect(vector.session_elapsed_ratio).toBe(0.25);
  });

  it('maps temporal features', () => {
    const vector = assembleFeatureVector({
      temporalFeatures: {
        focusEma30s: 85.2,
        focusEma5min: 82.0,
        focusTrend: -0.5,
        distractionBurstCount: 2,
      },
    });
    expect(vector.focus_ema_30s).toBe(85.2);
    expect(vector.focus_ema_5min).toBe(82.0);
    expect(vector.focus_trend).toBe(-0.5);
    expect(vector.distraction_burst_count).toBe(2);
  });

  it('defaults temporal EMAs to 100 when unspecified (neutral start)', () => {
    const vector = assembleFeatureVector({});
    expect(vector.focus_ema_30s).toBe(100);
    expect(vector.focus_ema_5min).toBe(100);
  });
});

describe('computeFocusScoreML (fallback behaviour)', () => {
  beforeEach(() => {
    vi.mocked(isModelLoaded).mockReturnValue(false);
    vi.mocked(predictFocusScore).mockResolvedValue(null);
  });

  it('falls back to rule-based when model not loaded', async () => {
    const vector = assembleFeatureVector({
      faceFeatures: { faceConfidence: 1.0, headYaw: 0, headPitch: 0 },
      behaviourFeatures: { idleDuration: 2 },
    });
    const score = await computeFocusScoreML(vector);
    expect(score).toBe(100); // all normal
  });

  it('applies face_missing penalty via fallback when face_confidence is 0', async () => {
    const vector = assembleFeatureVector({
      faceFeatures: { faceConfidence: 0 },
      behaviourFeatures: { idleDuration: 2 },
    });
    const score = await computeFocusScoreML(vector);
    // cameraEnabled is derived from face_confidence !== null, which is true here (0 !== null)
    // and face_missing is true since face_confidence === 0
    expect(score).toBe(50);
  });

  it('applies looking_away penalty when head_yaw exceeds threshold', async () => {
    const vector = assembleFeatureVector({
      faceFeatures: { faceConfidence: 1.0, headYaw: 30, headPitch: 0 },
      behaviourFeatures: { idleDuration: 2 },
    });
    const score = await computeFocusScoreML(vector);
    expect(score).toBe(65); // 100 - 35
  });

  it('applies idle penalty when idle_duration exceeds 15 seconds', async () => {
    const vector = assembleFeatureVector({
      faceFeatures: { faceConfidence: 1.0, headYaw: 0, headPitch: 0 },
      behaviourFeatures: { idleDuration: 20 },
    });
    const score = await computeFocusScoreML(vector);
    expect(score).toBe(85); // 100 - 15
  });

  it('uses ML model prediction when available', async () => {
    vi.mocked(isModelLoaded).mockReturnValue(true);
    vi.mocked(predictFocusScore).mockResolvedValue(42.0);

    const vector = assembleFeatureVector({});
    const score = await computeFocusScoreML(vector);
    expect(score).toBe(42.0);
  });

  it('falls back if ML model returns null', async () => {
    vi.mocked(isModelLoaded).mockReturnValue(true);
    vi.mocked(predictFocusScore).mockResolvedValue(null);

    const vector = assembleFeatureVector({
      faceFeatures: { faceConfidence: 1.0, headYaw: 0, headPitch: 0 },
      behaviourFeatures: { idleDuration: 0 },
    });
    const score = await computeFocusScoreML(vector);
    expect(score).toBe(100);
  });
});

describe('formatTime', () => {
  it('formats zero seconds', () => {
    expect(formatTime(0)).toBe('00:00');
  });

  it('formats seconds under a minute', () => {
    expect(formatTime(45)).toBe('00:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatTime(125)).toBe('02:05');
  });

  it('formats exactly one hour', () => {
    expect(formatTime(3600)).toBe('1:00:00');
  });

  it('formats hours, minutes, seconds', () => {
    expect(formatTime(3725)).toBe('1:02:05');
  });

  it('pads single-digit minutes and seconds with zero', () => {
    expect(formatTime(3665)).toBe('1:01:05');
  });
});

describe('formatDuration', () => {
  it('formats zero as 0s', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('formats seconds under a minute', () => {
    expect(formatDuration(38)).toBe('38s');
  });

  it('drops seconds when they round to zero', () => {
    expect(formatDuration(120)).toBe('2m');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(342)).toBe('5m 42s');
  });

  it('formats whole hours', () => {
    expect(formatDuration(3600)).toBe('1h 0m');
  });

  it('formats hours with minutes and seconds', () => {
    expect(formatDuration(4925)).toBe('1h 22m 5s');
  });

  it('rounds fractional seconds', () => {
    expect(formatDuration(45.7)).toBe('46s');
  });

  it('clamps negative input to zero', () => {
    expect(formatDuration(-5)).toBe('0s');
  });
});

describe('isIdleForTask', () => {
  describe('input-required tasks (coding, writing)', () => {
    it('propagates a true system-idle signal for coding', () => {
      expect(isIdleForTask('coding', true)).toBe(true);
    });

    it('propagates a true system-idle signal for writing', () => {
      expect(isIdleForTask('writing', true)).toBe(true);
    });

    it('returns false when system is active', () => {
      expect(isIdleForTask('coding', false)).toBe(false);
      expect(isIdleForTask('writing', false)).toBe(false);
    });
  });

  describe('input-optional tasks', () => {
    it('suppresses idle for reading regardless of system state', () => {
      expect(isIdleForTask('reading', true)).toBe(false);
      expect(isIdleForTask('reading', false)).toBe(false);
    });

    it('suppresses idle for video (passive watching)', () => {
      expect(isIdleForTask('video', true)).toBe(false);
    });

    it('suppresses idle for study (may be using paper notebook)', () => {
      expect(isIdleForTask('study', true)).toBe(false);
    });

    it('suppresses idle for other (ambiguous task type)', () => {
      expect(isIdleForTask('other', true)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns false for unknown task types', () => {
      expect(isIdleForTask('unknown', true)).toBe(false);
    });

    it('coerces truthy / falsy system-idle to boolean', () => {
      expect(isIdleForTask('coding', null)).toBe(false);
      expect(isIdleForTask('coding', undefined)).toBe(false);
      expect(isIdleForTask('coding', 1)).toBe(true);
    });
  });
});

describe('computeLockedInSeconds', () => {
  const makeEvent = (flags = {}) => ({
    is_face_missing: false,
    is_looking_away: false,
    is_phone_present: false,
    is_idle: false,
    ...flags,
  });

  it('returns 0 for an empty event list', () => {
    expect(computeLockedInSeconds([])).toBe(0);
  });

  it('returns 0 for null or undefined events', () => {
    expect(computeLockedInSeconds(null)).toBe(0);
    expect(computeLockedInSeconds(undefined)).toBe(0);
  });

  it('counts every event as 2 seconds when no flags are set', () => {
    const events = [makeEvent(), makeEvent(), makeEvent()];
    expect(computeLockedInSeconds(events)).toBe(6);
  });

  it('excludes samples where face is missing', () => {
    const events = [
      makeEvent(),
      makeEvent({ is_face_missing: true }),
      makeEvent(),
    ];
    expect(computeLockedInSeconds(events)).toBe(4);
  });

  it('excludes samples where user is looking away', () => {
    const events = [
      makeEvent({ is_looking_away: true }),
      makeEvent(),
    ];
    expect(computeLockedInSeconds(events)).toBe(2);
  });

  it('excludes samples where phone is present', () => {
    const events = [
      makeEvent(),
      makeEvent({ is_phone_present: true }),
    ];
    expect(computeLockedInSeconds(events)).toBe(2);
  });

  it('excludes samples where system is idle (already task-gated upstream)', () => {
    const events = [
      makeEvent({ is_idle: true }),
      makeEvent(),
      makeEvent({ is_idle: true }),
    ];
    expect(computeLockedInSeconds(events)).toBe(2);
  });

  it('does not double-count events with multiple distraction flags', () => {
    // A single event that trips both phone + looking_away should be
    // excluded exactly once, not twice (would go negative otherwise).
    const events = [
      makeEvent({ is_phone_present: true, is_looking_away: true }),
      makeEvent(),
    ];
    expect(computeLockedInSeconds(events)).toBe(2);
  });

  it('ignores flags absent from the event object (treated as false)', () => {
    // Older events predate the phone/idle fields; they must still
    // count as Locked In when the webcam flags are clean.
    const events = [
      { is_face_missing: false, is_looking_away: false },
      { is_face_missing: false, is_looking_away: false },
    ];
    expect(computeLockedInSeconds(events)).toBe(4);
  });
});
