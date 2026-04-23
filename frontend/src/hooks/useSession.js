/**
 * useSession
 *
 * Orchestrates the full focus-session lifecycle in the browser:
 *
 *   - starts a session on the backend and captures the initial task metadata
 *   - samples all four modalities every ``SAMPLE_INTERVAL_MS`` and emits an
 *     event with the rule-based focus score and the full feature vector
 *   - periodically flushes buffered events to the backend
 *     (every ``PERIODIC_UPLOAD_INTERVAL_MS``) so a browser crash does not
 *     lose all the session's data
 *   - pauses/resumes the timer on user request
 *   - finalises the session on end (uploads remaining events, writes
 *     totals) and returns its id so the caller can navigate to the report
 *
 * Designed as a single orchestration layer so that the UI component
 * (``SessionPage``) can remain purely presentational.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { createSession, updateSession, uploadEvents } from '../api/sessions';
import { PERIODIC_UPLOAD_INTERVAL_MS, SAMPLE_INTERVAL_MS } from '../constants';
import { assembleFeatureVector, computeFocusScore } from '../utils/scoring';
import useBehaviourSignals from './useBehaviourSignals';
import useContextSignals from './useContextSignals';
import useTemporalFeatures from './useTemporalFeatures';
import useTimer from './useTimer';

const INITIAL_TOTALS = { idle: 0, tabHidden: 0, faceMissing: 0, lookingAway: 0 };

export default function useSession() {
  const timer = useTimer();
  const [sessionId, setSessionId] = useState(null);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [taskType, setTaskType] = useState('other');
  const [events, setEvents] = useState([]);
  const [currentScore, setCurrentScore] = useState(100);
  const [ending, setEnding] = useState(false);

  // Face features are produced in SessionPage (from useFaceDetection) and
  // passed in via setFaceFeatures — this hook is vision-agnostic.
  const [faceFeatures, setFaceFeatures] = useState({});

  const isRunning = timer.status === 'running';

  const signals = useBehaviourSignals(isRunning);
  const contextSignals = useContextSignals(isRunning, timer.elapsed);
  const temporal = useTemporalFeatures(currentScore, isRunning);

  // Totals tracked via ref to avoid re-rendering on every sample.
  const totals = useRef({ ...INITIAL_TOTALS });
  const samplingRef = useRef(null);
  const startTimeRef = useRef(null);

  // Periodic upload bookkeeping.
  const uploadedCountRef = useRef(0);
  const periodicUploadRef = useRef(null);
  const sessionIdRef = useRef(null);
  const eventsRef = useRef([]);

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { eventsRef.current = events; }, [events]);

  // Backward-compatible derived booleans.
  const isFaceMissing = !faceFeatures.facePresent;
  const isLookingAway = faceFeatures.lookingAway || false;

  // ── Main sampling loop (every 2 seconds while running). ──
  useEffect(() => {
    if (!isRunning) {
      if (samplingRef.current) clearInterval(samplingRef.current);
      return undefined;
    }

    samplingRef.current = setInterval(() => {
      const { isTabHidden, isIdle } = signals;

      const score = computeFocusScore({
        isIdle,
        isFaceMissing,
        isLookingAway,
        cameraEnabled,
      });
      setCurrentScore(score);

      // Accumulate cumulative distraction time (seconds) per category.
      const interval = SAMPLE_INTERVAL_MS / 1000;
      if (isIdle) totals.current.idle += interval;
      if (isTabHidden) totals.current.tabHidden += interval;
      if (isFaceMissing && cameraEnabled) totals.current.faceMissing += interval;
      if (isLookingAway && cameraEnabled) totals.current.lookingAway += interval;

      const mlFeatures = assembleFeatureVector({
        faceFeatures,
        behaviourFeatures: signals,
        contextFeatures: contextSignals,
        temporalFeatures: temporal,
      });

      setEvents((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          focus_score: score,
          is_tab_hidden: isTabHidden,
          is_idle: isIdle,
          is_face_missing: isFaceMissing,
          is_looking_away: isLookingAway,
          ...mlFeatures,
        },
      ]);
    }, SAMPLE_INTERVAL_MS);

    return () => {
      if (samplingRef.current) clearInterval(samplingRef.current);
    };
  }, [
    isRunning,
    signals,
    faceFeatures,
    isFaceMissing,
    isLookingAway,
    cameraEnabled,
    contextSignals,
    temporal,
  ]);

  // ── Periodic upload loop (every 30s while running). ──
  useEffect(() => {
    if (!isRunning) {
      if (periodicUploadRef.current) clearInterval(periodicUploadRef.current);
      return undefined;
    }

    periodicUploadRef.current = setInterval(async () => {
      const sid = sessionIdRef.current;
      const allEvents = eventsRef.current;
      if (!sid || allEvents.length <= uploadedCountRef.current) return;

      const pending = allEvents.slice(uploadedCountRef.current);
      try {
        await uploadEvents(sid, pending);
        uploadedCountRef.current = allEvents.length;
      } catch (err) {
        // Non-fatal: will be retried on the next flush or on session end.
        console.error('Periodic upload failed (will retry):', err);
      }
    }, PERIODIC_UPLOAD_INTERVAL_MS);

    return () => {
      if (periodicUploadRef.current) clearInterval(periodicUploadRef.current);
    };
  }, [isRunning]);

  const startSession = useCallback(async () => {
    const now = new Date().toISOString();
    startTimeRef.current = now;
    totals.current = { ...INITIAL_TOTALS };
    setEvents([]);
    setCurrentScore(100);
    uploadedCountRef.current = 0;

    const session = await createSession({
      start_time: now,
      mode: cameraEnabled ? 'camera_on' : 'camera_off',
      tag: taskType,
    });
    setSessionId(session.id);
    timer.start();
    return session.id;
  }, [cameraEnabled, taskType, timer]);

  const pauseSession = useCallback(() => timer.pause(), [timer]);
  const resumeSession = useCallback(() => timer.resume(), [timer]);

  const endSession = useCallback(async () => {
    timer.stop();
    setEnding(true);

    const avgScore = events.length > 0
      ? events.reduce((sum, e) => sum + e.focus_score, 0) / events.length
      : 0;

    try {
      // Flush any events still buffered locally.
      const pending = events.slice(uploadedCountRef.current);
      if (pending.length > 0) {
        try {
          await uploadEvents(sessionId, pending);
          uploadedCountRef.current = events.length;
        } catch (err) {
          console.error('Final event upload failed:', err);
        }
      }

      await updateSession(sessionId, {
        end_time: new Date().toISOString(),
        duration: timer.elapsed,
        focus_score_final: Math.round(avgScore * 10) / 10,
        time_idle: totals.current.idle,
        time_tab_hidden: totals.current.tabHidden,
        time_face_missing: totals.current.faceMissing,
        time_looking_away: totals.current.lookingAway,
      });
    } catch (err) {
      console.error('Session save failed:', err);
    } finally {
      setEnding(false);
    }

    const id = sessionId;
    setSessionId(null);
    timer.reset();
    return id;
  }, [timer, events, sessionId]);

  return {
    sessionId,
    status: timer.status,
    elapsed: timer.elapsed,
    currentScore,
    signals,
    cameraEnabled,
    setCameraEnabled,
    taskType,
    setTaskType,
    faceFeatures,
    setFaceFeatures,
    // Backward-compatible derived booleans.
    cameraSignals: { isFaceMissing, isLookingAway },
    events,
    ending,
    startSession,
    pauseSession,
    resumeSession,
    endSession,
  };
}
