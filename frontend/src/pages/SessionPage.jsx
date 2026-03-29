import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useSession from '../hooks/useSession';
import useFaceDetection from '../hooks/useFaceDetection';
import FocusGauge from '../components/FocusGauge';
import CameraConsent from '../components/CameraConsent';
import ESMPopup from '../components/ESMPopup';
import { formatTime } from '../utils/scoring';

export default function SessionPage() {
  const navigate = useNavigate();
  const session = useSession();
  const [showConsent, setShowConsent] = useState(false);
  const face = useFaceDetection(session.cameraEnabled && session.status !== 'idle');

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
      });
    }
  }, [
    face.facePresent, face.lookingAway, face.headYaw, face.headPitch,
    face.headRoll, face.earLeft, face.earRight, face.gazeX, face.gazeY,
    face.faceConfidence, session.cameraEnabled,
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
    const id = await session.endSession();
    if (id) navigate(`/session/${id}/report`);
  };

  const isIdle = session.status === 'idle';
  const isRunning = session.status === 'running';
  const isPaused = session.status === 'paused';

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      {showConsent && (
        <CameraConsent onAccept={handleConsentAccept} onDecline={handleConsentDecline} />
      )}

      {/* Timer */}
      <div className="text-7xl font-mono font-bold tracking-wider">
        {formatTime(session.elapsed)}
      </div>

      {/* Focus Gauge */}
      {!isIdle && <FocusGauge score={session.currentScore} />}

      {/* Signal Indicators */}
      {!isIdle && (
        <div className="flex flex-wrap justify-center gap-6 text-sm">
          <div className={`flex items-center gap-1.5 ${session.signals.isTabHidden ? 'text-red-400' : 'text-gray-500'}`}>
            <span className={`w-2 h-2 rounded-full ${session.signals.isTabHidden ? 'bg-red-400' : 'bg-gray-600'}`} />
            Tab {session.signals.isTabHidden ? 'Hidden' : 'Visible'}
          </div>
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
