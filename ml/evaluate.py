"""
evaluate.py — Generate evaluation plots and comparison tables for the thesis.

Produces:
  - Feature importance bar chart (XGBoost built-in)
  - Ablation study comparison chart (RQ3)
  - 3-class confusion matrix heatmap (RQ1 — classification metrics)
  - Rule-based vs ML scatter plot (sanity check, not a main result —
    rule-based is retained as a graceful-degradation fallback only,
    see thesis Chapter 3.4.3)
  - Markdown comparison table covering MAE, RMSE, accuracy, macro
    precision, macro recall, and macro F1 — the metric set called for
    in supervisor feedback on the evaluation chapter.

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


def plot_confusion_matrix(results_path, output_path):
    """Render the aggregated 3-class confusion matrix as a heatmap.

    Reads the ``classification.confusion_matrix`` block written by
    ``train_xgboost.py``, where the matrix is summed across all folds
    of the cross-validation.
    """
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        print("pip install matplotlib")
        return

    with open(results_path) as f:
        results = json.load(f)

    cls = results.get("classification", {})
    cm = cls.get("confusion_matrix")
    labels = cls.get("confusion_matrix_labels", ["low", "medium", "high"])
    if not cm:
        print("No confusion matrix in results")
        return

    import numpy as np
    cm_arr = np.array(cm)
    # Row-normalised (recall-style): each row sums to 1.
    cm_norm = cm_arr / cm_arr.sum(axis=1, keepdims=True).clip(min=1)

    fig, ax = plt.subplots(figsize=(5.5, 5))
    im = ax.imshow(cm_norm, cmap="Blues", vmin=0, vmax=1)
    ax.set_xticks(range(len(labels)))
    ax.set_yticks(range(len(labels)))
    ax.set_xticklabels(labels)
    ax.set_yticklabels(labels)
    ax.set_xlabel("Predicted class")
    ax.set_ylabel("True class")
    ax.set_title("3-class concentration: confusion matrix\n(row-normalised, summed across folds)")

    # Annotate each cell with both raw count and normalised proportion.
    for i in range(len(labels)):
        for j in range(len(labels)):
            colour = "white" if cm_norm[i, j] > 0.5 else "black"
            ax.text(j, i, f"{cm_arr[i, j]}\n({cm_norm[i, j]:.2f})",
                    ha="center", va="center", color=colour, fontsize=10)

    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    print(f"  Saved → {output_path}")
    plt.close()


def generate_comparison_table(output_path):
    """Create a markdown comparison table of all models.

    The XGBoost row carries the full RQ1 metric set: regression
    (MAE, RMSE) and classification (accuracy, macro precision, macro
    recall, macro F1) — the four classification metrics requested by
    the supervisor's evaluation guidance.
    """
    header = (
        "| Model | MAE | RMSE | Accuracy | Precision | Recall | F1 Macro |"
    )
    sep = "|-------|-----|------|----------|-----------|--------|----------|"
    rows = [header, sep]

    # XGBoost
    if XGBOOST_RESULTS_JSON.exists():
        with open(XGBOOST_RESULTS_JSON) as f:
            xgb = json.load(f)
        reg = xgb.get("regression", {})
        cls = xgb.get("classification", {})

        def _fmt(d, mean_key, std_key, dp=3):
            mean = d.get(mean_key)
            std = d.get(std_key)
            if mean is None:
                return "—"
            return f"{mean:.{dp}f}±{std:.{dp}f}" if std is not None else f"{mean:.{dp}f}"

        rows.append(
            f"| XGBoost | {_fmt(reg, 'mae_mean', 'mae_std', 2)} | "
            f"{_fmt(reg, 'rmse_mean', 'rmse_std', 2)} | "
            f"{_fmt(cls, 'accuracy_mean', 'accuracy_std')} | "
            f"{_fmt(cls, 'precision_macro_mean', 'precision_macro_std')} | "
            f"{_fmt(cls, 'recall_macro_mean', 'recall_macro_std')} | "
            f"{_fmt(cls, 'f1_macro_mean', 'f1_macro_std')} |"
        )

    # LSTM
    if LSTM_RESULTS_JSON.exists():
        with open(LSTM_RESULTS_JSON) as f:
            lstm = json.load(f)
        rows.append(
            f"| LSTM | {lstm.get('val_mae', '-'):.2f} | "
            f"{lstm.get('val_rmse', '-'):.2f} | — | — | — | — |"
        )

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

        print("\n═══ Generating Confusion Matrix ═══")
        plot_confusion_matrix(
            XGBOOST_RESULTS_JSON, RESULTS_DIR / "confusion_matrix.png",
        )

    if DATASET_CSV.exists():
        print("\n═══ Generating Rule-Based vs ML Plot ═══")
        plot_rule_vs_ml(RESULTS_DIR / "rule_vs_ml.png")

    print("\n═══ Generating Comparison Table ═══")
    generate_comparison_table(RESULTS_DIR / "model_comparison.md")

    print("\nDone. All figures saved to ml/results/")


if __name__ == "__main__":
    main()
