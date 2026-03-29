import { useState, useRef, useCallback } from 'react';

export default function useTimer() {
  const [status, setStatus] = useState('idle'); // idle | running | paused
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);

  const tick = useCallback(() => {
    setElapsed((prev) => prev + 1);
  }, []);

  const start = useCallback(() => {
    if (intervalRef.current) return;
    setStatus('running');
    intervalRef.current = setInterval(tick, 1000);
  }, [tick]);

  const pause = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setStatus('paused');
  }, []);

  const resume = useCallback(() => {
    if (intervalRef.current) return;
    setStatus('running');
    intervalRef.current = setInterval(tick, 1000);
  }, [tick]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    stop();
    setElapsed(0);
  }, [stop]);

  return { status, elapsed, start, pause, resume, stop, reset };
}
