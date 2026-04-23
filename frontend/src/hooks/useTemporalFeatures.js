/**
 * useTemporalFeatures
 *
 * Derives temporal features — short- and medium-term EMAs, linear-regression
 * trend, and distraction-burst counts — from the stream of focus scores.
 *
 * These features give the ML model access to short-term context without
 * requiring a recurrent architecture.
 */
import { useEffect, useRef, useState } from 'react';

import {
  DISTRACTION_THRESHOLD,
  EMA_30S_WINDOW,
  EMA_5MIN_WINDOW,
  MIN_BURST_LENGTH,
  SAMPLE_INTERVAL_MS,
} from '../constants';

const SAMPLE_INTERVAL_SEC = SAMPLE_INTERVAL_MS / 1000;
const FIVE_MIN_SLOTS = Math.ceil(EMA_5MIN_WINDOW / SAMPLE_INTERVAL_SEC);

/**
 * α = 2 / (N + 1), where N is the number of samples in the window.
 *
 * @param {number} windowSeconds
 */
function emaAlpha(windowSeconds) {
  const N = windowSeconds / SAMPLE_INTERVAL_SEC;
  return 2 / (N + 1);
}

const ALPHA_30S = emaAlpha(EMA_30S_WINDOW);
const ALPHA_5MIN = emaAlpha(EMA_5MIN_WINDOW);

/**
 * Ordinary least-squares slope over an array of values (x = index).
 *
 * @param {number[]} values
 * @returns {number} Slope per sample. Multiply by 30 to get slope per minute.
 */
function linearSlope(values) {
  const n = values.length;
  if (n < 3) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Count contiguous runs of samples with score < threshold that are at least
 * ``MIN_BURST_LENGTH`` long.
 *
 * @param {number[]} scores
 * @returns {number}
 */
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

/**
 * @typedef {Object} TemporalFeatures
 * @property {number} focusEma30s
 * @property {number} focusEma5min
 * @property {number} focusTrend - Slope of the last 5 min of scores.
 * @property {number} distractionBurstCount
 */

/**
 * @param {number} currentScore - Latest focus score.
 * @param {boolean} isRunning - Resets state to defaults when false.
 * @returns {TemporalFeatures}
 */
export default function useTemporalFeatures(currentScore, isRunning) {
  const [temporal, setTemporal] = useState({
    focusEma30s: 100,
    focusEma5min: 100,
    focusTrend: 0,
    distractionBurstCount: 0,
  });

  const ema30Ref = useRef(100);
  const ema5mRef = useRef(100);
  const historyRef = useRef([]);

  // Reset state on session start/stop.
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

  // Update on each new score.
  useEffect(() => {
    if (!isRunning) return;

    ema30Ref.current = ALPHA_30S * currentScore + (1 - ALPHA_30S) * ema30Ref.current;
    ema5mRef.current = ALPHA_5MIN * currentScore + (1 - ALPHA_5MIN) * ema5mRef.current;

    historyRef.current.push(currentScore);
    if (historyRef.current.length > FIVE_MIN_SLOTS) {
      historyRef.current.shift();
    }

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
