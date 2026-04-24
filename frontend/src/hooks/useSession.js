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
import {
  INPUT_REQUIRED_TASKS,
  PERIODIC_UPLOAD_INTERVAL_MS,
  SAMPLE_INTERVAL_MS,
} from '../constants';
import { assembleFeatureVector, computeFocusScore } from '../utils/scoring';
import useBehaviourSignals from './useBehaviourSignals';
import useContextSignals from './useContextSignals';
import useIdleDetection from './useIdleDetection';
import useTemporalFeatures from './useTemporalFeatures';
import useTimer from './useTimer';

const INITIAL_TOTALS = {
  idle: 0,
  tabHidden: 0,
  faceMissing: 0,
  lookingAway: 0,
  phoneUse: 0,
};

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
  const idleDetection = useIdleDetection(isRunning);

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

  // Backward-compatible derived booleans (used only for rendering, not by
  // the sampling loop; the loop reads fresh values from refs below).
  const isFaceMissing = !faceFeatures.facePresent;
  const isLookingAway = faceFeatures.lookingAway || false;

  // Refs mirroring the latest values of every hook-produced state the
  // sampling loop needs. Without this, including ``faceFeatures`` (updated
  // at 10 Hz by the face-detection hook) in the effect's dependency list
  // tears down and recreates the 2-second interval on every frame, so the
  // callback never fires and distraction totals never accumulate.
  const faceFeaturesRef = useRef(faceFeatures);
  const signalsRef = useRef(signals);
  const contextSignalsRef = useRef(contextSignals);
  const temporalRef = useRef(temporal);
  const cameraEnabledRef = useRef(cameraEnabled);
  const idleDetectionRef = useRef(idleDetection);
  const taskTypeRef = useRef(taskType);

  useEffect(() => { faceFeaturesRef.current = faceFeatures; }, [faceFeatures]);
  useEffect(() => { signalsRef.current = signals; }, [signals]);
  useEffect(() => { contextSignalsRef.current = contextSignals; }, [contextSignals]);
  useEffect(() => { temporalRef.current = temporal; }, [temporal]);
  useEffect(() => { cameraEnabledRef.current = cameraEnabled; }, [cameraEnabled]);
  useEffect(() => { idleDetectionRef.current = idleDetection; }, [idleDetection]);
  useEffect(() => { taskTypeRef.current = taskType; }, [taskType]);

  // ── Main sampling loop (every 2 seconds while running). ──
  // Depends only on ``isRunning`` so the interval is set once per session
  // start and cleared once per session end. All other state is read from
  // refs so the interval is never prematurely torn down.
  useEffect(() => {
    if (!isRunning) {
      if (samplingRef.current) clearInterval(samplingRef.current);
      return undefined;
    }

    samplingRef.current = setInterval(() => {
      const ff = faceFeaturesRef.current;
      const sig = signalsRef.current;
      const ctx = contextSignalsRef.current;
      const tmp = temporalRef.current;
      const camOn = cameraEnabledRef.current;

      const { isTabHidden } = sig;
      const faceMissing = !ff.facePresent;
      const lookingAway = ff.lookingAway || false;
      const phonePresent = ff.phonePresent || false;

      // System-wide idle matters only when the task requires continuous
      // input (coding, writing). For reading / video / study / other,
      // the user may legitimately be engaged without touching any input
      // device — a book, a lecture, or a paper notebook — so the idle
      // signal is suppressed for those task types.
      const taskRequiresInput = INPUT_REQUIRED_TASKS.has(taskTypeRef.current);
      const isIdle = taskRequiresInput && (idleDetectionRef.current.isIdle || false);

      const score = computeFocusScore({
        isIdle,
        isFaceMissing: faceMissing,
        isLookingAway: lookingAway,
        isPhonePresent: phonePresent,
        cameraEnabled: camOn,
      });
      setCurrentScore(score);

      // Accumulate cumulative distraction time (seconds) per category.
      const interval = SAMPLE_INTERVAL_MS / 1000;
      if (isIdle) totals.current.idle += interval;
      if (isTabHidden) totals.current.tabHidden += interval;
      if (faceMissing && camOn) totals.current.faceMissing += interval;
      if (lookingAway && camOn) totals.current.lookingAway += interval;
      if (phonePresent && camOn) totals.current.phoneUse += interval;

      const mlFeatures = assembleFeatureVector({
        faceFeatures: ff,
        behaviourFeatures: sig,
        contextFeatures: ctx,
        temporalFeatures: tmp,
      });

      setEvents((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          focus_score: score,
          is_tab_hidden: isTabHidden,
          is_idle: isIdle,
          is_face_missing: faceMissing,
          is_looking_away: lookingAway,
          is_phone_present: phonePresent,
          ...mlFeatures,
        },
      ]);
    }, SAMPLE_INTERVAL_MS);

    return () => {
      if (samplingRef.current) clearInterval(samplingRef.current);
    };
  }, [isRunning]);

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
    // Set ``ending`` *before* stopping the timer. Stopping the timer
    // transitions status to ``'idle'`` which would otherwise cause
    // SessionPage to flash the task-type selection UI during the
    // upload. With the ``ending`` flag already set, SessionPage renders
    // a "Saving…" screen for the entire async window.
    setEnding(true);
    timer.stop();

    const avgScore = events.length > 0
      ? events.reduce((sum, e) => sum + e.focus_score, 0) / events.length
      : 0;

    // Flush remaining events. Non-fatal: session metadata is more
    // important than a handful of unuploaded events, and the final
    // updateSession call is what stamps ``end_time`` so the session
    // becomes visible on the dashboard.
    const pending = events.slice(uploadedCountRef.current);
    if (pending.length > 0) {
      try {
        await uploadEvents(sessionId, pending);
        uploadedCountRef.current = events.length;
      } catch (err) {
        console.error('Final event upload failed:', err);
      }
    }

    // Persist session metadata — critical. If this fails the session
    // stays "incomplete" on the server (end_time is null) and will be
    // filtered out of every listing. We re-throw so the caller can
    // surface the failure instead of silently dropping the user on the
    // report page for a session that was never saved.
    try {
      await updateSession(sessionId, {
        end_time: new Date().toISOString(),
        duration: timer.elapsed,
        focus_score_final: Math.round(avgScore * 10) / 10,
        time_idle: totals.current.idle,
        time_tab_hidden: totals.current.tabHidden,
        time_face_missing: totals.current.faceMissing,
        time_looking_away: totals.current.lookingAway,
        time_phone_use: totals.current.phoneUse,
      });
    } catch (err) {
      setEnding(false);
      throw err;
    }

    // On success we leave ``ending`` as true: the caller navigates away
    // immediately so the component unmounts. Clearing ``ending`` here
    // would re-expose the idle UI for one render before navigation.
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
    idleDetection,
    events,
    ending,
    startSession,
    pauseSession,
    resumeSession,
    endSession,
  };
}
