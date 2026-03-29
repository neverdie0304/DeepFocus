# DeepFocus ML Implementation Plan

> Multi-modal browser-based concentration detection system
> Last updated: 2026-03-29

---

## Problem Definition

The current rule-based system computes focus scores using fixed-weight penalties on 4 binary signals. As the literature repeatedly identifies:

- Keyboard inactivity = deep thinking OR disengagement (ambiguity)
- Mouse inactivity = reading focus OR away from desk (ambiguity)
- Identical signal combinations may correspond to different concentration levels depending on context

**What ML solves**: Learning non-linear interactions between signals to disambiguate states that rule-based logic cannot distinguish.

---

## Phase 1: Feature Engineering

Currently collecting 4 binary features every 2 seconds. This must be expanded to a **rich continuous feature set (~25-30 features)**.

### 1A. Visual Features (MediaPipe Face Mesh upgrade)

Current: BlazeFace detection + bounding box center offset only.
Target: Face Mesh 468 landmarks with PnP-based head pose estimation.

| Feature | Description | Literature Basis |
|---------|-------------|-----------------|
| `head_yaw` | Horizontal rotation angle (PnP) | Murphy-Chutorian & Trivedi, 2009 |
| `head_pitch` | Vertical tilt angle | Screen-off gaze detection |
| `head_roll` | Lateral tilt | Drowsiness / posture change |
| `eye_aspect_ratio` (EAR) | Eye closure ratio | Drowsiness detection (Soukupova & Cech, 2016) |
| `gaze_direction_x/y` | Iris landmark-based gaze | MediaPipe iris model |
| `face_confidence` | Detection confidence score | Accounts for lighting/distance variation |

### 1B. Behavioral Features (time-windowed)

Current: binary idle/tab_hidden. Target: continuous features with sliding windows.

| Feature | Window | Description |
|---------|--------|-------------|
| `keystroke_rate` | 30s | Keys per second |
| `keystroke_variance` | 30s | Typing rhythm variability (Epp et al., 2011) |
| `mouse_velocity_mean` | 30s | Average mouse speed |
| `mouse_velocity_std` | 30s | Speed variability |
| `mouse_distance` | 30s | Total travel distance |
| `click_rate` | 30s | Clicks per second |
| `scroll_rate` | 30s | Scroll events per second |
| `idle_duration` | instant | Time since last activity |
| `activity_entropy` | 60s | Input pattern diversity |

### 1C. Contextual Features

| Feature | Description |
|---------|-------------|
| `tab_visible` | Binary |
| `window_focused` | Focus/blur event |
| `tab_switch_count_5min` | Tab switches in last 5 min (Mark et al., 2014) |
| `time_since_tab_return` | Elapsed time after tab return |
| `session_elapsed_ratio` | Session progress (fatigue proxy) |
| `time_of_day` | Hour of day (circadian effect) |

### 1D. Temporal Features

Pimenta et al. (2015): 5-10 min windows are more predictive than 30s snapshots.

| Feature | Description |
|---------|-------------|
| `focus_score_ema_30s` | 30-second exponential moving average |
| `focus_score_ema_5min` | 5-minute exponential moving average |
| `focus_trend` | 5-min trend direction (rising/falling) |
| `distraction_burst_count` | Consecutive distraction episodes in last 5 min |

---

## Phase 2: Ground Truth Label Collection

The biggest ML challenge: **no labeled data exists**. Three parallel strategies:

### Strategy A: Experience Sampling Method (ESM)

- Random popup 5-10 times per session: "Are you focused right now?"
- 1-5 Likert scale as regression target
- Literature: Csikszentmihalyi & Larson (1987), D'Mello & Graesser (2012)
- **Minimum data**: 20 users x 5 sessions x 10 samples = **1,000 labeled points**

### Strategy B: Post-Session Self-Report

- Overall concentration rating (1-10) after session ends
- Mark "most focused" and "most distracted" time segments
- Weak but useful as session-level supervision

### Strategy C: Semi-Supervised / Self-Supervised

- **Contrastive Learning**: Use high-confidence states as pseudo-labels
  - "Clearly focused": face present + typing + tab visible
  - "Clearly distracted": face missing + tab hidden
- Model learns to classify ambiguous middle-ground states
- Literature: Nezami et al. (2020) semi-supervised engagement detection

---

## Phase 3: Model Architecture

### Option A: Gradient Boosted Trees (Recommended for v1)

