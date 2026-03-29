"""
train_xgboost.py — Train XGBoost model for focus score prediction.

Supports two modes:
  1. Regression on ESM score (1-5) when ESM labels are available
  2. 3-class classification (low/medium/high) using rule-based score as proxy

Usage:
    python train_xgboost.py
    python train_xgboost.py --target esm      # Use ESM labels (requires labeled data)
    python train_xgboost.py --target proxy     # Use rule-based score as proxy target
"""

import argparse
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold, cross_val_score
from sklearn.metrics import (
    mean_absolute_error, mean_squared_error, accuracy_score,
    f1_score, classification_report, confusion_matrix,
)

warnings.filterwarnings("ignore")

DATA_DIR = Path(__file__).parent / "data"
MODEL_DIR = Path(__file__).parent / "models"
RESULTS_DIR = Path(__file__).parent / "results"

# Feature groups for ablation
VISUAL = [
    "head_yaw", "head_pitch", "head_roll",
    "ear_left", "ear_right", "gaze_x", "gaze_y", "face_confidence",
]
BEHAVIORAL = [
    "keystroke_rate", "mouse_velocity", "mouse_distance",
    "click_rate", "scroll_rate", "idle_duration", "activity_level",
]
CONTEXTUAL = [
    "tab_switch_count", "window_blur_count",
    "time_since_tab_return", "session_elapsed_ratio",
]
TEMPORAL = [
    "focus_ema_30s", "focus_ema_5min", "focus_trend", "distraction_burst_count",
]
ALL_FEATURES = VISUAL + BEHAVIORAL + CONTEXTUAL + TEMPORAL


def load_dataset():
    path = DATA_DIR / "dataset.csv"
    if not path.exists():
        raise FileNotFoundError("Run feature_engineering.py first")
    return pd.read_csv(path)


def score_to_3class(scores):
    """Convert continuous score to 3-class: low (<40), medium (40-70), high (>70)."""
    return pd.cut(scores, bins=[-1, 40, 70, 101], labels=["low", "medium", "high"])


def train_regression(df, feature_cols, target_col, groups=None):
    """Train XGBoost regressor with cross-validation."""
    try:
        from xgboost import XGBRegressor
    except ImportError:
        print("pip install xgboost")
        return None

    X = df[feature_cols].values
    y = df[target_col].values

    model = XGBRegressor(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
    )

    # Cross-validation
    if groups is not None and df[groups].nunique() >= 3:
        cv = GroupKFold(n_splits=min(5, df[groups].nunique()))
        splits = cv.split(X, y, groups=df[groups])
    else:
        from sklearn.model_selection import KFold
        cv = KFold(n_splits=5, shuffle=True, random_state=42)
        splits = cv.split(X, y)

    mae_scores = []
    rmse_scores = []

    for train_idx, val_idx in splits:
        model.fit(X[train_idx], y[train_idx])
        preds = model.predict(X[val_idx])
        mae_scores.append(mean_absolute_error(y[val_idx], preds))
        rmse_scores.append(np.sqrt(mean_squared_error(y[val_idx], preds)))

    # Train final model on all data
    model.fit(X, y)

    return model, {
        "mae_mean": np.mean(mae_scores),
        "mae_std": np.std(mae_scores),
        "rmse_mean": np.mean(rmse_scores),
        "rmse_std": np.std(rmse_scores),
    }


def train_classifier(df, feature_cols, target_col, groups=None):
    """Train XGBoost 3-class classifier with cross-validation."""
    try:
        from xgboost import XGBClassifier
    except ImportError:
        print("pip install xgboost")
        return None

    X = df[feature_cols].values
    y_labels = score_to_3class(df[target_col])
    label_map = {"low": 0, "medium": 1, "high": 2}
    y = y_labels.map(label_map).values

    model = XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        use_label_encoder=False,
        eval_metric="mlogloss",
        random_state=42,
    )

    if groups is not None and df[groups].nunique() >= 3:
        cv = GroupKFold(n_splits=min(5, df[groups].nunique()))
        splits = cv.split(X, y, groups=df[groups])
    else:
        from sklearn.model_selection import KFold
        cv = KFold(n_splits=5, shuffle=True, random_state=42)
        splits = cv.split(X, y)

    acc_scores = []
    f1_scores = []

    for train_idx, val_idx in splits:
        model.fit(X[train_idx], y[train_idx])
        preds = model.predict(X[val_idx])
        acc_scores.append(accuracy_score(y[val_idx], preds))
        f1_scores.append(f1_score(y[val_idx], preds, average="macro"))

    # Final model
    model.fit(X, y)

    return model, {
        "accuracy_mean": np.mean(acc_scores),
        "accuracy_std": np.std(acc_scores),
        "f1_macro_mean": np.mean(f1_scores),
        "f1_macro_std": np.std(f1_scores),
    }


