"""
train_lstm.py — Train 1D-CNN + LSTM model for temporal focus prediction.

Takes sequences of (T, F) feature windows and predicts focus score.

Usage:
    python train_lstm.py
    python train_lstm.py --seq-len 30   # 30 timesteps × 2s = 60s window
"""

import argparse
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

DATA_DIR = Path(__file__).parent / "data"
MODEL_DIR = Path(__file__).parent / "models"
RESULTS_DIR = Path(__file__).parent / "results"

FEATURE_COLS = [
    "head_yaw", "head_pitch", "head_roll",
    "ear_left", "ear_right", "gaze_x", "gaze_y", "face_confidence",
    "keystroke_rate", "mouse_velocity", "mouse_distance",
    "click_rate", "scroll_rate", "idle_duration", "activity_level",
    "tab_switch_count", "window_blur_count",
    "time_since_tab_return", "session_elapsed_ratio",
    "focus_ema_30s", "focus_ema_5min", "focus_trend", "distraction_burst_count",
]


def create_sequences(df, seq_len, target_col="focus_score"):
    """
    Create sliding-window sequences per session.
    Returns X: (N, seq_len, n_features), y: (N,)
    """
    available = [f for f in FEATURE_COLS if f in df.columns]
    X_all, y_all, groups = [], [], []

    for session_id, group in df.groupby("session_id"):
        group = group.sort_values("timestamp")
        features = group[available].values
        targets = group[target_col].values

        if len(features) < seq_len:
            continue

        for i in range(len(features) - seq_len):
            X_all.append(features[i : i + seq_len])
            y_all.append(targets[i + seq_len])
            groups.append(session_id)

    return np.array(X_all), np.array(y_all), np.array(groups), available


def build_model(seq_len, n_features):
    """Build Conv1D + LSTM hybrid model."""
    try:
        import tensorflow as tf
        from tensorflow.keras import layers, Model
    except ImportError:
        print("pip install tensorflow")
        return None

    inputs = tf.keras.Input(shape=(seq_len, n_features))

    # Conv1D block
    x = layers.Conv1D(64, kernel_size=3, padding="same", activation="relu")(inputs)
    x = layers.Conv1D(64, kernel_size=3, padding="same", activation="relu")(x)
    x = layers.MaxPooling1D(pool_size=2)(x)
    x = layers.Dropout(0.2)(x)

    # LSTM block
    x = layers.LSTM(64, return_sequences=False)(x)
    x = layers.Dropout(0.3)(x)

    # Dense head
    x = layers.Dense(32, activation="relu")(x)
    outputs = layers.Dense(1)(x)  # regression output

    model = Model(inputs, outputs)
    model.compile(optimizer="adam", loss="mse", metrics=["mae"])
    return model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seq-len", type=int, default=30, help="Sequence length (timesteps)")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=32)
    args = parser.parse_args()

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading dataset...")
    df = pd.read_csv(DATA_DIR / "dataset.csv")
    print(f"  {len(df)} samples, {df['session_id'].nunique()} sessions")

    print(f"Creating sequences (window={args.seq_len} × 2s = {args.seq_len * 2}s)...")
    X, y, groups, feature_names = create_sequences(df, args.seq_len)

    if len(X) == 0:
        print("  Not enough data for sequences. Need sessions with ≥{args.seq_len} events.")
        return

    print(f"  {len(X)} sequences, {len(feature_names)} features")

    # Train/val split by session
    unique_sessions = np.unique(groups)
    np.random.seed(42)
    np.random.shuffle(unique_sessions)

    split_idx = int(len(unique_sessions) * 0.8)
    train_sessions = set(unique_sessions[:split_idx])

    train_mask = np.isin(groups, list(train_sessions))
    X_train, y_train = X[train_mask], y[train_mask]
    X_val, y_val = X[~train_mask], y[~train_mask]

    print(f"  Train: {len(X_train)}, Val: {len(X_val)}")

    print("\nBuilding model...")
    model = build_model(args.seq_len, len(feature_names))
    if model is None:
        return

    model.summary()

    print("\nTraining...")
    try:
        import tensorflow as tf
    except ImportError:
        return

    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=args.epochs,
        batch_size=args.batch_size,
        callbacks=[
            tf.keras.callbacks.EarlyStopping(patience=10, restore_best_weights=True),
            tf.keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=5),
        ],
        verbose=1,
    )

    # Evaluate
    val_preds = model.predict(X_val, verbose=0).flatten()
    mae = float(np.mean(np.abs(y_val - val_preds)))
    rmse = float(np.sqrt(np.mean((y_val - val_preds) ** 2)))

    print(f"\n═══ LSTM Results ═══")
    print(f"  Val MAE:  {mae:.3f}")
    print(f"  Val RMSE: {rmse:.3f}")

    # Save model
    model_path = MODEL_DIR / "lstm_model.keras"
    model.save(str(model_path))
    print(f"  Model saved → {model_path}")

    # Also save as TF SavedModel for TF.js conversion
    saved_model_path = MODEL_DIR / "lstm_saved_model"
    model.export(str(saved_model_path))
    print(f"  SavedModel → {saved_model_path}")

    # Save results
    results = {
        "seq_len": args.seq_len,
        "n_features": len(feature_names),
        "feature_names": feature_names,
        "n_train": len(X_train),
        "n_val": len(X_val),
        "epochs_trained": len(history.history["loss"]),
        "val_mae": mae,
        "val_rmse": rmse,
        "train_mae_final": float(history.history["mae"][-1]),
    }

    with open(RESULTS_DIR / "lstm_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"  Results saved → {RESULTS_DIR / 'lstm_results.json'}")


if __name__ == "__main__":
    main()
