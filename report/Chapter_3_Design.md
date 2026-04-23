# Chapter 3: Design

This chapter presents the design of DeepFocus. It begins by articulating the functional and non-functional requirements derived from the research questions and the constraints identified in Chapter 2, and proceeds to describe the system architecture, the feature engineering strategy, the dual scoring scheme, and the key design decisions that shape the system.

## 3.1 Requirements

### 3.1.1 Functional Requirements

The following functional requirements were derived from the research questions stated in Section 1.3:

**FR1. Multimodal signal capture.** The system shall capture signals from at least three modalities — visual, behavioural, and contextual — concurrently during a focus session.

**FR2. Real-time scoring.** The system shall compute and display a focus score (0–100) at regular intervals (specifically every 2 seconds) while a session is running.

**FR3. Session management.** The system shall support starting, pausing, resuming, and ending a focus session, and shall record the duration, mode, and task type of each session.

**FR4. Historical access.** The system shall allow users to review past sessions, including per-session focus timelines, time breakdowns by distraction type, and aggregate weekly analytics.

**FR5. Ground-truth collection.** The system shall collect human ground-truth focus ratings during and after sessions — specifically, Experience Sampling Method (ESM) popups during the session and a post-session overall rating.

**FR6. Data export for ML training.** The system shall provide a mechanism to export all collected event-level data and self-report labels in a format suitable for offline machine learning training.

**FR7. Account management.** The system shall support user registration, authentication, password change, and account deletion with cascading data removal.

### 3.1.2 Non-Functional Requirements

**NFR1. Browser-native deployment.** The entire user-facing system shall run inside a standard web browser, without requiring installation of browser extensions, native applications, or additional plugins.

**NFR2. Privacy preservation.** Raw images and video from the user's webcam shall never leave the browser. Only aggregated numerical features and focus scores shall be transmitted to the backend.

**NFR3. No specialised hardware.** The system shall require nothing beyond a standard webcam, keyboard, and mouse. Specifically, it shall not require eye-tracking hardware, EEG or other physiological sensors, or specialised depth cameras.

**NFR4. Real-time performance.** Visual feature extraction shall operate at no less than 10 frames per second on consumer-grade laptop hardware, and focus score computation shall complete within 100 ms per update.

**NFR5. Data durability.** Event-level data shall be uploaded to persistent storage during the session (not only at the end), to protect against data loss from browser crashes or network interruptions over long sessions.

**NFR6. Graceful degradation.** If the machine-learned scorer cannot be loaded (for example, because the model has not yet been trained or the browser cannot load TensorFlow.js), the system shall fall back to the deterministic rule-based scorer without user intervention.

**NFR7. Deployability.** The system shall be deployable as a single-service web application on a standard cloud provider with a free tier, within the constraints typical of a student project (no paid infrastructure).

## 3.2 System Architecture

### 3.2.1 Overview

DeepFocus comprises three loosely-coupled components, as illustrated in Figure 3.1:

1. **A browser-side client** (React + Vite) that captures webcam video, extracts features locally, computes focus scores, and renders the user interface.
2. **A backend service** (Django REST Framework) that handles authentication, persists session and event data, and serves analytics queries.
3. **An offline machine learning pipeline** (Python + XGBoost + TensorFlow.js) that consumes exported event data, trains a focus score predictor, and produces a TensorFlow.js artefact for browser-side inference.

> **Figure 3.1 — High-level system architecture.**
> A three-part diagram showing: (left) the browser client with four feature extraction blocks (MediaPipe Face Mesh, DOM event listeners, Page Visibility API, temporal aggregator) feeding a feature vector into a scorer (rule-based or ML); (middle) an HTTPS arrow to the backend service, which contains the SQLite database and exposes REST endpoints for sessions, events, self-reports, and ML data export; (right) the offline ML pipeline showing data export → feature engineering → XGBoost training → knowledge distillation → TF.js model, with a dashed arrow back to the browser indicating the deployed model.

The three components are coupled only by well-defined interfaces: the browser and backend communicate exclusively via authenticated JSON REST calls, and the ML pipeline interacts with the system only by reading exported data and writing a TensorFlow.js model to the frontend's static assets directory. No raw images, video, or keystroke content ever cross these interfaces.

### 3.2.2 Browser Client