def get_feature_importance(model, feature_cols):
    """Extract and rank feature importances."""
    importances = model.feature_importances_
    pairs = sorted(zip(feature_cols, importances), key=lambda x: -x[1])
    return {name: float(imp) for name, imp in pairs}


def run_ablation(df, target_col, groups=None):
    """Run ablation study: each modality alone + all combined."""
    feature_sets = {
        "visual_only": VISUAL,
        "behavioral_only": BEHAVIORAL,
        "contextual_only": CONTEXTUAL,
        "temporal_only": TEMPORAL,
        "visual+behavioral": VISUAL + BEHAVIORAL,
        "all_features": ALL_FEATURES,
    }

    results = {}
    for name, features in feature_sets.items():
        available = [f for f in features if f in df.columns]
        if not available:
            print(f"  Skipping {name}: no features available")
            continue

        print(f"  Training {name} ({len(available)} features)...")
        _, metrics = train_regression(df, available, target_col, groups)
        results[name] = metrics
        print(f"    MAE: {metrics['mae_mean']:.3f} ± {metrics['mae_std']:.3f}")

    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", choices=["esm", "proxy"], default="proxy",
                        help="Target: 'esm' for ESM labels, 'proxy' for rule-based score")
    args = parser.parse_args()

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading dataset...")
    df = load_dataset()
    print(f"  {len(df)} samples, {df['session_id'].nunique()} sessions")

    # Determine target column
    if args.target == "esm":
        labeled = df[df["esm_score"].notna()]
        if len(labeled) < 50:
            print(f"  Only {len(labeled)} ESM-labeled samples. Need ≥50. Falling back to proxy.")
            target_col = "focus_score"
            df_train = df
        else:
            target_col = "esm_score"
            df_train = labeled
            print(f"  Using {len(df_train)} ESM-labeled samples")
    else:
        target_col = "focus_score"
        df_train = df

    available_features = [f for f in ALL_FEATURES if f in df_train.columns]
    print(f"  Available features: {len(available_features)}")

    # ── Regression ──
    print("\n═══ XGBoost Regression ═══")
    reg_model, reg_metrics = train_regression(df_train, available_features, target_col, "session_id")
    print(f"  MAE:  {reg_metrics['mae_mean']:.3f} ± {reg_metrics['mae_std']:.3f}")
    print(f"  RMSE: {reg_metrics['rmse_mean']:.3f} ± {reg_metrics['rmse_std']:.3f}")

    # Save model
    reg_model.save_model(str(MODEL_DIR / "xgboost_regressor.json"))
    print(f"  Model saved → {MODEL_DIR / 'xgboost_regressor.json'}")

    # Feature importance
    importance = get_feature_importance(reg_model, available_features)
    print("\n  Top 10 features:")
    for i, (name, imp) in enumerate(list(importance.items())[:10]):
        print(f"    {i+1}. {name}: {imp:.4f}")

    # ── Classification ──
    print("\n═══ XGBoost 3-Class Classifier ═══")
    cls_model, cls_metrics = train_classifier(df_train, available_features, target_col, "session_id")
    print(f"  Accuracy: {cls_metrics['accuracy_mean']:.3f} ± {cls_metrics['accuracy_std']:.3f}")
    print(f"  F1 Macro: {cls_metrics['f1_macro_mean']:.3f} ± {cls_metrics['f1_macro_std']:.3f}")

    cls_model.save_model(str(MODEL_DIR / "xgboost_classifier.json"))
    print(f"  Model saved → {MODEL_DIR / 'xgboost_classifier.json'}")

    # ── Ablation Study ──
    print("\n═══ Ablation Study ═══")
    ablation_results = run_ablation(df_train, target_col, "session_id")

    # ── Save all results ──
    all_results = {
        "target": target_col,
        "n_samples": len(df_train),
        "n_sessions": int(df_train["session_id"].nunique()),
        "regression": reg_metrics,
        "classification": cls_metrics,
        "feature_importance": importance,
        "ablation": ablation_results,
    }

    results_path = RESULTS_DIR / "xgboost_results.json"
    with open(results_path, "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"\nAll results saved → {results_path}")


if __name__ == "__main__":
    main()
