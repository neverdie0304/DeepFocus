import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useSession from '../hooks/useSession';
import useFaceDetection from '../hooks/useFaceDetection';
import FocusGauge from '../components/FocusGauge';
import CameraConsent from '../components/CameraConsent';
import ESMPopup from '../components/ESMPopup';
import { INPUT_REQUIRED_TASKS } from '../constants';
import { formatTime } from '../utils/scoring';

export default function SessionPage() {
  const navigate = useNavigate();
  const session = useSession();
  const [showConsent, setShowConsent] = useState(false);
  const face = useFaceDetection(session.cameraEnabled && session.status !== 'idle');
  const previewRef = useRef(null);

  // Attach camera stream to visible preview element
  useEffect(() => {
    const video = previewRef.current;
    if (!video || !face.stream) return;
    video.srcObject = face.stream;
    video.play().catch(() => {});
  }, [face.stream, face.cameraReady]);

  // Sync full face features into session (includes backward-compatible booleans)
  useEffect(() => {
    if (session.cameraEnabled) {
      session.setFaceFeatures({
        facePresent: face.facePresent,
        lookingAway: face.lookingAway,
        headYaw: face.headYaw,
        headPitch: face.headPitch,
        headRoll: face.headRoll,
        earLeft: face.earLeft,
        earRight: face.earRight,
        gazeX: face.gazeX,
        gazeY: face.gazeY,
        faceConfidence: face.faceConfidence,
        phonePresent: face.phonePresent,
        phoneConfidence: face.phoneConfidence,
      });
    }
  }, [
    face.facePresent, face.lookingAway, face.headYaw, face.headPitch,
    face.headRoll, face.earLeft, face.earRight, face.gazeX, face.gazeY,
    face.faceConfidence, face.phonePresent, face.phoneConfidence,
    session.cameraEnabled,
  ]);

  const handleCameraToggle = (e) => {
    if (e.target.checked) {
      setShowConsent(true);
    } else {
      session.setCameraEnabled(false);
    }
  };

  const handleConsentAccept = () => {
    session.setCameraEnabled(true);
    setShowConsent(false);
  };

  const handleConsentDecline = () => {
    session.setCameraEnabled(false);
    setShowConsent(false);
  };

  const handleStart = async () => {
    await session.startSession();
  };

  const handleEnd = async () => {
    try {
      const id = await session.endSession();
      if (id) navigate(`/session/${id}/report`);
    } catch (err) {
      // Session metadata failed to save — end_time is not set, so the
      // session will not appear on the dashboard. Tell the user so they
      // can retry rather than silently dropping them on a stale view.
      console.error('endSession failed:', err);
      alert(
        'Failed to save the session. Please check your connection and press End Session again.',
      );
    }
  };

  const isIdle = session.status === 'idle';
  const isRunning = session.status === 'running';
  const isPaused = session.status === 'paused';

  // The Idle Detection API gives us system-wide activity detection
  // (vs tab-scope event listeners). For input-required tasks the idle
  // signal is load-bearing: without it we cannot tell "coding in
  // VSCode" apart from "asleep at the keyboard." A warning is shown
  // when either the browser lacks the API or the user declined.
  const idle = session.idleDetection || { supported: false, permission: null };
  const taskNeedsInput = INPUT_REQUIRED_TASKS.has(session.taskType);
  const idleDegraded = taskNeedsInput && (!idle.supported || idle.permission === 'denied');
  const idleWarning = !idle.supported
    ? 'Your browser does not support Idle Detection (Chrome, Edge, or Safari 17+ recommended). Focus scoring for coding and writing will be less accurate — typing in other apps cannot be detected.'
    : idle.permission === 'denied'
      ? 'Idle detection permission was declined. Focus scoring for coding and writing will be less accurate — typing in other apps cannot be detected. Enable it in your browser site settings to fix.'
      : null;

  // Shown while endSession() is running its uploads. Takes priority
  // over isIdle so the task-type UI never flashes during shutdown.
  if (session.ending) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-32">
        <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 text-sm">Saving session…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      {showConsent && (
        <CameraConsent onAccept={handleConsentAccept} onDecline={handleConsentDecline} />
      )}

      {idleDegraded && idleWarning && (
        <div className="w-full max-w-xl bg-yellow-900/30 border border-yellow-700/50 text-yellow-200 rounded-lg px-4 py-3 text-sm">
          <p className="font-medium mb-1">⚠️ Reduced accuracy for {session.taskType}</p>
          <p className="text-yellow-300/90 text-xs leading-relaxed">{idleWarning}</p>
        </div>
      )}

      {/* Timer */}
      <div className="text-7xl font-mono font-bold tracking-wider">
        {formatTime(session.elapsed)}
      </div>

      {/* Focus Gauge */}
      {!isIdle && <FocusGauge score={session.currentScore} />}

      {/* Camera Preview */}
      {!isIdle && session.cameraEnabled && face.stream && (
        <div className="relative w-48 rounded-xl overflow-hidden border border-gray-700 shadow-lg">
          <video
            ref={previewRef}
            autoPlay
            playsInline
            muted
            className="w-full h-auto mirror"
            style={{ transform: 'scaleX(-1)' }}
          />
          {/* Status overlay */}
          <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${
            face.facePresent && !face.lookingAway ? 'bg-green-500' :
            face.facePresent ? 'bg-yellow-500' : 'bg-red-500'
          } shadow-lg`} />
          {!face.facePresent && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <span className="text-red-400 text-xs font-medium">No Face Detected</span>
            </div>
          )}
        </div>
      )}

      {/* Signal Indicators */}
      {!isIdle && (
        <div className="flex flex-wrap justify-center gap-6 text-sm">
          <div className={`flex items-center gap-1.5 ${session.signals.isIdle ? 'text-yellow-400' : 'text-gray-500'}`}>
            <span className={`w-2 h-2 rounded-full ${session.signals.isIdle ? 'bg-yellow-400' : 'bg-gray-600'}`} />
            {session.signals.isIdle ? 'Idle' : 'Active'}
          </div>
          {session.cameraEnabled && (
            <>
              <div className={`flex items-center gap-1.5 ${!face.facePresent ? 'text-red-400' : 'text-gray-500'}`}>
                <span className={`w-2 h-2 rounded-full ${!face.facePresent ? 'bg-red-400' : 'bg-gray-600'}`} />
                {face.facePresent ? 'Face OK' : 'No Face'}
              </div>
              <div className={`flex items-center gap-1.5 ${face.lookingAway ? 'text-yellow-400' : 'text-gray-500'}`}>
                <span className={`w-2 h-2 rounded-full ${face.lookingAway ? 'bg-yellow-400' : 'bg-gray-600'}`} />
                {face.lookingAway ? 'Looking Away' : 'Gaze OK'}
              </div>
              <div className={`flex items-center gap-1.5 ${face.phonePresent ? 'text-orange-400' : 'text-gray-500'}`}>
                <span className={`w-2 h-2 rounded-full ${face.phonePresent ? 'bg-orange-400' : 'bg-gray-600'}`} />
                {face.phonePresent ? 'Phone Detected' : 'No Phone'}
              </div>
            </>
          )}
        </div>
      )}

      {/* Head pose / gaze info */}
      {!isIdle && session.cameraEnabled && face.cameraReady && face.facePresent && (
        <div className="flex flex-wrap justify-center gap-4 text-xs text-gray-500 font-mono">
          <span>Yaw {face.headYaw}°</span>
          <span>Pitch {face.headPitch}°</span>
          <span>EAR {((face.earLeft + face.earRight) / 2).toFixed(2)}</span>
        </div>
      )}

      {/* Camera status */}
      {!isIdle && session.cameraEnabled && (
        <div className="text-xs text-gray-600">
          {face.cameraReady ? 'Face Mesh active (local only)' : 'Loading Face Mesh...'}
          {face.error && <span className="text-red-500 ml-2">{face.error}</span>}
        </div>
      )}

      {/* Task Type Selector (only before session starts) */}
      {isIdle && (
        <div className="w-full max-w-md space-y-3">
          <p className="text-sm text-gray-400 text-center">What are you doing this session?</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'writing', label: 'Writing', icon: '📝' },
              { value: 'coding', label: 'Coding', icon: '💻' },
              { value: 'reading', label: 'Reading', icon: '📚' },
              { value: 'video', label: 'Video', icon: '🎥' },
              { value: 'study', label: 'Study', icon: '✏️' },
              { value: 'other', label: 'Other', icon: '🗂️' },
            ].map((task) => (
              <button
                key={task.value}
                onClick={() => session.setTaskType(task.value)}
                className={`flex flex-col items-center gap-1 py-3 rounded-lg border transition-colors ${
                  session.taskType === task.value
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                <span className="text-xl">{task.icon}</span>
                <span className="text-xs">{task.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Camera Toggle (only before session starts) */}
      {isIdle && (
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={session.cameraEnabled}
            onChange={handleCameraToggle}
            className="accent-indigo-500"
          />
          Enable camera-based tracking
        </label>
      )}

      {/* ESM Popup (random self-report prompt during session) */}
      <ESMPopup sessionId={session.sessionId} isRunning={isRunning} />

      {/* Controls */}
      <div className="flex gap-4">
        {isIdle && (
          <button
            onClick={handleStart}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg text-lg font-medium"
          >
            Start Session
          </button>
        )}
        {isRunning && (
          <>
            <button
              onClick={session.pauseSession}
              className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-3 rounded-lg"
            >
              Pause
            </button>
            <button
              onClick={handleEnd}
              disabled={session.ending}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-3 rounded-lg"
            >
              {session.ending ? 'Saving...' : 'End Session'}
            </button>
          </>
        )}
        {isPaused && (
          <>
            <button
              onClick={session.resumeSession}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg"
            >
              Resume
            </button>
            <button
              onClick={handleEnd}
              disabled={session.ending}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-3 rounded-lg"
            >
              {session.ending ? 'Saving...' : 'End Session'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