The browser client is a single-page React application. Its responsibilities are:

- **Camera and webcam management.** Requesting user consent for camera access and acquiring a `MediaStream` via the standard `getUserMedia` API.
- **Visual feature extraction.** Running the MediaPipe Face Landmarker model on each captured frame (at 10 Hz) to extract 478 facial landmarks, a facial transformation matrix, and 52 blendshape coefficients.
- **Behavioural feature extraction.** Attaching DOM event listeners for `keydown`, `mousemove`, `click`, `scroll`, and `touchstart`, and maintaining a 30-second sliding window of aggregated behavioural features.
- **Contextual feature extraction.** Listening to `visibilitychange` and window `focus`/`blur` events to compute tab-switching and application-focus features over a 5-minute window.
- **Temporal feature computation.** Maintaining exponential moving averages and linear-regression trend estimates over the stream of focus scores.
- **Score computation.** Combining all features into a 36-dimensional feature vector and computing a focus score, either via the rule-based scorer or the loaded TensorFlow.js model.
- **Event buffering and upload.** Storing per-sample events in memory and uploading them to the backend every 30 seconds during the session, with a final flush on session end.
- **User interface.** Rendering the focus gauge, signal indicators, camera preview, session controls, ESM popup, session history, and post-session report.

### 3.2.3 Backend Service

The backend is a Django REST Framework application backed by a SQLite database. It is intentionally minimal in scope: its role is to persist data and serve it back, not to perform any scoring or machine learning. This separation ensures that the scoring logic lives entirely in the browser, consistent with the privacy requirement.

Three core models capture the data:

- **`FocusSession`** — one row per session, storing user, start and end timestamps, duration, mode (`camera_on` / `camera_off`), final focus score, cumulative distraction times, task tag, and notes.
- **`SessionEvent`** — one row per 2-second sample, storing the session foreign key, timestamp, focus score, the four legacy boolean signals, and all thirty-one continuous ML feature fields (visual, behavioural, contextual, temporal).
- **`SelfReport`** — one row per ground-truth rating, storing the session foreign key, timestamp, report type (`esm` or `post_session`), and integer score.

A set of REST endpoints exposes these models: authentication endpoints for registration, login, token refresh, password change, and account deletion; session endpoints for creation, listing, detail retrieval, update, and deletion; a bulk event upload endpoint; a self-report submission endpoint; a weekly analytics endpoint that aggregates data for the dashboard; and an ML export endpoint that produces CSV or JSON data for the offline training pipeline.

### 3.2.4 ML Pipeline

The ML pipeline is an offline Python workflow, not part of the deployed application. It consists of five stages:

1. **Export.** `export_data.py` reads events and self-reports directly from the backend's SQLite database and writes them to CSV.
2. **Feature engineering.** `feature_engineering.py` fills missing values with sensible defaults, normalises features using Z-score standardisation, aligns ESM self-reports with the nearest event within a ±5-second window, and attaches post-session labels as session-level supervision.
3. **Training.** `train_xgboost.py` trains an XGBoost regressor against the target labels using 5-fold `GroupKFold` cross-validation with sessions as groups (preventing leakage between train and validation). A companion script trains a Conv1D + LSTM model on 60-second temporal windows for comparison.
4. **Evaluation.** `evaluate.py` compares the trained ML model against the rule-based baseline using the same ground-truth labels, runs the ablation study over modality subsets, and generates plots and tables for the thesis.
5. **Deployment.** `export_tfjs.py` uses knowledge distillation to produce a small multilayer perceptron that mimics the XGBoost predictions, then converts that MLP to TensorFlow.js format and writes it to the frontend's `public/models/` directory for browser-side inference.

## 3.3 Feature Engineering Strategy

### 3.3.1 Overview

The system extracts a 36-dimensional feature vector per 2-second sample, organised into four modalities, as summarised in Table 3.1.

> **Table 3.1 — Feature vector overview by modality.**
> A table with four rows (Visual, Behavioural, Contextual, Temporal), each row showing the modality name, the number of features, a one-line description, and representative examples. Visual: 20 features, face geometry and expression, e.g., head_yaw, EAR, gaze_x, brow_down, mouth_smile. Behavioural: 7 features, input activity over 30-second window, e.g., keystroke_rate, mouse_velocity, click_rate. Contextual: 4 features, browser focus and session progress, e.g., tab_switch_count_5min, window_blur_count_5min, session_elapsed_ratio. Temporal: 4 features, trend analysis over recent scores, e.g., focus_ema_30s, focus_trend, distraction_burst_count.

