/**
 * useIdleDetection
 *
 * Wraps the experimental W3C Idle Detection API so callers can ask one
 * question — is the user idle at the operating-system level — without
 * worrying about permission state, feature support, or lifecycle.
 *
 * The system-level signal is essential for task types where the user
 * is expected to be working in another tab or native application
 * (the common case for "coding" in a desktop IDE or "writing" in a
 * word processor). Window-scoped listeners cannot see those
 * interactions; Idle Detection reports whether the user is using
 * *any* input device anywhere on the machine.
 *
 * Supported browsers (as of this writing): Chrome/Edge 94+, Safari 17+.
 * Firefox does not implement the API. When the API is absent or the
 * user denies permission, the hook reports ``supported`` and
 * ``permission`` accurately so the caller can surface a warning.
 */
import { useEffect, useRef, useState } from 'react';

const DEFAULT_THRESHOLD_MS = 60_000;  // minimum allowed by the spec

/**
 * @typedef {Object} IdleDetectionState
 * @property {boolean} supported - True if the browser exposes IdleDetector.
 * @property {'granted'|'denied'|null} permission - Current permission state.
 * @property {boolean} isIdle - True iff the user is system-wide idle
 *   (no input anywhere on the system) or the screen is locked.
 */

/**
 * @param {boolean} active - When false, the detector is torn down.
 * @param {number} [thresholdMs] - Inactivity threshold; minimum 60,000.
 * @returns {IdleDetectionState}
 */
export default function useIdleDetection(active = false, thresholdMs = DEFAULT_THRESHOLD_MS) {
  const [state, setState] = useState(() => ({
    supported: typeof window !== 'undefined' && 'IdleDetector' in window,
    permission: null,
    isIdle: false,
  }));

  const controllerRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;
    if (!state.supported) return undefined;

    let cancelled = false;

    async function start() {
      try {
        // Re-check permission lazily; caller may already have granted.
        // ``requestPermission`` resolves to 'granted' or 'denied'.
        const Detector = window.IdleDetector;
        const permission = await Detector.requestPermission();
        if (cancelled) return;
        setState((s) => ({ ...s, permission }));
        if (permission !== 'granted') return;

        const controller = new AbortController();
        controllerRef.current = controller;

        const detector = new Detector();
        detector.addEventListener('change', () => {
          if (cancelled) return;
          const idle =
            detector.userState === 'idle' || detector.screenState === 'locked';
          setState((s) => (s.isIdle === idle ? s : { ...s, isIdle: idle }));
        });
        await detector.start({
          threshold: Math.max(thresholdMs, DEFAULT_THRESHOLD_MS),
          signal: controller.signal,
        });
      } catch {
        // Treat any error (user denial, unsupported, etc.) as denied
        // so the caller can show the fallback warning.
        if (!cancelled) {
          setState((s) => ({ ...s, permission: 'denied' }));
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
      // Reset isIdle so the score doesn't linger on stale state when
      // the next session starts.
      setState((s) => (s.isIdle ? { ...s, isIdle: false } : s));
    };
  }, [active, thresholdMs, state.supported]);

  return state;
}
