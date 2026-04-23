"""
ml/paths.py

Canonical filesystem paths used by the offline ML pipeline.
Centralised so individual scripts never hard-code directory layouts.
"""
from __future__ import annotations

from pathlib import Path

ML_DIR = Path(__file__).resolve().parent

DATA_DIR = ML_DIR / "data"
MODEL_DIR = ML_DIR / "models"
RESULTS_DIR = ML_DIR / "results"

# Inputs (created by export_data.py / feature_engineering.py).
EVENTS_CSV = DATA_DIR / "events.csv"
SELF_REPORTS_CSV = DATA_DIR / "self_reports.csv"
DATASET_CSV = DATA_DIR / "dataset.csv"
SCALER_PARAMS_JSON = DATA_DIR / "scaler_params.json"

# Trained model artefacts.
XGBOOST_REGRESSOR = MODEL_DIR / "xgboost_regressor.json"
XGBOOST_CLASSIFIER = MODEL_DIR / "xgboost_classifier.json"
LSTM_MODEL = MODEL_DIR / "lstm_model.keras"
LSTM_SAVED_MODEL = MODEL_DIR / "lstm_saved_model"
XGB_STUDENT_SAVED_MODEL = MODEL_DIR / "xgb_student_saved_model"

# Evaluation outputs.
XGBOOST_RESULTS_JSON = RESULTS_DIR / "xgboost_results.json"
LSTM_RESULTS_JSON = RESULTS_DIR / "lstm_results.json"

# Deployment target (browser public directory).
FRONTEND_MODELS_DIR = ML_DIR.parent / "frontend" / "public" / "models"


def ensure_dirs() -> None:
    """Create all output directories if they do not yet exist."""
    for d in (DATA_DIR, MODEL_DIR, RESULTS_DIR):
        d.mkdir(parents=True, exist_ok=True)
