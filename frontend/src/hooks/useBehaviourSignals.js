import { useState, useEffect, useRef, useCallback } from 'react';

const IDLE_TIMEOUT = 15000; // 15 seconds
const WINDOW_SIZE = 30;     // 30-second sliding window (sampled every 2s → 15 slots)
const SAMPLE_INTERVAL = 2000;

/* ───────────────────────────────────────────────────
   Circular buffer for sliding-window aggregation
   ─────────────────────────────────────────────────── */
function createRingBuffer(size) {
  return { data: new Float64Array(size), idx: 0, count: 0 };
}

function pushRing(buf, value) {
  buf.data[buf.idx] = value;
  buf.idx = (buf.idx + 1) % buf.data.length;
  if (buf.count < buf.data.length) buf.count += 1;
}

function sumRing(buf) {
  let s = 0;
  const n = buf.count;
  for (let i = 0; i < n; i++) s += buf.data[i];
  return s;
}

function meanRing(buf) {
  return buf.count > 0 ? sumRing(buf) / buf.count : 0;
}

/* ═══════════════════════════════════════════════════
   Hook: useBehaviourSignals
   Expanded to output continuous behavioral features
   ═══════════════════════════════════════════════════ */
export default function useBehaviourSignals(active = false) {
  /* ── Backward-compatible state ── */
  const [isTabHidden, setIsTabHidden] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [activityCount, setActivityCount] = useState(0);

  /* ── New continuous features ── */
  const [features, setFeatures] = useState({
    keystrokeRate: 0,    // keys/sec (30s window)
    mouseVelocity: 0,    // px/sec  (30s window)
    mouseDistance: 0,     // total px (30s window)
    clickRate: 0,         // clicks/sec (30s window)
    scrollRate: 0,        // events/sec (30s window)
    idleDuration: 0,      // seconds since last activity
    activityLevel: 0,     // 0-1 normalised composite
  });

  /* ── Refs for real-time counters ── */
  const idleTimerRef = useRef(null);
  const activityRef = useRef(0);
  const intervalRef = useRef(null);

  // Per-sample counters (reset every 2s)
  const keysRef = useRef(0);
  const clicksRef = useRef(0);
  const scrollsRef = useRef(0);
  const mouseDistRef = useRef(0);
  const lastMouseRef = useRef({ x: 0, y: 0, init: false });
  const lastActivityTimeRef = useRef(Date.now());

  // Sliding-window ring buffers (one slot per 2s sample = 15 slots for 30s)
  const slots = Math.ceil(WINDOW_SIZE / (SAMPLE_INTERVAL / 1000));
  const keysBuf = useRef(createRingBuffer(slots));
  const clicksBuf = useRef(createRingBuffer(slots));
  const scrollsBuf = useRef(createRingBuffer(slots));
  const mouseDistBuf = useRef(createRingBuffer(slots));

  /* ── Event handlers ── */
  const resetIdleTimer = useCallback(() => {
    setIsIdle(false);
    activityRef.current += 1;
    lastActivityTimeRef.current = Date.now();
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setIsIdle(true), IDLE_TIMEOUT);
  }, []);

  const handleKeydown = useCallback(() => {
    keysRef.current += 1;
    resetIdleTimer();
  }, [resetIdleTimer]);

  const handleClick = useCallback(() => {
    clicksRef.current += 1;
    resetIdleTimer();
  }, [resetIdleTimer]);

  const handleScroll = useCallback(() => {
    scrollsRef.current += 1;
    resetIdleTimer();
  }, [resetIdleTimer]);

  const handleMousemove = useCallback((e) => {
    const last = lastMouseRef.current;
    if (last.init) {
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      mouseDistRef.current += Math.sqrt(dx * dx + dy * dy);
    }
    lastMouseRef.current = { x: e.clientX, y: e.clientY, init: true };
    resetIdleTimer();
  }, [resetIdleTimer]);

  const handleTouchstart = useCallback(() => {
    resetIdleTimer();
  }, [resetIdleTimer]);

  useEffect(() => {
    if (!active) return;

    // Visibility
    const handleVisibility = () => setIsTabHidden(document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);

    // Input events
    window.addEventListener('keydown', handleKeydown, { passive: true });
    window.addEventListener('click', handleClick, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('mousemove', handleMousemove, { passive: true });
    window.addEventListener('touchstart', handleTouchstart, { passive: true });

    // Start idle timer
    idleTimerRef.current = setTimeout(() => setIsIdle(true), IDLE_TIMEOUT);
    lastActivityTimeRef.current = Date.now();

    // Sample every 2 seconds
    intervalRef.current = setInterval(() => {
      // Read and reset per-sample counters
      const keys = keysRef.current; keysRef.current = 0;
      const clicks = clicksRef.current; clicksRef.current = 0;
      const scrolls = scrollsRef.current; scrollsRef.current = 0;
      const mouseDist = mouseDistRef.current; mouseDistRef.current = 0;

      // Push into ring buffers
      pushRing(keysBuf.current, keys);
      pushRing(clicksBuf.current, clicks);
      pushRing(scrollsBuf.current, scrolls);
      pushRing(mouseDistBuf.current, mouseDist);

      // Compute windowed features
      const windowSec = (keysBuf.current.count * SAMPLE_INTERVAL) / 1000;
      const safeDiv = windowSec > 0 ? windowSec : 1;

      const keystrokeRate = sumRing(keysBuf.current) / safeDiv;
      const totalMouseDist = sumRing(mouseDistBuf.current);
      const mouseVelocity = totalMouseDist / safeDiv;
      const clickRate = sumRing(clicksBuf.current) / safeDiv;
      const scrollRate = sumRing(scrollsBuf.current) / safeDiv;
      const idleDuration = (Date.now() - lastActivityTimeRef.current) / 1000;

      // Normalised activity level: simple composite (0-1)
      // Heuristic: any non-zero input → some activity
      const rawActivity = Math.min(keys + clicks + scrolls + (mouseDist > 10 ? 1 : 0), 20);
      const activityLevel = rawActivity / 20;

      // Backward compat
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
    }, SAMPLE_INTERVAL);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('mousemove', handleMousemove);
      window.removeEventListener('touchstart', handleTouchstart);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, handleKeydown, handleClick, handleScroll, handleMousemove, handleTouchstart, resetIdleTimer]);

  return { isTabHidden, isIdle, activityCount, ...features };
}
