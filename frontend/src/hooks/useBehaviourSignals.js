/**
 * useBehaviourSignals
 *
 * Aggregates user input events (keyboard, mouse, scroll, touch) into
 * continuous behavioural features over a 30-second sliding window.
 * Tab-level idle detection has been removed in favour of the W3C Idle
 * Detection API (see ``useIdleDetection``), which reports system-wide
 * inactivity rather than inactivity on the DeepFocus tab alone. The
 * continuous ``idleDuration`` feature — seconds since the last event
 * hitting this tab — is retained as an ML input because it remains a
 * useful proxy for tab-scope engagement.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  BEHAVIOUR_WINDOW_SECONDS,
  SAMPLE_INTERVAL_MS,
} from '../constants';
import {
  createRingBuffer,
  pushRing,
  sumRing,
} from '../utils/features/ringBuffer';

// Slots = window_seconds / sample_interval_seconds.
const RING_SLOTS = Math.ceil(BEHAVIOUR_WINDOW_SECONDS / (SAMPLE_INTERVAL_MS / 1000));

/**
 * @typedef {Object} BehaviourSignals
 * @property {boolean} isTabHidden
 * @property {number} activityCount - Activity events in the last sample.
 * @property {number} keystrokeRate - Keys per second over the sliding window.
 * @property {number} mouseVelocity - Pixels per second over the sliding window.
 * @property {number} mouseDistance - Total pixels travelled in the window.
 * @property {number} clickRate - Clicks per second.
 * @property {number} scrollRate - Scroll events per second.
 * @property {number} idleDuration - Continuous seconds since last input to this tab.
 * @property {number} activityLevel - Normalised 0-1 composite.
 */

/**
 * @param {boolean} active - Whether a session is running. When false the hook
 *   unsubscribes from global input events.
 * @returns {BehaviourSignals}
 */
export default function useBehaviourSignals(active = false) {
  const [isTabHidden, setIsTabHidden] = useState(false);
  const [activityCount, setActivityCount] = useState(0);

  // Continuous feature state.
  const [features, setFeatures] = useState({
    keystrokeRate: 0,
    mouseVelocity: 0,
    mouseDistance: 0,
    clickRate: 0,
    scrollRate: 0,
    idleDuration: 0,
    activityLevel: 0,
  });

  // Refs for real-time counters (avoid re-renders on every event).
  const activityRef = useRef(0);
  const intervalRef = useRef(null);

  const keysRef = useRef(0);
  const clicksRef = useRef(0);
  const scrollsRef = useRef(0);
  const mouseDistRef = useRef(0);
  const lastMouseRef = useRef({ x: 0, y: 0, init: false });
  // Initialised to 0; the active-effect below stamps the current time
  // when the session starts. Calling ``Date.now()`` at ref creation
  // would violate React's purity rule for render-phase code.
  const lastActivityTimeRef = useRef(0);

  // Sliding-window buffers.
  const keysBuf = useRef(createRingBuffer(RING_SLOTS));
  const clicksBuf = useRef(createRingBuffer(RING_SLOTS));
  const scrollsBuf = useRef(createRingBuffer(RING_SLOTS));
  const mouseDistBuf = useRef(createRingBuffer(RING_SLOTS));

  const noteActivity = useCallback(() => {
    activityRef.current += 1;
    lastActivityTimeRef.current = Date.now();
  }, []);

  const handleKeydown = useCallback(() => {
    keysRef.current += 1;
    noteActivity();
  }, [noteActivity]);

  const handleClick = useCallback(() => {
    clicksRef.current += 1;
    noteActivity();
  }, [noteActivity]);

  const handleScroll = useCallback(() => {
    scrollsRef.current += 1;
    noteActivity();
  }, [noteActivity]);

  const handleMousemove = useCallback((e) => {
    const last = lastMouseRef.current;
    if (last.init) {
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      mouseDistRef.current += Math.sqrt(dx * dx + dy * dy);
    }
    lastMouseRef.current = { x: e.clientX, y: e.clientY, init: true };
    noteActivity();
  }, [noteActivity]);

  const handleTouchstart = useCallback(() => {
    noteActivity();
  }, [noteActivity]);

  useEffect(() => {
    if (!active) return undefined;

    const handleVisibility = () => setIsTabHidden(document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);

    window.addEventListener('keydown', handleKeydown, { passive: true });
    window.addEventListener('click', handleClick, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('mousemove', handleMousemove, { passive: true });
    window.addEventListener('touchstart', handleTouchstart, { passive: true });

    lastActivityTimeRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      // Read and reset per-sample counters.
      const keys = keysRef.current; keysRef.current = 0;
      const clicks = clicksRef.current; clicksRef.current = 0;
      const scrolls = scrollsRef.current; scrollsRef.current = 0;
      const mouseDist = mouseDistRef.current; mouseDistRef.current = 0;

      pushRing(keysBuf.current, keys);
      pushRing(clicksBuf.current, clicks);
      pushRing(scrollsBuf.current, scrolls);
      pushRing(mouseDistBuf.current, mouseDist);

      // Compute windowed rates. Safe divisor to avoid 0/0 at startup.
      const windowSec = Math.max(
        1,
        (keysBuf.current.count * SAMPLE_INTERVAL_MS) / 1000,
      );

      const keystrokeRate = sumRing(keysBuf.current) / windowSec;
      const totalMouseDist = sumRing(mouseDistBuf.current);
      const mouseVelocity = totalMouseDist / windowSec;
      const clickRate = sumRing(clicksBuf.current) / windowSec;
      const scrollRate = sumRing(scrollsBuf.current) / windowSec;
      const idleDuration = (Date.now() - lastActivityTimeRef.current) / 1000;

      // Normalised composite: rough heuristic; any meaningful input → ~1.
      const rawActivity = Math.min(
        keys + clicks + scrolls + (mouseDist > 10 ? 1 : 0),
        20,
      );
      const activityLevel = rawActivity / 20;

      setActivityCount(activityRef.current);
      activityRef.current = 0;

      setFeatures({
        keystrokeRate: Math.round(keystrokeRate * 100) / 100,
        mouseVelocity: Math.round(mouseVelocity * 10) / 10,
        mouseDistance: Math.round(totalMouseDist),
        clickRate: Math.round(clickRate * 100) / 100,
        scrollRate: Math.round(scrollRate * 100) / 100,
        idleDuration: Math.round(idleDuration * 10) / 10,
        activityLevel: Math.round(activityLevel * 100) / 100,
      });
    }, SAMPLE_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('mousemove', handleMousemove);
      window.removeEventListener('touchstart', handleTouchstart);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [
    active,
    handleKeydown,
    handleClick,
    handleScroll,
    handleMousemove,
    handleTouchstart,
  ]);

  return { isTabHidden, activityCount, ...features };
}
