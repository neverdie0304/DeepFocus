# DeepFocus

A multimodal, browser-native concentration detection system. Combines visual signals from a webcam (via MediaPipe Face Mesh), behavioural signals from keyboard and mouse, and contextual signals from browser APIs to estimate focus in real time — all without sending any raw video or audio off the device.

Developed as an MSc Individual Project at King's College London.

---

## Key Features

- **36-dimensional feature vector** per 2-second sample across four modalities (visual, behavioural, contextual, temporal).
- **Privacy-preserving:** all webcam processing runs locally in the browser via WebAssembly. Only numerical features leave the client.
- **Dual scoring:** a deterministic rule-based scorer for interpretability and fallback, plus a machine-learned scorer (XGBoost → TensorFlow.js) for nuanced, context-aware estimation.
- **Ground-truth collection:** Experience Sampling Method (ESM) popups during sessions and post-session ratings, supporting a three-layer label strategy for ML training.
- **Full session lifecycle:** task-type selection, periodic event upload (crash-safe), pause/resume, history, per-session reports, deletion.
- **Tested:** 105+ automated tests (Django unit tests, Vitest component tests, Playwright end-to-end).
- **Deployable:** single-service deploy on Render.com via `render.yaml`; Django serves the built React bundle through WhiteNoise.

---

## Architecture

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                    Browser (React + Vite + TF.js)                 │
 │                                                                    │
 │   MediaPipe Face Mesh  ──►  Visual features   (20)                │
 │   DOM event listeners  ──►  Behavioural features (7)              │
 │   Visibility / Focus   ──►  Contextual features  (4)              │
 │   EMA / trend buffers  ──►  Temporal features    (4)              │
 │                                                                    │
 │                          ▼                                         │
 │                 Feature vector (36)                                │
 │                          ▼                                         │
 │     Rule-based scorer ◄─── fallback ──► TF.js ML model             │
 │                          ▼                                         │
 │                  focus_score (0–100)                               │
 └──────────────────────────────────────────────────────────────────┘
                                  │  HTTPS / JWT
                                  ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │             Backend (Django REST + SQLite + WhiteNoise)            │
 │     /api/auth/*  /api/sessions/*  /api/ml/export/  /api/analytics  │
 └──────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼ (offline, for thesis evaluation)
 ┌──────────────────────────────────────────────────────────────────┐
 │                  ML pipeline (Python + XGBoost)                    │
 │  export_data.py → feature_engineering.py → train_xgboost.py        │
 │       → evaluate.py → export_tfjs.py → deployed TF.js model        │
 └──────────────────────────────────────────────────────────────────┘
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a deeper technical dive.

---

## Quick Start (local development)

### Prerequisites

- Python 3.12+
- Node.js 20+
- A working webcam (optional — camera-off mode is fully supported)

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # edit as needed
python manage.py migrate
python manage.py runserver 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                    # http://localhost:5173
```

The dev server proxies `/api` to `http://localhost:8000` automatically.

### First run

1. Navigate to `http://localhost:5173`.
2. Sign up for an account.
3. Grant camera permission (or continue without).
4. Choose a task type and start a session.
5. ESM popups appear at random intervals — answer honestly for ground-truth data.
6. End the session to see the report, or manage past sessions from the dashboard.

---

## Running Tests

```bash
# Backend — 66 Django tests
cd backend && python manage.py test api.tests

# Frontend unit — 39 Vitest tests
cd frontend && npm test

# End-to-end — Playwright specs (requires both servers running)
cd frontend && npm run test:e2e
```

---

## ML Pipeline (offline)

```bash
cd ml
pip install -r requirements.txt

python export_data.py              # SQLite → CSV
python feature_engineering.py      # Clean, normalise, align labels
python train_xgboost.py            # Train + ablation study
python evaluate.py                 # Generate plots/tables
python export_tfjs.py              # Distill → TF.js model
```

The exported TF.js artefact is written to `frontend/public/models/focus_model/` and loaded automatically at runtime. If absent, the system falls back to the rule-based scorer without interruption.

---

## Deployment

A one-click deploy to Render.com is configured via [`render.yaml`](render.yaml). The build script ([`build.sh`](build.sh)) installs frontend and backend dependencies, builds the React bundle, collects static files, and runs database migrations.

Required environment variables in production:

| Variable | Example |
|----------|---------|
| `DEBUG` | `false` |
| `DJANGO_SECRET_KEY` | (randomly generated) |
| `ALLOWED_HOSTS` | `.onrender.com` |

---

## Repository Layout

```
DeepFocus/
├── README.md                  This file
├── LICENSE                    MIT
├── render.yaml                Render.com deployment config
├── build.sh                   Combined build script
│
├── backend/                   Django REST backend
│   ├── api/                   Main app (models, views, serializers, tests)
│   ├── deepfocus/             Project settings and URL router
│   ├── manage.py
│   └── requirements.txt
│
├── frontend/                  React + Vite client
│   ├── src/
│   │   ├── api/               Axios client and endpoint wrappers
│   │   ├── components/        Reusable UI components
│   │   ├── context/           AuthContext (JWT management)
│   │   ├── hooks/             Feature extraction hooks
│   │   ├── ml/                TF.js model loader and inference
│   │   ├── pages/             Page-level components
│   │   ├── utils/             Scoring, feature assembly, helpers
│   │   └── test/              Vitest setup
│   ├── e2e/                   Playwright specs
│   └── package.json
│
├── ml/                        Offline training pipeline
│   ├── export_data.py
│   ├── feature_engineering.py
│   ├── train_xgboost.py
│   ├── train_lstm.py
│   ├── evaluate.py
│   ├── export_tfjs.py
│   └── requirements.txt
│
└── docs/                      Documentation and thesis chapters
    ├── ARCHITECTURE.md
    └── thesis/                Chapters 1, 3, 6 and Literature Review
```

---

## Third-Party Components and Licences

| Component | Licence | Role |
|-----------|---------|------|
| MediaPipe Tasks Vision | Apache 2.0 | Face detection and landmark regression |
| React, Vite, TailwindCSS | MIT | Frontend framework and tooling |
| Chart.js, axios | MIT | Visualisation, HTTP client |
| TensorFlow.js | Apache 2.0 | Browser-side ML inference |
| Django, DRF, simplejwt | BSD / MIT | Backend framework and JWT auth |
| XGBoost, pandas, scikit-learn | Apache 2.0 / BSD | ML training |

See [docs/thesis/Chapter_6_Legal_Social_Ethical.md](docs/thesis/Chapter_6_Legal_Social_Ethical.md) for a full discussion of licensing, privacy, and ethics.

---

## Licence

DeepFocus is released under the [MIT Licence](LICENSE).

---

## Acknowledgements

This work builds on the MediaPipe Face Landmarker model released by Google, the Django and React open-source communities, and the substantial body of literature on attention, engagement detection, and multimodal sensing cited throughout the thesis.
