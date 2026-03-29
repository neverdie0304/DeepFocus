import { useState, useEffect, useRef } from 'react';

const SAMPLE_INTERVAL = 2000;
const FIVE_MIN_SLOTS = Math.ceil((5 * 60) / (SAMPLE_INTERVAL / 1000)); // 150 slots

/* ───────────────────────────────────────────────────
   EMA (Exponential Moving Average)
   alpha = 2 / (N + 1)  where N = window_seconds / sample_interval
   ─────────────────────────────────────────────────── */
function emaAlpha(windowSeconds) {
  const N = windowSeconds / (SAMPLE_INTERVAL / 1000);
  return 2 / (N + 1);
}

const ALPHA_30S = emaAlpha(30);    // ~0.118
const ALPHA_5MIN = emaAlpha(300);  // ~0.013

/* ───────────────────────────────────────────────────
   Simple linear regression slope on an array of values
   Returns slope per sample (multiply by 30 to get per-minute)
   ─────────────────────────────────────────────────── */
function linearSlope(values) {
  const n = values.length;
  if (n < 3) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/* ───────────────────────────────────────────────────
   Distraction burst detection
   A "burst" = consecutive samples with score < threshold
   ─────────────────────────────────────────────────── */
const DISTRACTION_THRESHOLD = 50;
const MIN_BURST_LENGTH = 3; // 3 samples × 2s = 6s minimum

function countBursts(scores) {
  let bursts = 0;
  let streak = 0;
  for (const s of scores) {
    if (s < DISTRACTION_THRESHOLD) {
      streak += 1;
    } else {
      if (streak >= MIN_BURST_LENGTH) bursts += 1;
      streak = 0;
    }
  }
  if (streak >= MIN_BURST_LENGTH) bursts += 1;
  return bursts;
}

/* ═══════════════════════════════════════════════════
   Hook: useTemporalFeatures
   Computes time-series derived features from the
   stream of focus scores produced every 2 seconds.
   ═══════════════════════════════════════════════════ */
export default function useTemporalFeatures(currentScore, isRunning) {
  const [temporal, setTemporal] = useState({
    focusEma30s: 100,
    focusEma5min: 100,
    focusTrend: 0,
    distractionBurstCount: 0,
  });

  const ema30Ref = useRef(100);
  const ema5mRef = useRef(100);
  const historyRef = useRef([]); // last 5 min of scores

  // Reset on session start
  useEffect(() => {
    if (!isRunning) {
      ema30Ref.current = 100;
      ema5mRef.current = 100;
      historyRef.current = [];
      setTemporal({
        focusEma30s: 100,
        focusEma5min: 100,
        focusTrend: 0,
        distractionBurstCount: 0,
      });
    }
  }, [isRunning]);

  // Update on each new score
  useEffect(() => {
    if (!isRunning) return;

    // Update EMAs
    ema30Ref.current = ALPHA_30S * currentScore + (1 - ALPHA_30S) * ema30Ref.current;
    ema5mRef.current = ALPHA_5MIN * currentScore + (1 - ALPHA_5MIN) * ema5mRef.current;

    // Maintain 5-min history
    historyRef.current.push(currentScore);
    if (historyRef.current.length > FIVE_MIN_SLOTS) {
      historyRef.current.shift();
    }

    // Compute trend (slope) and bursts
    const trend = linearSlope(historyRef.current);
    const bursts = countBursts(historyRef.current);

    setTemporal({
      focusEma30s: Math.round(ema30Ref.current * 10) / 10,
      focusEma5min: Math.round(ema5mRef.current * 10) / 10,
      focusTrend: Math.round(trend * 1000) / 1000,
      distractionBurstCount: bursts,
    });
  }, [currentScore, isRunning]);

  return temporal;
}
