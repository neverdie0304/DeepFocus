"""
train_xgboost.py — Train XGBoost model for focus score prediction.

Three training strategies:
  1. ESM labels (best — requires sufficient labeled data)
  2. Semi-supervised pseudo-labeling (works with little ESM data)
  3. Post-session labels (weak supervision fallback)

Key evaluation: ML predictions vs Rule-based scores, both compared against
human ground truth (ESM / post-session self-reports).

Usage:
    python train_xgboost.py                    # Auto-selects best strategy
    python train_xgboost.py --target esm       # Force ESM labels
    python train_xgboost.py --target semi      # Force semi-supervised
"""

import argparse
import json
import warnings

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score, f1_score, mean_absolute_error, mean_squared_error,
)
from sklearn.model_selection import GroupKFold, KFold

from features import (
    ABLATION_FEATURE_SETS, ALL_FEATURES, BEHAVIORAL, CONTEXTUAL, TEMPORAL, VISUAL,
)
from paths import (
    DATASET_CSV, XGBOOST_CLASSIFIER, XGBOOST_REGRESSOR,
    XGBOOST_RESULTS_JSON, ensure_dirs,
)

warnings.filterwarnings("ignore")


def load_dataset():
    if not DATASET_CSV.exists():
        raise FileNotFoundError("Run feature_engineering.py first")
    return pd.read_csv(DATASET_CSV)


def score_to_3class(scores):
    """Convert continuous score to 3-class: low (<40), medium (40-70), high (>70)."""
    return pd.cut(scores, bins=[-1, 40, 70, 101], labels=["low", "medium", "high"])


# ═══════════════════════════════════════════════════
# Semi-supervised pseudo-labeling
# ═══════════════════════════════════════════════════

def generate_pseudo_labels(df):
    """
    Assign pseudo-labels based on high-confidence signal combinations.

    Clearly focused (5): face present + high confidence + active input + not idle
    Clearly distracted (1): face missing OR very long idle OR looking far away
    Uncertain (NaN): everything in between — model learns these
    """
    pseudo = pd.Series(np.nan, index=df.index)

    # ── Clearly focused (pseudo score = 5) ──
    focused_mask = (
        (df["face_confidence"].fillna(0) > 0.5) &      # face clearly detected
        (df["idle_duration"].fillna(0) < 5) &            # recently active
        (df["activity_level"].fillna(0) > 0.2) &         # some input activity
        (df["head_yaw"].fillna(0).abs() < 15) &          # looking at screen
        (df["head_pitch"].fillna(0).abs() < 15)
    )
    pseudo[focused_mask] = 5.0

    # ── Clearly distracted (pseudo score = 1) ──
    distracted_mask = (
        (df["face_confidence"].fillna(0) < 0.1) |       # no face
        (df["idle_duration"].fillna(0) > 30) |            # idle > 30s
        (df["head_yaw"].fillna(0).abs() > 40)             # looking far away
    )
    pseudo[distracted_mask] = 1.0

    # ── Somewhat focused (pseudo score = 4) ──
    somewhat_focused = (
        pseudo.isna() &
        (df["face_confidence"].fillna(0) > 0.3) &
        (df["idle_duration"].fillna(0) < 10) &
        (df["head_yaw"].fillna(0).abs() < 25)
    )
    pseudo[somewhat_focused] = 4.0

    # ── Somewhat distracted (pseudo score = 2) ──
    somewhat_distracted = (
        pseudo.isna() &
        ((df["idle_duration"].fillna(0) > 15) |
         (df["head_yaw"].fillna(0).abs() > 30))
    )
    pseudo[somewhat_distracted] = 2.0

    # ── Middle ground (pseudo score = 3) ──
    pseudo[pseudo.isna()] = 3.0

    return pseudo


def combine_labels(df):
    """
    Create the best available target by priority:
    1. ESM labels (highest quality — human in-the-moment rating)
    2. Post-session labels (scaled to 1-5 from 1-10)
    3. Pseudo-labels (signal-based heuristic)
    """
    target = pd.Series(np.nan, index=df.index)

    # Layer 3: pseudo-labels (base layer)
    pseudo = generate_pseudo_labels(df)
    target = pseudo.copy()

    # Layer 2: post-session labels override pseudo (if available)
    if "post_session_score" in df.columns:
        has_post = df["post_session_score"].notna()
        # Scale 1-10 → 1-5
        target[has_post] = df.loc[has_post, "post_session_score"] / 2.0

    # Layer 1: ESM labels override everything (highest quality)
    if "esm_score" in df.columns:
        has_esm = df["esm_score"].notna()
        target[has_esm] = df.loc[has_esm, "esm_score"]

    return target


# ═══════════════════════════════════════════════════
# Rule-based baseline evaluation
# ═══════════════════════════════════════════════════

