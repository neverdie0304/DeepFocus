import { useState, useEffect, useRef, useCallback } from 'react';

const SAMPLE_INTERVAL = 2000;   // sync with other hooks
const HISTORY_WINDOW = 5 * 60;  // 5 minutes in seconds
const HISTORY_SLOTS = Math.ceil(HISTORY_WINDOW / (SAMPLE_INTERVAL / 1000)); // 150 slots

/* ═══════════════════════════════════════════════════
   Hook: useContextSignals
   Tracks tab-switching patterns, window focus, and
   session-level contextual features for ML.
   ═══════════════════════════════════════════════════ */
export default function useContextSignals(active = false, elapsed = 0, plannedDuration = 0) {
  const [contextFeatures, setContextFeatures] = useState({
    tabSwitchCount5min: 0,
    windowBlurCount5min: 0,
    timeSinceTabReturn: 0,
    sessionElapsedRatio: 0,
    timeOfDay: new Date().getHours(),
  });

  // Event timestamp histories (circular buffers of timestamps)
  const tabSwitchTimesRef = useRef([]);   // timestamps of visibilitychange → hidden
  const windowBlurTimesRef = useRef([]);  // timestamps of window blur
  const lastTabReturnRef = useRef(Date.now());

  const handleVisibilityChange = useCallback(() => {
    const now = Date.now();
    if (document.hidden) {
      // Tab just became hidden → record switch
      tabSwitchTimesRef.current.push(now);
    } else {
      // Tab just became visible → record return time
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
    if (!active) return;

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    lastTabReturnRef.current = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      const fiveMinAgo = now - HISTORY_WINDOW * 1000;

      // Prune old entries and count recent ones
      tabSwitchTimesRef.current = tabSwitchTimesRef.current.filter((t) => t > fiveMinAgo);
      windowBlurTimesRef.current = windowBlurTimesRef.current.filter((t) => t > fiveMinAgo);

      const tabSwitchCount5min = tabSwitchTimesRef.current.length;
      const windowBlurCount5min = windowBlurTimesRef.current.length;
      const timeSinceTabReturn = (now - lastTabReturnRef.current) / 1000;

      // Session progress ratio
      const sessionElapsedRatio = plannedDuration > 0
        ? Math.min(elapsed / plannedDuration, 1)
        : elapsed > 0 ? Math.min(elapsed / 3600, 1) : 0; // fallback: ratio of 1 hour

      setContextFeatures({
        tabSwitchCount5min,
        windowBlurCount5min,
        timeSinceTabReturn: Math.round(timeSinceTabReturn * 10) / 10,
        sessionElapsedRatio: Math.round(sessionElapsedRatio * 1000) / 1000,
        timeOfDay: new Date().getHours(),
      });
    }, SAMPLE_INTERVAL);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      clearInterval(interval);
    };
  }, [active, elapsed, plannedDuration, handleVisibilityChange, handleWindowBlur, handleWindowFocus]);

  return contextFeatures;
}
