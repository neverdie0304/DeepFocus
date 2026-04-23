# DeepFocus Architecture

Technical reference for developers. For the research rationale and design decisions behind each component, see the thesis chapters in [`docs/thesis/`](thesis/).

---

## Component Overview

DeepFocus comprises three loosely-coupled components that communicate through narrow, well-defined interfaces:

```
┌──────────────────────────────────────────────────────────────────┐
│                      Browser (Client)                              │
│                                                                    │
│   feature extraction   →   scoring   →   session orchestration     │
└──────────────────────────────────────────────────────────────────┘
                               │ HTTPS + JWT
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Backend (Django REST)                           │
│                                                                    │
│   auth · sessions · events · self-reports · analytics · ML export  │
└──────────────────────────────────────────────────────────────────┘
                               │ CSV export (manual)
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                  ML Pipeline (offline)                             │
│                                                                    │
│   export → feature engineering → training → evaluation → TF.js     │
└──────────────────────────────────────────────────────────────────┘
```

The three components only share data through:
1. HTTPS REST calls between browser and backend (typed JSON payloads validated by DRF serializers).
2. CSV/JSON exports from the backend to the ML pipeline (defined by the fields in `api.features`).
3. A TensorFlow.js model bundle written by the ML pipeline to `frontend/public/models/` and loaded at runtime by the browser client.

No raw images, video, or keystroke content ever crosses these interfaces.

---

## Frontend

### Directory layout

```
frontend/src/
├── api/                 Axios client and typed endpoint wrappers
├── components/          Reusable UI components (Layout, Navbar, etc.)
├── constants/           Magic numbers: sampling rates, thresholds, URLs
├── context/             AuthContext (JWT lifecycle)
├── hooks/               Feature extraction hooks (one per modality)
├── ml/                  FocusModel: TF.js loader and inference wrapper
├── pages/               Route-level components
├── test/                Vitest setup
└── utils/
    ├── features/        Pure helpers: landmarks, EAR, gaze, head pose, ringBuffer
    └── scoring.js       Rule-based scorer + feature vector assembly + ML entry
```

### Feature extraction pipeline

Each hook is responsible for one modality and exposes its output as a plain object. `useSession` wires them together:

```
useFaceDetection  ┐
useBehaviourSignals├─►  assembleFeatureVector  ─►  36-key vector  ─►  scoring
useContextSignals ┤                                                   │
useTemporalFeatures┘                                                  ▼
                                                             focus_score (0–100)
```

The hooks never talk to the backend directly — that is `useSession`'s responsibility.

### State management

All state is local to the React tree. `AuthContext` is the only context provider. There is no Redux or state machine library; hook composition is sufficient for the scope of the app.

### Scoring

`utils/scoring.js` exposes:

| Function                 | Purpose                                                                 |
|--------------------------|-------------------------------------------------------------------------|
| `computeFocusScore`      | Deterministic rule-based score from four boolean signals.               |
| `assembleFeatureVector`  | Build the 36-key feature vector emitted to the backend and the model.   |
| `computeFocusScoreML`    | Try the TF.js model first, fall back to `computeFocusScore`.            |

The separation lets the browser run perfectly well before any ML model has been trained — `computeFocusScoreML` silently falls back.

### TF.js inference

`ml/FocusModel.js` is structured to avoid bundling the 3 MB TensorFlow.js runtime:

1. At app startup, fetch `/models/focus_model/model_meta.json`. If absent, the ML path is disabled.
2. If metadata is present, inject a `<script>` tag for TF.js from the jsDelivr CDN.
3. Load the graph model from `/models/focus_model/model.json`.
4. On each prediction, apply Z-score normalisation using the scaler parameters captured during training.
5. On any failure, return `null` and let the caller fall back to the rule-based path.

---

## Backend

### Directory layout

```
backend/
├── api/
│   ├── migrations/           Schema evolution
│   ├── tests/                Unit tests split by concern
│   ├── views/                One module per responsibility (auth, sessions, reports, analytics, ml)
│   ├── admin.py              ModelAdmin registrations
│   ├── apps.py
│   ├── constants.py          MODE_CHOICES, REPORT_TYPE_CHOICES, validation limits
│   ├── models.py             User, FocusSession, SessionEvent, SelfReport
│   ├── serializers.py        DRF serializers
│   └── urls.py               URL patterns
└── deepfocus/
    ├── settings.py           Environment-variable driven configuration
    ├── urls.py               Mounts /api + SPA catch-all for production
    └── wsgi.py
```

