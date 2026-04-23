/**
 * useContextSignals
 *
 * Tracks browser-level contextual signals — tab switching, window focus
 * losses, and session progress — over a 5-minute sliding window.
 *
 * Tab switches and window blurs are NOT penalised in the rule-based scorer
 * (see Chapter 3 design discussion) but are retained as ML features so the
 * trained model can learn when they indicate genuine distraction.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { CONTEXT_WINDOW_SECONDS, SAMPLE_INTERVAL_MS } from '../constants';

/**
 * @typedef {Object} ContextSignals
 * @property {number} tabSwitchCount5min
 * @property {number} windowBlurCount5min
 * @property {number} timeSinceTabReturn - Seconds since tab/window regained focus.
 * @property {number} sessionElapsedRatio - Elapsed / planned, clamped to [0, 1].
 * @property {number} timeOfDay - Current hour (0-23).
 */

/**
 * @param {boolean} active
 * @param {number} elapsed - Session elapsed time in seconds.
 * @param {number} [plannedDuration] - Optional planned duration (seconds) for the ratio.
 * @returns {ContextSignals}
 */
export default function useContextSignals(active = false, elapsed = 0, plannedDuration = 0) {
  const [contextFeatures, setContextFeatures] = useState({
    tabSwitchCount5min: 0,
    windowBlurCount5min: 0,
    timeSinceTabReturn: 0,
    sessionElapsedRatio: 0,
    timeOfDay: new Date().getHours(),
  });

  const tabSwitchTimesRef = useRef([]);
  const windowBlurTimesRef = useRef([]);
  const lastTabReturnRef = useRef(Date.now());

  const handleVisibilityChange = useCallback(() => {
    const now = Date.now();
    if (document.hidden) {
      tabSwitchTimesRef.current.push(now);
    } else {
      lastTabReturnRef.current = now;
    }
  }, []);

  const handleWindowBlur = useCallback(() => {
    windowBlurTimesRef.current.push(Date.now());
  }, []);

  const handleWindowFocus = useCallback(() => {
    lastTabReturnRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!active) return undefined;

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    lastTabReturnRef.current = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      const cutoff = now - CONTEXT_WINDOW_SECONDS * 1000;

      // Prune events outside the 5-minute window.
      tabSwitchTimesRef.current = tabSwitchTimesRef.current.filter((t) => t > cutoff);
      windowBlurTimesRef.current = windowBlurTimesRef.current.filter((t) => t > cutoff);

      const timeSinceTabReturn = (now - lastTabReturnRef.current) / 1000;

      // If plannedDuration provided, use it; otherwise fall back to 1-hour reference.
      const referenceDuration = plannedDuration > 0 ? plannedDuration : 3600;
      const sessionElapsedRatio = Math.min(elapsed / referenceDuration, 1);

      setContextFeatures({
        tabSwitchCount5min: tabSwitchTimesRef.current.length,
        windowBlurCount5min: windowBlurTimesRef.current.length,
        timeSinceTabReturn: Math.round(timeSinceTabReturn * 10) / 10,
        sessionElapsedRatio: Math.round(sessionElapsedRatio * 1000) / 1000,
        timeOfDay: new Date().getHours(),
      });
    }, SAMPLE_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      clearInterval(interval);
    };
  }, [
    active,
    elapsed,
    plannedDuration,
    handleVisibilityChange,
    handleWindowBlur,
    handleWindowFocus,
  ]);

  return contextFeatures;
}
