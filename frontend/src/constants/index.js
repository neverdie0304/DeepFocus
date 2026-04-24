/**
 * Central location for constants shared across the frontend.
 *
 * Grouped by responsibility:
 *   - sampling:   timing of the main event loop
 *   - vision:     face detection / Face Mesh parameters
 *   - scoring:    rule-based penalty weights
 *   - esm:        Experience Sampling Method popup behaviour
 *   - windows:    sliding-window sizes for feature aggregation
 */

// ── Session sampling ──
export const SAMPLE_INTERVAL_MS = 2000;   // Main event loop: every 2s
export const PERIODIC_UPLOAD_INTERVAL_MS = 30_000;  // Flush buffered events every 30s

// ── Vision (MediaPipe Face Mesh) ──
export const VISION_FPS = 10;
export const FRAME_INTERVAL_MS = 1000 / VISION_FPS;
export const YAW_THRESHOLD_DEG = 25;      // Beyond this, treat as "looking away"
// Pitch is split into two thresholds because looking up and looking down
// carry different meanings. Looking up past ~20° almost always indicates
// attention is off the screen (checking the ceiling, window, or someone
// entering the room). Looking down past 20°, however, is consistent with
// legitimate work in several common task types — reading a book, taking
// notes on paper, solving problems on a pad — so a symmetric threshold
// generated a lot of false-positive looking-away time during those
// sessions. DOWN_TOLERANT_TASKS below controls when pitch-down is
// suppressed; pitch-up is always checked.
//
// Sign convention (verified empirically via SessionPage's pitch readout):
// positive pitch = looking up, negative pitch = looking down.
export const PITCH_UP_THRESHOLD_DEG = 20;
// Retained for the ML-fallback scorer only (scoring.js::computeFocusScoreML),
// which cannot access the task type. A symmetric threshold there is the
// safer default.
export const PITCH_THRESHOLD_DEG = 20;
export const CAMERA_WIDTH = 320;
export const CAMERA_HEIGHT = 240;

// ── Behavioural window (sliding 30s) ──
export const BEHAVIOUR_WINDOW_SECONDS = 30;

// ── Contextual window (sliding 5min) ──
export const CONTEXT_WINDOW_SECONDS = 5 * 60;

// ── Temporal (EMAs + burst detection) ──
export const EMA_30S_WINDOW = 30;
export const EMA_5MIN_WINDOW = 5 * 60;
export const DISTRACTION_THRESHOLD = 50;
export const MIN_BURST_LENGTH = 3;         // 3 samples × 2s = 6s

// ── Rule-based scoring penalties (camera on) ──
export const PENALTY_FACE_MISSING = 50;
export const PENALTY_PHONE_USE = 45;
export const PENALTY_LOOKING_AWAY = 35;
export const PENALTY_IDLE = 15;

// ── Object detection (MediaPipe EfficientDet-Lite0) ──
// COCO "cell phone" class. Score threshold chosen conservatively: the
// model is biased toward high-recall detection on the COCO validation
// set, so 0.4 suppresses the most common false positives (book spines,
// dark rectangular objects) without losing obvious phones.
export const PHONE_SCORE_THRESHOLD = 0.4;
export const PHONE_CLASS_NAME = 'cell phone';

// ── Rule-based scoring penalties (camera off) ──
export const PENALTY_IDLE_CAMERA_OFF = 100;

// ── ESM popup ──
export const ESM_MIN_INTERVAL_MS = 3 * 60 * 1000;     // 3 minutes
export const ESM_MAX_INTERVAL_MS = 8 * 60 * 1000;     // 8 minutes
export const ESM_AUTO_DISMISS_MS = 10_000;

// ── Task types offered to the user ──
export const TASK_TYPES = [
  { value: 'writing', label: 'Writing', icon: '📝' },
  { value: 'coding', label: 'Coding', icon: '💻' },
  { value: 'reading', label: 'Reading', icon: '📚' },
  { value: 'video', label: 'Video', icon: '🎥' },
  { value: 'study', label: 'Study', icon: '✏️' },
  { value: 'other', label: 'Other', icon: '🗂️' },
];

// ── Task types that require continuous keyboard/mouse input to count
//    as "working". For these, the Idle Detection API's system-wide
//    idle signal is treated as a distraction (the user is definitely
//    not typing if the OS reports no input anywhere). Reading, video,
//    and study sessions are *not* in this set because they legitimately
//    lack input activity (reading a book, watching a lecture, thinking).
export const INPUT_REQUIRED_TASKS = new Set(['coding', 'writing']);

// ── Task types during which looking down (writing in a notebook,
//    reading a book, working through a problem on paper) is expected
//    and should not count as "looking away." Looking up and sideways
//    still do, regardless of task type.
export const DOWN_TOLERANT_TASKS = new Set(['study', 'reading', 'writing']);

// ── MediaPipe model CDN ──
export const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-assets/face_landmarker_v2_with_blendshapes.task';
export const OBJECT_DETECTOR_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';
export const MEDIAPIPE_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

// ── TF.js model URLs (served from frontend/public/models/) ──
export const FOCUS_MODEL_URL = '/models/focus_model/model.json';
export const FOCUS_MODEL_META_URL = '/models/focus_model/model_meta.json';
export const TFJS_CDN_URL =
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