The four modalities were chosen to cover complementary aspects of the concentration signal. Visual features capture what the user's face and eyes are doing. Behavioural features capture how the user is interacting with the input devices. Contextual features capture the user's relationship with the browser tab and window. Temporal features capture how the user's focus state is evolving over short and medium timescales. The literature (Dewan et al., 2019; D'Mello et al., 2012) suggests that combining these complementary perspectives should yield more robust detection than any single perspective alone — a hypothesis tested empirically in Chapter 5.

### 3.3.2 Visual Modality

The visual modality is built on MediaPipe Face Landmarker v2 with blendshapes, selected for three reasons: it provides 478 three-dimensional facial landmarks plus 52 blendshape coefficients and a facial transformation matrix in a single lightweight inference step; it is optimised for browser deployment via WebAssembly with GPU delegation; and it has been widely validated in the literature (Kartynnik et al., 2019; Lugaresi et al., 2019).

Eight geometric features are derived from the landmarks:

- **Head pose (yaw, pitch, roll).** Extracted from the 4×4 facial transformation matrix via ZYX Euler angle decomposition. Head pose provides a coarse but reliable proxy for gaze direction (Murphy-Chutorian and Trivedi, 2009), indicating whether the user is oriented toward the screen.
- **Eye Aspect Ratio (EAR), left and right.** Computed using the formula from Soukupová and Čech (2016): EAR = (‖p₂−p₆‖ + ‖p₃−p₅‖) / (2·‖p₁−p₄‖), where p₁ through p₆ are the six standard eye landmarks. Low EAR values indicate closed eyes (potential drowsiness); high values indicate wide-open eyes.
- **Iris-based gaze (x, y).** Computed from the iris centre landmarks (indices 468 and 473, available when iris refinement is enabled) normalised against the inner and outer eye corners. This provides a horizontal and vertical gaze estimate in the range [−1, 1].
- **Face detection confidence.** A binary indicator (1.0 when the landmarker successfully detected a face in the frame; 0.0 otherwise), capturing whether the user is physically present at the computer.

Twelve blendshape coefficients are retained as additional features. Of the 52 blendshapes produced by the model, twelve were selected for their relevance to cognitive states in the affective computing literature (Whitehill et al., 2014; Bosch et al., 2016): `browDownLeft`, `browDownRight`, `browInnerUp`, `eyeSquintLeft`, `eyeSquintRight`, `eyeWideLeft`, `eyeWideRight`, `jawOpen`, `mouthFrownLeft`, `mouthFrownRight`, `mouthSmileLeft`, `mouthSmileRight`. The rationale for this selection is described in Chapter 4.

> **Figure 3.2 — Visual feature extraction pipeline.**
> A data-flow diagram showing: webcam frame → MediaPipe Face Landmarker → three parallel outputs (478 landmarks, 4×4 transformation matrix, 52 blendshapes) → three feature extraction blocks (head pose via Euler decomposition, EAR computation, iris gaze normalisation) → 8 geometric features + 12 blendshape features = 20 visual features.

### 3.3.3 Behavioural Modality

Seven behavioural features are computed over a 30-second sliding window implemented as circular ring buffers (15 slots at a 2-second sampling interval):

- **`keystroke_rate`** — keys pressed per second.
- **`mouse_velocity`** — total mouse displacement per second.
- **`mouse_distance`** — cumulative mouse travel in the window.
- **`click_rate`** — mouse clicks per second.
- **`scroll_rate`** — scroll events per second.
- **`idle_duration`** — seconds since the most recent input event (a continuous value, unlike the legacy binary `isIdle` flag).
- **`activity_level`** — a normalised composite reflecting overall input intensity.

A 30-second window was chosen as a pragmatic middle ground between the instantaneous 2-second sample (too noisy) and the 5–10 minute window suggested by Pimenta et al. (2015) (too slow to reflect transient changes). This window size is revisited in Chapter 5.

### 3.3.4 Contextual Modality

Four contextual features are derived from browser APIs:

