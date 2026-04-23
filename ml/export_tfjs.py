"""
export_tfjs.py — Convert trained models to TensorFlow.js format
for browser-side inference in DeepFocus.

Approach:
  - XGBoost: Retrain as a small TF neural net that mimics XGBoost predictions
    (knowledge distillation), then convert to TF.js.
  - LSTM: Direct TF SavedModel → TF.js conversion.

Usage:
    python export_tfjs.py --model xgboost   # Distill XGBoost → TF.js
    python export_tfjs.py --model lstm      # Convert LSTM → TF.js
"""

import argparse
import json

import numpy as np
import pandas as pd

from features import ALL_FEATURES
from paths import (
    DATASET_CSV, FRONTEND_MODELS_DIR, LSTM_SAVED_MODEL, MODEL_DIR,
    XGB_STUDENT_SAVED_MODEL, XGBOOST_REGRESSOR,
)

FEATURE_COLS = ALL_FEATURES


def distill_xgboost_to_tfjs():
    """
    Knowledge distillation: Train a small MLP to mimic XGBoost predictions,
    then convert to TF.js.
    """
    try:
        import tensorflow as tf
        from xgboost import XGBRegressor
    except ImportError:
        print("pip install tensorflow xgboost")
        return

    # Load data
    df = pd.read_csv(DATASET_CSV)
    available = [f for f in FEATURE_COLS if f in df.columns]
    X = df[available].values.astype(np.float32)

    # Generate teacher predictions
    teacher = XGBRegressor()
    teacher.load_model(str(XGBOOST_REGRESSOR))
    y_teacher = teacher.predict(X).astype(np.float32)

    # Build tiny student model
    student = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(len(available),)),
        tf.keras.layers.Dense(32, activation="relu"),
        tf.keras.layers.Dense(16, activation="relu"),
        tf.keras.layers.Dense(1),
    ])
    student.compile(optimizer="adam", loss="mse", metrics=["mae"])

    # Train student on teacher's predictions
    student.fit(X, y_teacher, epochs=100, batch_size=64, validation_split=0.1,
                verbose=1, callbacks=[
                    tf.keras.callbacks.EarlyStopping(patience=10, restore_best_weights=True),
                ])

    # Evaluate distillation quality
    preds = student.predict(X, verbose=0).flatten()
    mae = float(np.mean(np.abs(y_teacher - preds)))
    print(f"\nDistillation MAE (student vs teacher): {mae:.3f}")

    # Save as TF SavedModel
    saved_path = XGB_STUDENT_SAVED_MODEL
    student.export(str(saved_path))

    # Convert to TF.js
    output_dir = FRONTEND_MODELS_DIR / "focus_model"
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        import subprocess
        result = subprocess.run([
            "tensorflowjs_converter",
            "--input_format=tf_saved_model",
            "--output_format=tfjs_graph_model",
            str(saved_path),
            str(output_dir),
        ], capture_output=True, text=True)

        if result.returncode == 0:
            print(f"TF.js model saved → {output_dir}")

            # Check model size
            total_size = sum(f.stat().st_size for f in output_dir.rglob("*") if f.is_file())
            print(f"Total model size: {total_size / 1024:.1f} KB")
        else:
            print(f"TF.js conversion failed: {result.stderr}")
            print("Try: pip install tensorflowjs")
    except FileNotFoundError:
        print("tensorflowjs_converter not found. Install: pip install tensorflowjs")
        # Fallback: save as Keras and let user convert manually
        student.save(str(MODEL_DIR / "xgb_student.keras"))
        print(f"Keras model saved → {MODEL_DIR / 'xgb_student.keras'}")
        print("Convert manually: tensorflowjs_converter --input_format=keras "
              f"{MODEL_DIR / 'xgb_student.keras'} {output_dir}")

    # Save feature list for frontend
    meta = {
        "features": available,
        "distillation_mae": mae,
        "model_type": "xgboost_distilled",
    }
    with open(output_dir / "model_meta.json", "w") as f:
        json.dump(meta, f, indent=2)


def convert_lstm_to_tfjs():
    """Direct conversion of LSTM SavedModel to TF.js."""
    saved_path = LSTM_SAVED_MODEL
    if not saved_path.exists():
        print(f"LSTM SavedModel not found at {saved_path}")
        print("Run train_lstm.py first")
        return

    output_dir = FRONTEND_MODELS_DIR / "focus_lstm_model"
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        import subprocess
        result = subprocess.run([
            "tensorflowjs_converter",
            "--input_format=tf_saved_model",
            "--output_format=tfjs_graph_model",
            str(saved_path),
            str(output_dir),
        ], capture_output=True, text=True)

        if result.returncode == 0:
            print(f"TF.js LSTM model saved → {output_dir}")
            total_size = sum(f.stat().st_size for f in output_dir.rglob("*") if f.is_file())
            print(f"Total model size: {total_size / 1024:.1f} KB")
        else:
            print(f"Conversion failed: {result.stderr}")
    except FileNotFoundError:
        print("tensorflowjs_converter not found. Install: pip install tensorflowjs")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=["xgboost", "lstm", "all"], default="xgboost")
    args = parser.parse_args()

    if args.model in ("xgboost", "all"):
        print("═══ Distilling XGBoost → TF.js ═══")
        distill_xgboost_to_tfjs()

    if args.model in ("lstm", "all"):
        print("\n═══ Converting LSTM → TF.js ═══")
        convert_lstm_to_tfjs()


if __name__ == "__main__":
    main()