### Request flow

1. `deepfocus/urls.py` mounts `/api/` to `api/urls.py` and serves the React SPA for all other routes.
2. `api/urls.py` routes by path.
3. Each view class lives in `api/views/` under a module named by responsibility. The `api.views` package re-exports all views so `api/urls.py` can continue to reference them as `views.SomeView`.
4. Views delegate to serializers for input validation and output shaping.
5. Serializers in turn validate against model field definitions. The schema is the single source of truth.

### Authentication

JWT via `djangorestframework-simplejwt`. Access tokens are 30 min, refresh tokens are 7 days with rotation. All endpoints require authentication by default; only `RegisterView` overrides with `AllowAny`.

### Models

- `FocusSession` — one row per session.
- `SessionEvent` — one row per 2-second sample. Contains all 35 ML feature fields (all nullable).
- `SelfReport` — one row per human rating, either ESM (1-5 scale) or post-session (1-10 scale).

Cascading foreign keys ensure that deleting a user deletes all their sessions, events, and reports in a single transaction.

### ML data export

`GET /api/ml/export/?format=csv` streams all of the caller's events in CSV form. This is consumed by the offline ML pipeline. `?format=json` returns the same data as a JSON array.

---

## ML Pipeline

### Directory layout

```
ml/
├── features.py              Single source of truth for feature lists
├── paths.py                 Canonical filesystem paths
├── export_data.py           Fetch from SQLite or the REST API
├── feature_engineering.py   Clean, align labels, normalise
├── train_xgboost.py         XGBoost regressor + 3-class classifier + ablation
├── train_lstm.py            Conv1D + LSTM over 60s windows
├── evaluate.py              Generate thesis figures and comparison tables
├── export_tfjs.py           Knowledge distillation → TF.js model
└── requirements.txt
```

### Data flow

```
db.sqlite3  →  events.csv + self_reports.csv  →  dataset.csv + scaler_params.json
                                                          │
                                                          ▼
                                       ┌─  xgboost_regressor.json
                                       │   xgboost_classifier.json
                                       │
                                       └─  lstm_model.keras
                                                          │
                                                          ▼
                                       focus_model/model.json + weight shards
                                       (written to frontend/public/models/)
```

### Feature schema consistency

`ml/features.py` is the single source of truth for ML feature names. It must stay in sync with:

- `backend/api/models.py::SessionEvent` field names
- `backend/api/serializers.py::_SESSION_EVENT_FIELDS`
- `frontend/src/utils/scoring.js::assembleFeatureVector` key names

Adding a new feature requires touching all three places plus a migration. Any mismatch will manifest as a null column in the exported CSV.

### Training strategy

Three-layer label construction (documented in the thesis Chapter 3 §3.5.2):

1. ESM self-reports (1-5) — highest quality, sparsest.
2. Post-session self-reports (1-10, rescaled to 1-5) — session-level supervision.
3. Signal-based pseudo-labels for high-confidence states — coverage for the remainder.

Cross-validation uses `GroupKFold` with `session_id` as the group, preventing leakage between folds.

---

## Deployment

### Render.com

Single-service deployment via `render.yaml`. The build script (`build.sh`) installs frontend and backend dependencies, builds the React bundle, collects static files, and runs migrations. At runtime, a single gunicorn process serves both the API (under `/api/`) and the built SPA (everything else, via `whitenoise` and a Django catch-all route).

### Local development

The frontend dev server (`npm run dev`) proxies `/api` to `http://localhost:8000`, so running the Django `runserver` and Vite dev server in parallel gives the same behaviour as production without requiring a build step.

---

## Testing

| Layer    | Framework          | Count |
|----------|--------------------|-------|
| Backend  | Django test runner | 66    |
| Frontend | Vitest             | 39    |
| E2E      | Playwright         | 8     |

See the root [`README.md`](../README.md) for running instructions.
