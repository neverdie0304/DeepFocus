# DeepFocus Implementation Roadmap

> Working document: Each step is read and executed sequentially.
> Created: 2026-03-29

---

## Current State Summary

- **Frontend**: React 19 + Vite, 4 hooks, MediaPipe BlazeFace (bbox only), rule-based scoring
- **Backend**: Django REST + SQLite, 3 models, JWT auth, 8 endpoints
- **Scoring**: Fixed-weight penalty (4 binary signals → 0-100)
- **ML**: None

---

## Step 1: Feature Engineering — Frontend Hooks

### 1-1. Upgrade useFaceDetection.js → MediaPipe Face Mesh

**Current**: BlazeFace → bounding box center → binary lookingAway
**Target**: Face Mesh 468 landmarks → continuous visual features

**Tasks**:
- [ ] Replace FaceDetector with FaceLandmarker (MediaPipe Tasks Vision)
- [ ] Implement PnP-based head pose estimation (yaw, pitch, roll) from 6 key landmarks
- [ ] Implement Eye Aspect Ratio (EAR) from eye landmarks for blink/drowsiness
- [ ] Implement iris-based gaze direction (x, y) from iris landmarks
- [ ] Export face_confidence from detection result
- [ ] Return all features as continuous floats (not booleans)

**Output features**:
```
headYaw        (-90 to +90, degrees)
headPitch      (-90 to +90, degrees)
headRoll       (-90 to +90, degrees)
earLeft        (0.0 to 0.5, ratio)
earRight       (0.0 to 0.5, ratio)
gazeX          (-1.0 to 1.0, normalised)
gazeY          (-1.0 to 1.0, normalised)
faceConfidence (0.0 to 1.0)
facePresent    (boolean, for backward compat)
lookingAway    (boolean, derived from yaw/pitch thresholds, for backward compat)
```

**Key landmarks for PnP** (Face Mesh indices):
- Nose tip: 1
- Chin: 152
- Left eye outer: 263
- Right eye outer: 33
- Left mouth corner: 287
- Right mouth corner: 57

**EAR formula**:
```
EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
```
Eye landmarks (left): 362, 385, 387, 263, 373, 380
Eye landmarks (right): 33, 160, 158, 133, 153, 144

**Iris landmarks** (MediaPipe Face Mesh with iris refinement):
- Left iris center: 468
- Right iris center: 473

### 1-2. Expand useBehaviourSignals.js → Continuous Features

**Current**: binary isIdle, isTabHidden, activityCount (unused in scoring)
**Target**: Rich continuous behavioral features with sliding windows

**Tasks**:
- [ ] Track individual event types separately (keydown count, mousemove count, click count, scroll count)
- [ ] Compute keystroke_rate (keys/sec) over 30s sliding window
- [ ] Compute mouse_velocity (px/sec) from mousemove deltas over 30s window
- [ ] Compute mouse_distance (total px) over 30s window
- [ ] Compute click_rate over 30s window
- [ ] Compute scroll_rate over 30s window
- [ ] Track idle_duration as continuous seconds (not binary)
- [ ] Maintain circular buffers for windowed computation

**Output features**:
```
keystrokeRate      (float, keys/sec, 30s window)
mouseVelocity      (float, px/sec, 30s window)
mouseDistance       (float, px, 30s window)
clickRate          (float, clicks/sec, 30s window)
scrollRate         (float, events/sec, 30s window)
idleDuration       (float, seconds since last activity)
isTabHidden        (boolean, backward compat)
isIdle             (boolean, backward compat)
activityLevel      (float, 0-1, normalised composite)
```

### 1-3. Create useContextSignals.js — New Hook

**Tasks**:
- [ ] Track tab switch count (visibilitychange events) over 5min window
- [ ] Track window focus/blur events over 5min window
- [ ] Compute time_since_tab_return (seconds since last tab return)
- [ ] Accept session elapsed time and total duration for session_elapsed_ratio
- [ ] Compute time_of_day as hour (0-23)

**Output features**:
```
tabSwitchCount5min    (int, count in last 5 min)
windowBlurCount5min   (int, count in last 5 min)
timeSinceTabReturn    (float, seconds)
sessionElapsedRatio   (float, 0.0 to 1.0)
timeOfDay             (int, 0-23)
```

### 1-4. Create useTemporalFeatures.js — New Hook

**Tasks**:
- [ ] Compute focus_score EMA with 30s decay
- [ ] Compute focus_score EMA with 5min decay
- [ ] Compute focus_trend (slope of last 5min scores via linear regression)
- [ ] Count distraction bursts (consecutive low-score events) in last 5min

