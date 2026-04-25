/**
 * useTimer
 *
 * Wall-clock-anchored session timer. The earlier implementation
 * accumulated one second per ``setInterval`` tick, which background
 * tabs and display-sleep events throttle aggressively — a user with
 * DeepFocus on a background tab for 60 minutes would observe only
 * ~30 minutes of elapsed time because Chrome reduces the interval
 * frequency on hidden tabs. This implementation tracks the wall-clock
 * timestamp at which the current "running" segment started, plus the
 * sum of any prior segments (across pause/resume cycles), and computes
 * elapsed from those two refs on every tick. Throttled ticks are now
 * harmless: the value computed on the next firing is always correct
 * relative to wall time. ``getElapsed()`` returns the same wall-clock
 * value synchronously for callers that cannot wait for the next render
 * (notably ``endSession``, which PATCHes the duration immediately on
 * stop).
 */
import { useCallback, useRef, useState } from 'react';

const TICK_INTERVAL_MS = 1000;

export default function useTimer() {
  const [status, setStatus] = useState('idle'); // idle | running | paused
  const [elapsed, setElapsed] = useState(0);

  const intervalRef = useRef(null);
  // Timestamp (ms) at which the current running segment started, or
  // null when the timer is paused or idle.
  const startedAtRef = useRef(null);
  // Total seconds elapsed across all completed running segments.
  // The current segment's elapsed time is computed live from
  // ``Date.now() - startedAtRef.current`` and added to this.
  const accumulatedRef = useRef(0);

  /**
   * Synchronously compute the up-to-date elapsed time in seconds.
   * Safe to call regardless of how long since the last interval tick.
   */
  const getElapsed = useCallback(() => {
    if (startedAtRef.current !== null) {
      return accumulatedRef.current
        + Math.floor((Date.now() - startedAtRef.current) / 1000);
    }
    return accumulatedRef.current;
  }, []);

  // Each tick re-derives elapsed from the wall clock rather than
  // incrementing a counter. Background-throttled ticks therefore
  // catch up correctly when they finally fire.
  const tick = useCallback(() => {
    setElapsed(getElapsed());
  }, [getElapsed]);

  const start = useCallback(() => {
    if (intervalRef.current) return;
    accumulatedRef.current = 0;
    startedAtRef.current = Date.now();
    setElapsed(0);
    setStatus('running');
    intervalRef.current = setInterval(tick, TICK_INTERVAL_MS);
  }, [tick]);

  const pause = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (startedAtRef.current !== null) {
      accumulatedRef.current
        += Math.floor((Date.now() - startedAtRef.current) / 1000);
      startedAtRef.current = null;
      setElapsed(accumulatedRef.current);
    }
    setStatus('paused');
  }, []);

  const resume = useCallback(() => {
    if (intervalRef.current) return;
    startedAtRef.current = Date.now();
    setStatus('running');
    intervalRef.current = setInterval(tick, TICK_INTERVAL_MS);
  }, [tick]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (startedAtRef.current !== null) {
      accumulatedRef.current
        += Math.floor((Date.now() - startedAtRef.current) / 1000);
      startedAtRef.current = null;
      setElapsed(accumulatedRef.current);
    }
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    stop();
    accumulatedRef.current = 0;
    startedAtRef.current = null;
    setElapsed(0);
  }, [stop]);

  return { status, elapsed, start, pause, resume, stop, reset, getElapsed };
}
