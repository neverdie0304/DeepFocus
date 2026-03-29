import { useState, useEffect, useRef, useCallback } from 'react';
import { submitSelfReport } from '../api/sessions';

const MIN_INTERVAL = 3 * 60 * 1000;  // 3 minutes minimum between prompts
const MAX_INTERVAL = 8 * 60 * 1000;  // 8 minutes maximum between prompts
const AUTO_DISMISS = 10 * 1000;       // dismiss after 10 seconds if no response

function randomInterval() {
  return MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
}

export default function ESMPopup({ sessionId, isRunning }) {
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef(null);
  const dismissRef = useRef(null);

  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(true);
      // Auto-dismiss after 10 seconds
      dismissRef.current = setTimeout(() => setVisible(false), AUTO_DISMISS);
    }, randomInterval());
  }, []);

  useEffect(() => {
    if (isRunning && sessionId) {
      scheduleNext();
    } else {
      setVisible(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dismissRef.current) clearTimeout(dismissRef.current);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dismissRef.current) clearTimeout(dismissRef.current);
    };
  }, [isRunning, sessionId, scheduleNext]);

  const handleScore = async (score) => {
    if (!sessionId || submitting) return;
    setSubmitting(true);
    try {
      await submitSelfReport(sessionId, {
        timestamp: new Date().toISOString(),
        report_type: 'esm',
        score,
      });
    } catch {
      // Silently fail — ESM is non-critical
    } finally {
      setSubmitting(false);
      setVisible(false);
      if (dismissRef.current) clearTimeout(dismissRef.current);
      scheduleNext();
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in fade-in">
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-5 max-w-xs">
        <p className="text-sm text-gray-300 mb-3">How focused are you right now?</p>
        <div className="flex gap-2 justify-between">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => handleScore(n)}
              disabled={submitting}
              className={`
                w-10 h-10 rounded-lg text-sm font-bold transition-colors
                ${n <= 2 ? 'bg-red-900/50 hover:bg-red-800 text-red-300' : ''}
                ${n === 3 ? 'bg-yellow-900/50 hover:bg-yellow-800 text-yellow-300' : ''}
                ${n >= 4 ? 'bg-green-900/50 hover:bg-green-800 text-green-300' : ''}
                disabled:opacity-50
              `}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-600 mt-2 text-center">1 = Not at all · 5 = Fully focused</p>
      </div>
    </div>
  );
}