**Input**: currentScore from useSession (updated every 2s)

**Output features**:
```
focusEma30s              (float, 0-100)
focusEma5min             (float, 0-100)
focusTrend               (float, negative=declining)
distractionBurstCount    (int, count in last 5 min)
```

### 1-5. Update scoring.js — Feature Vector Assembly

**Tasks**:
- [ ] Create assembleFeatureVector() that collects all features from all hooks
- [ ] Keep computeFocusScore() as rule-based fallback (backward compat)
- [ ] Add computeFocusScoreML() placeholder (returns rule-based for now, will use TF.js later)
- [ ] Feature vector = object with all ~25 named features

### 1-6. Update useSession.js — Wire Everything Together

**Tasks**:
- [ ] Import and use all new hooks
- [ ] Pass full feature vector to scoring
- [ ] Include ML features in event objects sent to backend
- [ ] Maintain backward compatibility (existing boolean signals still work)

---

## Step 2: Backend Schema Extension

### 2-1. Extend SessionEvent Model

**Tasks**:
- [ ] Add float fields for all ML features to SessionEvent model
- [ ] Create migration
- [ ] Update SessionEventSerializer to include new fields
- [ ] Update BulkEventSerializer

**New fields on SessionEvent**:
```python
# Visual features
head_yaw = FloatField(null=True)
head_pitch = FloatField(null=True)
head_roll = FloatField(null=True)
ear_left = FloatField(null=True)
ear_right = FloatField(null=True)
gaze_x = FloatField(null=True)
gaze_y = FloatField(null=True)
face_confidence = FloatField(null=True)

# Behavioral features
keystroke_rate = FloatField(null=True)
mouse_velocity = FloatField(null=True)
mouse_distance = FloatField(null=True)
click_rate = FloatField(null=True)
scroll_rate = FloatField(null=True)
idle_duration = FloatField(null=True)
activity_level = FloatField(null=True)

# Contextual features
tab_switch_count = IntegerField(null=True)
window_blur_count = IntegerField(null=True)
time_since_tab_return = FloatField(null=True)
session_elapsed_ratio = FloatField(null=True)

# Temporal features
focus_ema_30s = FloatField(null=True)
focus_ema_5min = FloatField(null=True)
focus_trend = FloatField(null=True)
distraction_burst_count = IntegerField(null=True)
```

### 2-2. Add ML Data Export Endpoint

**Tasks**:
- [ ] New endpoint: GET /api/ml/export/ → CSV/JSON of all events with features
- [ ] Filter by date range and user
- [ ] Include self-report labels if available

---

## Step 3: Ground Truth Collection System

### 3-1. ESM (Experience Sampling) Popup

**Tasks**:
- [ ] Create ESMPopup.jsx component
- [ ] Random trigger: 5-10 times per session (min 3min apart)
- [ ] UI: "How focused are you right now?" → 1-5 scale buttons
- [ ] Non-intrusive: small overlay, auto-dismiss after 10s if no response
- [ ] Store response with timestamp

### 3-2. Post-Session Self-Report

**Tasks**:
- [ ] Add to ReportPage.jsx after session ends
- [ ] Overall focus rating (1-10 slider)
- [ ] Optional: mark timeline segments as "focused" or "distracted"

### 3-3. Backend: SelfReport Model

**Tasks**:
- [ ] Create SelfReport model:
  ```python
  session = FK(FocusSession)
  timestamp = DateTimeField
  report_type = CharField (choices: 'esm', 'post_session')
  score = IntegerField (1-5 for ESM, 1-10 for post)
  ```
- [ ] API endpoints: POST /api/sessions/<id>/reports/
- [ ] Include in ML export

---

## Step 4: ML Training Pipeline

### 4-1. Data Preparation

**Tasks**:
- [ ] Create ml/ directory in project root
- [ ] ml/export_data.py: Fetch data from backend API → pandas DataFrame
- [ ] ml/feature_engineering.py: Clean, normalise, handle missing values
- [ ] Align ESM labels with nearest event timestamps (±5s window)
- [ ] Train/val/test split: 70/15/15, stratified by user (LOUO for final eval)

### 4-2. XGBoost Baseline (v1)

**Tasks**:
- [ ] ml/train_xgboost.py
- [ ] Target: ESM score (regression) or 3-class (low/med/high)
- [ ] Hyperparameter tuning via cross-validation
- [ ] Feature importance extraction (SHAP values)
- [ ] Save model: ml/models/xgboost_v1.json

### 4-3. Evaluation & Comparison