- **`tab_switch_count`** — number of `visibilitychange` events transitioning to hidden within the last 5 minutes.
- **`window_blur_count`** — number of `blur` events on the window within the last 5 minutes.
- **`time_since_tab_return`** — seconds since the user last returned focus to the tab or window.
- **`session_elapsed_ratio`** — the current session elapsed time divided by a one-hour reference, clamped to [0, 1].

These features are retained as ML input features despite being excluded from the rule-based scoring penalty, for reasons discussed in Section 3.5.

### 3.3.5 Temporal Modality

Four temporal features are derived from the running focus score history:

- **`focus_ema_30s`** — 30-second exponential moving average (α = 2 / (N+1) with N = 15).
- **`focus_ema_5min`** — 5-minute exponential moving average.
- **`focus_trend`** — ordinary least squares slope over the 5-minute score history.
- **`distraction_burst_count`** — the number of contiguous runs of three or more consecutive low-score (< 50) samples within the last 5 minutes.

These features capture short-term smoothing, medium-term smoothing, directional trend, and burst structure, respectively. They are computed client-side and included in the feature vector, allowing the ML model to incorporate temporal context without requiring a recurrent architecture.

## 3.4 Scoring Approach

### 3.4.1 Rule-Based Baseline

The rule-based scorer is a deterministic function of four binary signals derived from the continuous feature vector:

```
score = 100
if face_missing:    score -= 50
if looking_away:    score -= 35
if idle:            score -= 15
score = max(0, score)
```

In the camera-off mode, only the `idle` penalty applies, with a larger weight.

The weights were chosen to reflect the relative informativeness of each signal in a naïve multiplicative sense: missing face is the strongest evidence of disengagement (the user is not at the computer), followed by looking away (the user is at the computer but attending to something off-screen), followed by idle (the user may be thinking or may be disengaged — the signal is ambiguous). The rule-based scorer serves two purposes: it provides a baseline against which the ML scorer can be compared, and it serves as a graceful fallback in the event that the ML model cannot be loaded.

### 3.4.2 Machine-Learned Scorer

The ML scorer is a small multilayer perceptron, distilled from an XGBoost regressor trained on user data. The input is the 36-dimensional feature vector (normalised using Z-score statistics captured during training); the output is a single scalar in [0, 100] representing predicted focus.

The training target is constructed from a three-layer label scheme described in Section 3.5.2. Cross-validation uses `GroupKFold` with sessions as groups to prevent any single session from appearing in both training and validation folds, which would artificially inflate performance by allowing the model to exploit within-session similarities.

A full description of the training procedure and the MLP distillation appears in Chapter 4.

### 3.4.3 Fallback Strategy

The browser client loads the TensorFlow.js model asynchronously at application startup. If the model is unavailable for any reason — the model has not been trained yet, the TensorFlow.js CDN is unreachable, or the browser cannot execute the model due to resource constraints — the client detects the failure and silently falls back to the rule-based scorer. The fallback is transparent to the user: the focus gauge continues to display a valid score, computed deterministically from the same feature vector that would otherwise have been fed to the model.

This design satisfies NFR6 (graceful degradation) and ensures that the system remains functional even when the ML component is absent, which is the state during the initial data collection phase of the project.

## 3.5 Design Decisions

Three design decisions warrant explicit discussion because they represent non-obvious choices that shaped the system in important ways.

### 3.5.1 Exclusion of Tab-Switching from Rule-Based Penalty

Tab switching was initially included as a penalty in the rule-based scorer, on the basis that the literature (Mark et al., 2014; Estrin and Robilliard, 2016) identifies tab-switching frequency as an indicator of reduced task focus. During early implementation testing, however, it became clear that penalising all tab switches equally conflates two categorically different behaviours. A user switching from a code editor tab to a Stack Overflow tab to look up an API call is engaged in productive multitasking; a user switching from the same code editor to YouTube is disengaged. The two are indistinguishable from within the browser, because the same-origin policy (Barth, 2011) prevents any web application from inspecting the content, URL, or title of other tabs. The Page Visibility API reports only that the user has left the tab, not where they went.