def evaluate_rule_based_vs_ml(df, model, feature_cols, target_col):
    """
    The key thesis comparison: how does ML compare to rule-based
    when both are evaluated against human ground truth?
    """
    available = [f for f in feature_cols if f in df.columns]
    X = df[available].values

    ml_preds = model.predict(X)
    rule_scores = df["focus_score"].values  # rule-based predictions
    ground_truth = df[target_col].values

    # Scale rule-based (0-100) to same range as target (1-5)
    rule_scaled = rule_scores / 100.0 * 4.0 + 1.0  # maps 0-100 → 1-5

    ml_mae = mean_absolute_error(ground_truth, ml_preds)
    rule_mae = mean_absolute_error(ground_truth, rule_scaled)

    ml_rmse = np.sqrt(mean_squared_error(ground_truth, ml_preds))
    rule_rmse = np.sqrt(mean_squared_error(ground_truth, rule_scaled))

    # Correlation
    ml_corr = np.corrcoef(ground_truth, ml_preds)[0, 1]
    rule_corr = np.corrcoef(ground_truth, rule_scaled)[0, 1]

    return {
        "ml_mae": float(ml_mae),
        "rule_mae": float(rule_mae),
        "improvement_mae": float((rule_mae - ml_mae) / rule_mae * 100),
        "ml_rmse": float(ml_rmse),
        "rule_rmse": float(rule_rmse),
        "ml_correlation": float(ml_corr),
        "rule_correlation": float(rule_corr),
    }


# ═══════════════════════════════════════════════════
# Training functions
# ═══════════════════════════════════════════════════

def train_regression(df, feature_cols, target_col, groups=None):
    """Train XGBoost regressor with cross-validation."""
    try:
        from xgboost import XGBRegressor
    except ImportError:
        print("pip install xgboost")
        return None, {}

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

    if groups is not None and groups in df.columns and df[groups].nunique() >= 3:
        cv = GroupKFold(n_splits=min(5, df[groups].nunique()))
        splits = list(cv.split(X, y, groups=df[groups]))
    else:
        cv = KFold(n_splits=5, shuffle=True, random_state=42)
        splits = list(cv.split(X, y))

    mae_scores = []
    rmse_scores = []

    for train_idx, val_idx in splits:
        model.fit(X[train_idx], y[train_idx])
        preds = model.predict(X[val_idx])
        mae_scores.append(mean_absolute_error(y[val_idx], preds))
        rmse_scores.append(np.sqrt(mean_squared_error(y[val_idx], preds)))

    model.fit(X, y)

    return model, {
        "mae_mean": float(np.mean(mae_scores)),
        "mae_std": float(np.std(mae_scores)),
        "rmse_mean": float(np.mean(rmse_scores)),
        "rmse_std": float(np.std(rmse_scores)),
    }


def train_classifier(df, feature_cols, target_col, groups=None):
    """Train XGBoost 3-class classifier."""
    try:
        from xgboost import XGBClassifier
    except ImportError:
        print("pip install xgboost")
        return None, {}

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

    if groups is not None and groups in df.columns and df[groups].nunique() >= 3:
        cv = GroupKFold(n_splits=min(5, df[groups].nunique()))
        splits = list(cv.split(X, y, groups=df[groups]))
    else:
        cv = KFold(n_splits=5, shuffle=True, random_state=42)
        splits = list(cv.split(X, y))

    acc_scores = []
    f1_scores_list = []

    for train_idx, val_idx in splits:
        model.fit(X[train_idx], y[train_idx])
        preds = model.predict(X[val_idx])
        acc_scores.append(accuracy_score(y[val_idx], preds))
        f1_scores_list.append(f1_score(y[val_idx], preds, average="macro"))

    model.fit(X, y)

    return model, {
        "accuracy_mean": float(np.mean(acc_scores)),
        "accuracy_std": float(np.std(acc_scores)),
        "f1_macro_mean": float(np.mean(f1_scores_list)),
        "f1_macro_std": float(np.std(f1_scores_list)),
    }


def get_feature_importance(model, feature_cols):
    """Extract and rank feature importances."""
    importances = model.feature_importances_
    pairs = sorted(zip(feature_cols, importances), key=lambda x: -x[1])
    return {name: float(imp) for name, imp in pairs}


def run_ablation(df, target_col, groups=None):
    """Run ablation study: each modality alone + all combined."""
    results = {}
    for name, features in ABLATION_FEATURE_SETS.items():
        available = [f for f in features if f in df.columns]
        if not available:
            print(f"  Skipping {name}: no features available")
            continue

        print(f"  Training {name} ({len(available)} features)...")
        _, metrics = train_regression(df, available, target_col, groups)
        results[name] = metrics
        print(f"    MAE: {metrics['mae_mean']:.3f} ± {metrics['mae_std']:.3f}")

    return results