**Tasks**:
- [ ] ml/evaluate.py
- [ ] Metrics: MAE, RMSE, 3-class F1, accuracy
- [ ] Baseline comparison: rule-based scoring vs XGBoost
- [ ] Ablation: visual-only, behavioral-only, contextual-only, all combined
- [ ] Generate plots for thesis: confusion matrix, feature importance, ablation chart
- [ ] Save results: ml/results/

### 4-4. LSTM Model (v2, if data sufficient)

**Tasks**:
- [ ] ml/train_lstm.py
- [ ] Input: (30 timesteps × 25 features) = 60s window
- [ ] Architecture: Conv1D → LSTM → Dense
- [ ] Compare with XGBoost baseline
- [ ] Save model: ml/models/lstm_v2.h5

---

## Step 5: Model Deployment — Browser Integration

### 5-1. TF.js Model Export

**Tasks**:
- [ ] ml/export_tfjs.py
- [ ] Convert XGBoost: train equivalent TF model → convert to TF.js
  - OR use ONNX runtime web for XGBoost direct inference
- [ ] Convert LSTM: tf.saved_model → tensorflowjs_converter
- [ ] Output: frontend/public/models/focus_model/
- [ ] Target size: < 1MB

### 5-2. ML Scoring Integration

**Tasks**:
- [ ] Create frontend/src/ml/FocusModel.js
  - Load TF.js model on init
  - Preprocess feature vector (normalisation with saved scaler params)
  - Run inference
  - Return focus_score (0-100)
- [ ] Update scoring.js: computeFocusScoreML() uses FocusModel
- [ ] Fallback: if model fails to load, use rule-based scoring
- [ ] A/B: allow user to toggle ML vs rule-based in settings

---

## Step 6: Evaluation & Thesis Deliverables

### 6-1. Quantitative Evaluation

**Tasks**:
- [ ] Rule-based vs ML: MAE comparison on held-out ESM data
- [ ] Ablation study: contribution of each modality
- [ ] Feature importance ranking (SHAP)
- [ ] Cross-user generalisation (LOUO CV)
- [ ] Latency benchmark: inference time in browser (ms per prediction)

### 6-2. Qualitative Evaluation

**Tasks**:
- [ ] User study: 10+ participants, 3+ sessions each
- [ ] SUS (System Usability Scale) questionnaire
- [ ] Semi-structured interview: perceived accuracy, intrusiveness
- [ ] Compare perceived focus vs ML-predicted focus

### 6-3. Thesis Figures & Tables

**Tasks**:
- [ ] System architecture diagram
- [ ] Feature engineering pipeline diagram
- [ ] Model comparison table (rule-based vs XGBoost vs LSTM)
- [ ] Ablation results table
- [ ] SHAP feature importance plot
- [ ] Focus score timeline: rule-based vs ML overlay
- [ ] Confusion matrix (3-class)
- [ ] Inference latency histogram

---

## Progress Tracker

| Step | Status | Started | Completed |
|------|--------|---------|-----------|
| 1-1. Face Mesh upgrade | DONE | 2026-03-29 | 2026-03-29 |
| 1-2. Behavioral features | DONE | 2026-03-29 | 2026-03-29 |
| 1-3. Context signals hook | DONE | 2026-03-29 | 2026-03-29 |
| 1-4. Temporal features hook | DONE | 2026-03-29 | 2026-03-29 |
| 1-5. Scoring update | DONE | 2026-03-29 | 2026-03-29 |
| 1-6. Session hook wiring | DONE | 2026-03-29 | 2026-03-29 |
| 2-1. Backend schema | DONE | 2026-03-29 | 2026-03-29 |
| 2-2. ML export endpoint | DONE | 2026-03-29 | 2026-03-29 |
| 3-1. ESM popup | DONE | 2026-03-29 | 2026-03-29 |
| 3-2. Post-session report | DONE | 2026-03-29 | 2026-03-29 |
| 3-3. SelfReport model | DONE | 2026-03-29 | 2026-03-29 |
| 4-1. Data preparation | DONE | 2026-03-29 | 2026-03-29 |
| 4-2. XGBoost training | DONE | 2026-03-29 | 2026-03-29 |
| 4-3. Evaluation | DONE | 2026-03-29 | 2026-03-29 |
| 4-4. LSTM training | DONE | 2026-03-29 | 2026-03-29 |
| 5-1. TF.js export | DONE | 2026-03-29 | 2026-03-29 |
| 5-2. ML scoring integration | DONE | 2026-03-29 | 2026-03-29 |
| 6-1. Quantitative eval | WAITING FOR DATA | - | - |
| 6-2. Qualitative eval | WAITING FOR DATA | - | - |
| 6-3. Thesis figures | WAITING FOR DATA | - | - |
