import { useState, useRef, useEffect, useCallback } from 'react';
import useTimer from './useTimer';
import useBehaviourSignals from './useBehaviourSignals';
import useContextSignals from './useContextSignals';
import useTemporalFeatures from './useTemporalFeatures';
import { computeFocusScore, assembleFeatureVector } from '../utils/scoring';
import { createSession, updateSession, uploadEvents } from '../api/sessions';

const PERIODIC_UPLOAD_INTERVAL = 30000; // 30s — flush buffered events to server

export default function useSession() {
  const timer = useTimer();
  const [sessionId, setSessionId] = useState(null);
  const [cameraEnabled, setCameraEnabled] = useState(true); // default ON
  const [taskType, setTaskType] = useState('other');
  const [events, setEvents] = useState([]);
  const [currentScore, setCurrentScore] = useState(100);
  const [ending, setEnding] = useState(false);

  /* ── Face signals come from SessionPage via setter (same pattern as before) ── */
  const [faceFeatures, setFaceFeatures] = useState({});

  const isRunning = timer.status === 'running';

  /* ── All hooks ── */
  const signals = useBehaviourSignals(isRunning);
  const contextSignals = useContextSignals(isRunning, timer.elapsed);
  const temporal = useTemporalFeatures(currentScore, isRunning);

  // Totals tracked in ref to avoid re-renders every 2s
  const totals = useRef({ idle: 0, tabHidden: 0, faceMissing: 0, lookingAway: 0 });
  const samplingRef = useRef(null);
  const startTimeRef = useRef(null);

  // Periodic upload refs
  const uploadedCountRef = useRef(0); // how many events already uploaded
  const periodicUploadRef = useRef(null);
  const sessionIdRef = useRef(null); // needed inside interval
  const eventsRef = useRef([]);      // latest events for interval closure

  // Keep refs in sync
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { eventsRef.current = events; }, [events]);

  // Backward-compatible derived booleans from face features
  const isFaceMissing = !faceFeatures.facePresent;
  const isLookingAway = faceFeatures.lookingAway || false;

  // Sample every 2 seconds while running
  useEffect(() => {
    if (!isRunning) {
      if (samplingRef.current) clearInterval(samplingRef.current);
      return;
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

      if (isIdle) totals.current.idle += 2;
      if (isTabHidden) totals.current.tabHidden += 2;
      if (isFaceMissing && cameraEnabled) totals.current.faceMissing += 2;
      if (isLookingAway && cameraEnabled) totals.current.lookingAway += 2;

      const mlFeatures = assembleFeatureVector({
        faceFeatures,
        behaviourFeatures: signals,
        contextFeatures: contextSignals,
        temporalFeatures: temporal,
        cameraEnabled,
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
    }, 2000);

    return () => {
      if (samplingRef.current) clearInterval(samplingRef.current);
    };
  }, [isRunning, signals, faceFeatures, isFaceMissing, isLookingAway, cameraEnabled, contextSignals, temporal]);

  /* ── Periodic event upload (every 30s) ── */
  useEffect(() => {
    if (!isRunning) {
      if (periodicUploadRef.current) clearInterval(periodicUploadRef.current);
      return;
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
        console.error('Periodic upload failed (will retry):', err);
      }
    }, PERIODIC_UPLOAD_INTERVAL);

    return () => {
      if (periodicUploadRef.current) clearInterval(periodicUploadRef.current);
    };
  }, [isRunning]);

  const startSession = useCallback(async () => {
    const now = new Date().toISOString();
    startTimeRef.current = now;
    totals.current = { idle: 0, tabHidden: 0, faceMissing: 0, lookingAway: 0 };
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
      // Upload any remaining unsent events
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
    cameraSignals: { isFaceMissing, isLookingAway },
    events,
    ending,
    startSession,
    pauseSession,
    resumeSession,
    endSession,
  };
}