```
XGBoost / LightGBM
- Input: 25-30 features (snapshot + windowed)
- Output: focus_score (0-100 regression) or 3-class (low/medium/high)
- Pros: Interpretable, feature importance analysis, works with small data
- Strong for thesis defence (explainability)
```

### Option B: Lightweight Neural Network (v2)

```
1D-CNN + LSTM Hybrid
- Input: (T, F) = (30 timesteps x 2s = 60s window, 25 features)
- Conv1D layers -> temporal pattern extraction
- LSTM layer -> sequential dependency
- Dense -> focus_score
- Pros: Learns temporal dynamics, captures non-linear interactions
- Cons: Requires more data (~5,000+ samples)
```

### Option C: Browser-Deployable Model (final target)

```
TensorFlow.js conversion
- Train with Option A/B, convert via ONNX -> TF.js
- Real-time inference in browser
- Model size target: < 1MB (comparable to MediaPipe)
```

**Recommended roadmap**: A -> C (start with trees, validate, upgrade to neural net, deploy to browser)

---

## Phase 4: Training Pipeline

### Directory Structure

```
ml/
  feature_engineering.py
  train_xgboost.py
  train_lstm.py
  evaluate.py
  export_tfjs.py
  models/              <- saved models
data/
  raw_events/          <- export from backend DB
  processed/           <- feature-engineered datasets
  labels/              <- ESM + self-report labels
```

### Evaluation Metrics

| Metric | Purpose |
|--------|---------|
| **MAE** (primary) | Mean Absolute Error on focus score |
| **3-class Accuracy / F1** | Low / medium / high classification |
| **Baseline comparison** | ML vs current rule-based scoring |
| **Cross-validation** | Leave-One-User-Out (LOUO) for generalisation |

---

## Phase 5: Integration Architecture

```
+---------------------------------------------------+
|                   Browser (Client)                 |
|                                                    |
|  MediaPipe Face Mesh ----> Visual Features         |
|  DOM Event Listeners ----> Behavioral Features     |
|  Page Visibility API ----> Contextual Features     |
|           |                                        |
|           v                                        |
|  Feature Aggregator (30s / 60s / 5min windows)     |
|           |                                        |
|           v                                        |
|  +------------------------+                        |
|  | TF.js ML Model         |  <- Rule-based         |
|  | (< 1MB, real-time)     |     fallback           |
|  +------------------------+                        |
|           |                                        |
|           v                                        |
|     focus_score (0-100)                            |
|           |                                        |
|           v                                        |
|     Backend API (store events + ML features)       |
+---------------------------------------------------+
```

All inference runs locally in the browser. No images or raw data are transmitted.

---

## Phase 6: Thesis Contribution Points

1. **Rule-based vs ML comparison** — ML achieves higher correlation with ESM ground truth
2. **Feature importance analysis** — Quantitative evidence for which modality matters most
3. **Ablation study** — Visual-only vs behavioural-only vs multimodal (validates literature claim: multimodal > unimodal)
4. **Browser-native ML inference** — Addresses the literature gap of server-side dependency
5. **Privacy-preserving design** — All data processed locally, no image transmission

---

## Implementation Priority

| Order | Task | Phase |
|-------|------|-------|
| 1 | Feature engineering — expand hooks to ~25-30 continuous features | Phase 1 |
| 2 | ESM popup implementation for ground truth collection | Phase 2A |
| 3 | User testing and data collection (2-3 weeks) | Phase 2 |
| 4 | XGBoost baseline training and evaluation | Phase 3A |
| 5 | Ablation study and comparative analysis | Phase 6 |
| 6 | TF.js model export and browser integration | Phase 5 |

---

## Key Literature References

- Epp et al. (2011) — Keystroke dynamics and emotional states
- Murphy-Chutorian & Trivedi (2009) — Head pose estimation survey
- Pimenta et al. (2015) — Keyboard/mouse patterns and attention levels
- Mark et al. (2014) — Tab switching and multitasking stress
- Nezami et al. (2020) — Semi-supervised engagement detection
- Dewan et al. (2019) — Engagement detection in online learning survey
- Csikszentmihalyi & Larson (1987) — Experience sampling method
- D'Mello & Graesser (2012) — Affective states during complex learning
- Papoutsaki et al. (2016) — WebGazer.js browser-based gaze tracking
- Kartynnik et al. (2019) — MediaPipe Face Mesh real-time landmarks