Two responses were considered. The first was to keep the penalty and accept the false positives. The second, which was adopted, was to remove the tab-switching penalty from the rule-based scorer entirely, while retaining tab-switching counts and timings as features in the ML feature vector. This allows the ML model to learn patterns from labelled data — for example, that a short tab-switch followed by immediate typing on return is consistent with productive multitasking, whereas a longer absence followed by idle behaviour is consistent with distraction. The model can learn this distinction from the combination of `tab_switch_count`, `time_since_tab_return`, `keystroke_rate`, and `idle_duration`, in a way that a fixed-weight rule cannot.

This decision illustrates a broader pattern in the design: signals whose interpretation is strongly context-dependent are removed from the deterministic scorer but retained as features for the ML model, which is better equipped to handle their conditional informativeness.

### 3.5.2 Three-Layer Label Strategy

Training an ML model on a rule-based focus score as a proxy target is circular: the model merely learns to replicate the rule-based system and cannot, by construction, outperform it on any evaluation that uses the rule-based score as ground truth. Meaningful evaluation therefore requires human-provided ground-truth labels.

Collecting such labels is expensive. A thorough user study with 20+ participants across multiple sessions is beyond the scope of an MSc-level project with a tight deadline. The design therefore adopts a three-layer label strategy that combines three sources in priority order:

1. **Experience Sampling Method (ESM) self-reports** — in-the-moment ratings on a 1–5 scale collected via random popups during sessions. These are the highest-quality labels but are sparse (approximately one per five minutes).
2. **Post-session self-reports** — overall ratings on a 1–10 scale collected immediately after each session ends, rescaled to 1–5 for consistency with ESM. These are session-level labels applied uniformly to all events in the session; they are weaker than ESM but cover every event.
3. **Signal-based pseudo-labels** — heuristic labels assigned to events that exhibit unambiguous signal patterns. An event with a clear face, low idle duration, active input, and centred head pose is labelled 5 (clearly focused); an event with no detected face, very long idle duration, or extreme head yaw is labelled 1 (clearly distracted); intermediate patterns receive intermediate labels.

During training, the highest-priority label available for each event is used. This strategy ensures that the model always has a non-circular target, while real human ratings are used wherever possible.

The validity of this approach rests on the assumption that the pseudo-labels, while coarse, are at least directionally correct — that a face missing + 30-second idle event really is a low-focus event, regardless of the particular user. The empirical defensibility of this assumption is examined in Chapter 5 by comparing model performance on the ESM-labelled subset (where the target is purely human-derived) against performance on the full dataset (where pseudo-labels contribute).

### 3.5.3 Handling Browser Security Constraints

The browser's security model imposes two constraints that fundamentally shape what DeepFocus can and cannot do:

- **Same-origin policy.** The application cannot inspect the content of tabs other than its own, cannot read the user's browsing history, and cannot monitor what applications the user has switched to outside the browser (Barth, 2011).
- **Permission model.** Access to the webcam requires explicit user consent via `getUserMedia`, and access is revoked when the tab is closed or loses focus.

These constraints could be seen as limitations — and they are, compared to desktop applications such as RescueTime, which can monitor system-wide activity because they operate outside the browser sandbox. The design of DeepFocus reframes them as features. By deliberately operating within the sandbox, the system achieves a privacy-preserving default: the user's other browser activity is invisible to it, their file system is inaccessible, and their camera feed never leaves the device. This aligns with the ethical principles increasingly expected in learning analytics (Slade and Prinsloo, 2013), and with the trajectory of regulatory frameworks that favour data minimisation.

The design does not attempt to circumvent these constraints. Instead, it compensates for them by capturing richer signals within the browser — high-resolution face mesh features, dense behavioural features, temporal aggregations — than most prior browser-based systems have done.

## 3.6 Summary

The design of DeepFocus integrates multimodal signal extraction, a dual scoring scheme, and a privacy-preserving deployment model within the constraints of the browser environment. Four modalities (visual, behavioural, contextual, temporal) produce a 36-dimensional feature vector updated every two seconds. A rule-based scorer provides a deterministic baseline and fallback; a machine-learned scorer — trained offline on a three-layer label scheme combining ESM, post-session, and pseudo-labels — provides the primary scoring capability. Three design decisions shape the system in non-obvious ways: tab switching is removed from the rule-based penalty but retained as an ML feature; labels are constructed from a three-layer hierarchy to maximise training data in a small-data setting; and browser security constraints are embraced as privacy guarantees rather than limitations to circumvent. The concrete implementation of this design is the subject of Chapter 4.
