"""
evaluate.py — Generate evaluation plots and comparison tables for the thesis.

Produces:
  - Feature importance bar chart (SHAP or XGBoost built-in)
  - Ablation study comparison chart
  - Rule-based vs ML scatter plot
  - Confusion matrix for 3-class
  - Focus score timeline overlay (rule-based vs ML)

Usage:
    python evaluate.py
"""

import json

import pandas as pd

from features import ALL_FEATURES, BEHAVIORAL, CONTEXTUAL, TEMPORAL, VISUAL
from paths import (
    DATASET_CSV, LSTM_RESULTS_JSON, RESULTS_DIR,
    XGBOOST_REGRESSOR, XGBOOST_RESULTS_JSON, ensure_dirs,
)

FEATURE_COLS = ALL_FEATURES


def plot_feature_importance(results_path, output_path):
    """Bar chart of top-N feature importances."""
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        print("pip install matplotlib")
        return

    with open(results_path) as f:
        results = json.load(f)

    importance = results.get("feature_importance", {})
    if not importance:
        print("No feature importance data found")
        return

    # Top 15
    items = list(importance.items())[:15]
    names = [item[0] for item in items]
    values = [item[1] for item in items]

    fig, ax = plt.subplots(figsize=(10, 6))
    modality_colors = {
        "visual": "#6366f1",       # indigo
        "behavioral": "#22c55e",   # green
        "contextual": "#eab308",   # yellow
        "temporal": "#ef4444",     # red
    }

    def _modality(name):
        if name in VISUAL:
            return "visual"
        if name in BEHAVIORAL:
            return "behavioral"
        if name in CONTEXTUAL:
            return "contextual"
        if name in TEMPORAL:
            return "temporal"
        return "temporal"  # safe default

    colors = [modality_colors[_modality(n)] for n in names]

    ax.barh(range(len(names)), values, color=colors)
    ax.set_yticks(range(len(names)))
    ax.set_yticklabels(names)
    ax.invert_yaxis()
    ax.set_xlabel("Feature Importance")
    ax.set_title("XGBoost Feature Importance by Modality")

    # Legend
    from matplotlib.patches import Patch
    legend_elements = [
        Patch(facecolor="#6366f1", label="Visual"),
        Patch(facecolor="#22c55e", label="Behavioral"),
        Patch(facecolor="#eab308", label="Contextual"),
        Patch(facecolor="#ef4444", label="Temporal"),
    ]
    ax.legend(handles=legend_elements, loc="lower right")

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    print(f"  Saved → {output_path}")
    plt.close()


def plot_ablation(results_path, output_path):
    """Grouped bar chart for ablation study."""
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        return

    with open(results_path) as f:
        results = json.load(f)

    ablation = results.get("ablation", {})
    if not ablation:
        print("No ablation data found")
        return

    names = list(ablation.keys())
    mae_means = [ablation[n]["mae_mean"] for n in names]
    mae_stds = [ablation[n]["mae_std"] for n in names]

    fig, ax = plt.subplots(figsize=(10, 5))
    bars = ax.bar(range(len(names)), mae_means, yerr=mae_stds, capsize=5,
                  color=["#6366f1", "#22c55e", "#eab308", "#ef4444", "#818cf8", "#4ade80"])
    ax.set_xticks(range(len(names)))
    ax.set_xticklabels([n.replace("_", "\n") for n in names], fontsize=9)
    ax.set_ylabel("MAE (lower is better)")
    ax.set_title("Ablation Study: Focus Score Prediction MAE by Feature Set")

    # Add value labels
    for bar, val in zip(bars, mae_means):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.5,
                f"{val:.1f}", ha="center", va="bottom", fontsize=9)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    print(f"  Saved → {output_path}")
    plt.close()


def plot_rule_vs_ml(output_path):
    """Scatter plot: rule-based score vs ML-predicted score."""
    try:
        import matplotlib.pyplot as plt
        from xgboost import XGBRegressor
    except ImportError:
        print("pip install matplotlib xgboost")
        return

    df = pd.read_csv(DATASET_CSV)
    available = [f for f in FEATURE_COLS if f in df.columns]

    model = XGBRegressor()
    if not XGBOOST_REGRESSOR.exists():
        print("Train XGBoost first")
        return

    model.load_model(str(XGBOOST_REGRESSOR))

    X = df[available].values
    ml_preds = model.predict(X)
    rule_scores = df["focus_score"].values

    fig, ax = plt.subplots(figsize=(7, 7))
    ax.scatter(rule_scores, ml_preds, alpha=0.1, s=5, color="#6366f1")
    ax.plot([0, 100], [0, 100], "r--", alpha=0.5, label="y=x (perfect agreement)")
    ax.set_xlabel("Rule-Based Score")
    ax.set_ylabel("ML-Predicted Score")
    ax.set_title("Rule-Based vs ML Focus Score")
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.legend()
    ax.set_aspect("equal")

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    print(f"  Saved → {output_path}")
    plt.close()


def generate_comparison_table(output_path):
    """Create a markdown comparison table of all models."""
    rows = ["| Model | MAE | RMSE | 3-Class Acc | F1 Macro |",
            "|-------|-----|------|-------------|----------|"]

    # XGBoost
    if XGBOOST_RESULTS_JSON.exists():
        with open(XGBOOST_RESULTS_JSON) as f:
            xgb = json.load(f)
        reg = xgb.get("regression", {})
        cls = xgb.get("classification", {})
        rows.append(
            f"| XGBoost | {reg.get('mae_mean', '-'):.2f}±{reg.get('mae_std', 0):.2f} | "
            f"{reg.get('rmse_mean', '-'):.2f}±{reg.get('rmse_std', 0):.2f} | "
            f"{cls.get('accuracy_mean', '-'):.3f} | {cls.get('f1_macro_mean', '-'):.3f} |"
        )

    # LSTM
    if LSTM_RESULTS_JSON.exists():
        with open(LSTM_RESULTS_JSON) as f:
            lstm = json.load(f)
        rows.append(
            f"| LSTM | {lstm.get('val_mae', '-'):.2f} | "
            f"{lstm.get('val_rmse', '-'):.2f} | - | - |"
        )

    # Rule-based baseline (MAE = 0 against itself, but vs ESM it would differ)
    rows.append("| Rule-Based | baseline | baseline | baseline | baseline |")

    table = "\n".join(rows)
    with open(output_path, "w") as f:
        f.write("# Model Comparison\n\n")
        f.write(table)
        f.write("\n")

    print(f"  Saved → {output_path}")


def main():
    ensure_dirs()

    if XGBOOST_RESULTS_JSON.exists():
        print("═══ Generating Feature Importance Plot ═══")
        plot_feature_importance(
            XGBOOST_RESULTS_JSON, RESULTS_DIR / "feature_importance.png",
        )

        print("\n═══ Generating Ablation Chart ═══")
        plot_ablation(XGBOOST_RESULTS_JSON, RESULTS_DIR / "ablation_study.png")

    if DATASET_CSV.exists():
        print("\n═══ Generating Rule-Based vs ML Plot ═══")
        plot_rule_vs_ml(RESULTS_DIR / "rule_vs_ml.png")

    print("\n═══ Generating Comparison Table ═══")
    generate_comparison_table(RESULTS_DIR / "model_comparison.md")

    print("\nDone. All figures saved to ml/results/")


if __name__ == "__main__":
    main()