# ═══════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", choices=["esm", "semi", "auto"], default="auto",
                        help="Training strategy")
    args = parser.parse_args()

    ensure_dirs()

    print("Loading dataset...")
    df = load_dataset()
    print(f"  {len(df)} samples, {df['session_id'].nunique()} sessions")

    # ── Determine training strategy ──
    esm_count = df["esm_score"].notna().sum() if "esm_score" in df.columns else 0
    post_count = df["post_session_score"].notna().sum() if "post_session_score" in df.columns else 0
    print(f"  ESM labels: {esm_count}, Post-session labels: {post_count}")

    if args.target == "esm" and esm_count >= 50:
        strategy = "esm"
        df_train = df[df["esm_score"].notna()].copy()
        target_col = "esm_score"
        print(f"\n  Strategy: ESM direct ({len(df_train)} labeled samples)")
    elif args.target == "semi" or (args.target == "auto" and esm_count < 50):
        strategy = "semi"
        df_train = df.copy()
        df_train["combined_label"] = combine_labels(df_train)
        target_col = "combined_label"
        label_dist = df_train[target_col].value_counts().sort_index()
        print(f"\n  Strategy: Semi-supervised pseudo-labeling (all {len(df_train)} samples)")
        print(f"  Label distribution:\n{label_dist.to_string()}")
    else:
        strategy = "esm"
        df_train = df[df["esm_score"].notna()].copy()
        target_col = "esm_score"
        print(f"\n  Strategy: ESM direct ({len(df_train)} labeled samples)")

    available_features = [f for f in ALL_FEATURES if f in df_train.columns]
    print(f"  Available features: {len(available_features)}")

    # ── Regression ──
    print("\n═══ XGBoost Regression ═══")
    reg_model, reg_metrics = train_regression(df_train, available_features, target_col, "session_id")
    print(f"  MAE:  {reg_metrics['mae_mean']:.3f} ± {reg_metrics['mae_std']:.3f}")
    print(f"  RMSE: {reg_metrics['rmse_mean']:.3f} ± {reg_metrics['rmse_std']:.3f}")

    reg_model.save_model(str(XGBOOST_REGRESSOR))
    print(f"  Model saved → {XGBOOST_REGRESSOR}")

    # Feature importance
    importance = get_feature_importance(reg_model, available_features)
    print("\n  Top 10 features:")
    for i, (name, imp) in enumerate(list(importance.items())[:10]):
        print(f"    {i+1}. {name}: {imp:.4f}")

    # ── Classification ──
    print("\n═══ XGBoost 3-Class Classifier ═══")
    # Scale target to 0-100 range for 3-class binning
    df_cls = df_train.copy()
    df_cls["target_scaled"] = df_cls[target_col] / 5.0 * 100  # 1-5 → 20-100
    cls_model, cls_metrics = train_classifier(df_cls, available_features, "target_scaled", "session_id")
    print(f"  Accuracy: {cls_metrics['accuracy_mean']:.3f} ± {cls_metrics['accuracy_std']:.3f}")
    print(f"  F1 Macro: {cls_metrics['f1_macro_mean']:.3f} ± {cls_metrics['f1_macro_std']:.3f}")

    cls_model.save_model(str(XGBOOST_CLASSIFIER))

    # ── Rule-Based vs ML Comparison (THE KEY RESULT) ──
    print("\n═══ Rule-Based vs ML Comparison ═══")
    comparison = evaluate_rule_based_vs_ml(df_train, reg_model, available_features, target_col)
    print(f"  ML MAE:        {comparison['ml_mae']:.3f}")
    print(f"  Rule-based MAE:{comparison['rule_mae']:.3f}")
    print(f"  Improvement:   {comparison['improvement_mae']:.1f}%")
    print(f"  ML Corr:       {comparison['ml_correlation']:.3f}")
    print(f"  Rule-based Corr:{comparison['rule_correlation']:.3f}")

    # ── Ablation Study ──
    print("\n═══ Ablation Study ═══")
    ablation_results = run_ablation(df_train, target_col, "session_id")

    # ── Save all results ──
    all_results = {
        "strategy": strategy,
        "target": target_col,
        "n_samples": len(df_train),
        "n_sessions": int(df_train["session_id"].nunique()),
        "esm_labels": int(esm_count),
        "post_session_labels": int(post_count),
        "regression": reg_metrics,
        "classification": cls_metrics,
        "rule_vs_ml": comparison,
        "feature_importance": importance,
        "ablation": ablation_results,
    }

    with open(XGBOOST_RESULTS_JSON, "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"\nAll results saved → {XGBOOST_RESULTS_JSON}")


if __name__ == "__main__":
    main()
