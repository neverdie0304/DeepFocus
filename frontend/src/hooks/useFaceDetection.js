import { useState, useRef, useEffect, useCallback } from 'react';

/* ───────────────────────────────────────────────────
   Landmark indices (MediaPipe Face Mesh 478 points)
   ─────────────────────────────────────────────────── */
// Head-pose reference points
const NOSE_TIP = 1;
const CHIN = 152;
const LEFT_EYE_OUTER = 263;
const RIGHT_EYE_OUTER = 33;
const LEFT_MOUTH = 287;
const RIGHT_MOUTH = 57;

// EAR (Eye Aspect Ratio) – right eye
const R_EYE = [33, 160, 158, 133, 153, 144];
// EAR – left eye
const L_EYE = [362, 385, 387, 263, 373, 380];

// Iris centres (available when FaceLandmarker outputs iris)
const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;

// Left eye corners for gaze normalisation
const L_EYE_INNER = 362;
const L_EYE_OUTER = 263;
// Right eye corners for gaze normalisation
const R_EYE_INNER = 133;
const R_EYE_OUTER = 33;

/* ───────────────────────────────────────────────────
   Helper: Euclidean distance between two landmarks
   ─────────────────────────────────────────────────── */
function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z || 0) - (b.z || 0)) ** 2);
}

/* ───────────────────────────────────────────────────
   Helper: Eye Aspect Ratio (Soukupová & Čech, 2016)
   EAR = (|p2-p6| + |p3-p5|) / (2·|p1-p4|)
   ─────────────────────────────────────────────────── */
function computeEAR(landmarks, indices) {
  const [p1, p2, p3, p4, p5, p6] = indices.map((i) => landmarks[i]);
  const vertical1 = dist(p2, p6);
  const vertical2 = dist(p3, p5);
  const horizontal = dist(p1, p4);
  if (horizontal === 0) return 0;
  return (vertical1 + vertical2) / (2 * horizontal);
}

/* ───────────────────────────────────────────────────
   Helper: Extract yaw / pitch / roll from the 4×4
   facial transformation matrix returned by MediaPipe.
   Matrix is column-major (WebGL convention).
   ─────────────────────────────────────────────────── */
function extractEulerAngles(matrix) {
  // matrix.data is a Float32Array of 16 elements (column-major 4×4)
  const m = matrix.data;
  // column-major → m[row + col*4]
  const r00 = m[0], r01 = m[4], r02 = m[8];
  const r10 = m[1], r11 = m[5], r12 = m[9];
  const r20 = m[2], r21 = m[6], r22 = m[10];

  // Standard ZYX Euler extraction
  const sy = Math.sqrt(r00 * r00 + r10 * r10);
  const singular = sy < 1e-6;

  let pitch, yaw, roll;
  if (!singular) {
    pitch = Math.atan2(r21, r22);          // X rotation
    yaw = Math.atan2(-r20, sy);            // Y rotation
    roll = Math.atan2(r10, r00);           // Z rotation
  } else {
    pitch = Math.atan2(-r12, r11);
    yaw = Math.atan2(-r20, sy);
    roll = 0;
  }

  const toDeg = 180 / Math.PI;
  return {
    yaw: yaw * toDeg,
    pitch: pitch * toDeg,
    roll: roll * toDeg,
  };
}

/* ───────────────────────────────────────────────────
   Helper: Head pose from landmark geometry (fallback
   when transformation matrix is unavailable)
   ─────────────────────────────────────────────────── */
function estimatePoseFromLandmarks(lm) {
  const nose = lm[NOSE_TIP];
  const chin = lm[CHIN];
  const leftEye = lm[LEFT_EYE_OUTER];
  const rightEye = lm[RIGHT_EYE_OUTER];
  const leftMouth = lm[LEFT_MOUTH];
  const rightMouth = lm[RIGHT_MOUTH];

  // Face centre (midpoint of eyes)
  const cx = (leftEye.x + rightEye.x) / 2;
  const cy = (leftEye.y + rightEye.y) / 2;

  // Yaw: horizontal offset of nose from face centre (rough approx)
  const faceWidth = dist(leftEye, rightEye);
  const yaw = faceWidth > 0 ? ((nose.x - cx) / faceWidth) * 90 : 0;

  // Pitch: vertical offset of nose from midpoint of eyes-to-chin line
  const faceMidY = (cy + chin.y) / 2;
  const faceHeight = Math.abs(chin.y - cy);
  const pitch = faceHeight > 0 ? ((nose.y - faceMidY) / faceHeight) * 90 : 0;

  // Roll: tilt angle between eyes
  const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);

  return { yaw, pitch, roll };
}

/* ───────────────────────────────────────────────────
   Helper: Iris-based gaze direction
   Normalised position of iris within eye opening
   Returns values roughly in [-1, 1]
   ─────────────────────────────────────────────────── */
function computeGaze(landmarks) {
  // Left eye gaze
  const lIris = landmarks[LEFT_IRIS_CENTER];
  const lInner = landmarks[L_EYE_INNER];
  const lOuter = landmarks[L_EYE_OUTER];

  // Right eye gaze
  const rIris = landmarks[RIGHT_IRIS_CENTER];
  const rInner = landmarks[R_EYE_INNER];
  const rOuter = landmarks[R_EYE_OUTER];

  if (!lIris || !rIris) return { gazeX: 0, gazeY: 0 };

  // Horizontal: where iris sits between inner and outer corners (0 = outer, 1 = inner)
  const lWidth = dist(lInner, lOuter);
  const rWidth = dist(rInner, rOuter);

  // Map iris x position to [-1, 1] (0 = centred in eye)
  const lRatioX = lWidth > 0 ? (lIris.x - (lOuter.x + lInner.x) / 2) / (lWidth / 2) : 0;
  const rRatioX = rWidth > 0 ? (rIris.x - (rOuter.x + rInner.x) / 2) / (rWidth / 2) : 0;
  const gazeX = (lRatioX + rRatioX) / 2;

  // Vertical: relative to eye centre y
  const lMidY = (lOuter.y + lInner.y) / 2;
  const rMidY = (rOuter.y + rInner.y) / 2;
  const lRatioY = lWidth > 0 ? (lIris.y - lMidY) / (lWidth / 2) : 0;
  const rRatioY = rWidth > 0 ? (rIris.y - rMidY) / (rWidth / 2) : 0;
  const gazeY = (lRatioY + rRatioY) / 2;

  return {
    gazeX: Math.max(-1, Math.min(1, gazeX)),
    gazeY: Math.max(-1, Math.min(1, gazeY)),
  };
}

/* ───────────────────────────────────────────────────
   Default (no-detection) feature values
   ─────────────────────────────────────────────────── */
const DEFAULT_FEATURES = {
  headYaw: 0,
  headPitch: 0,
  headRoll: 0,
  earLeft: 0.3,
  earRight: 0.3,
  gazeX: 0,
  gazeY: 0,
  faceConfidence: 0,
  facePresent: false,
  lookingAway: false,
};

/* ═══════════════════════════════════════════════════
   Hook: useFaceDetection
   Upgraded to MediaPipe FaceLandmarker (Face Mesh)
   ═══════════════════════════════════════════════════ */
export default function useFaceDetection(enabled = false) {
  const [features, setFeatures] = useState(DEFAULT_FEATURES);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const rafRef = useRef(null);
  const lastProcessRef = useRef(0);

  const FPS = 10;
  const FRAME_INTERVAL = 1000 / FPS;

  // Thresholds for backward-compatible booleans
  const YAW_THRESHOLD = 25;     // degrees
  const PITCH_THRESHOLD = 20;   // degrees

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (landmarkerRef.current) {
      landmarkerRef.current.close?.();
      landmarkerRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      stopCamera();
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        /* ── 1. Camera stream ── */
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;

        const video = document.createElement('video');
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        video.muted = true;
        await video.play();
        videoRef.current = video;

        /* ── 2. Load MediaPipe FaceLandmarker ── */
        const vision = await import('@mediapipe/tasks-vision');
        if (cancelled) { stopCamera(); return; }

        const { FaceLandmarker, FilesetResolver } = vision;
        const filesetResolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
        );
        if (cancelled) { stopCamera(); return; }

        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.tflite',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: true,
        });
        if (cancelled) { landmarker.close(); stopCamera(); return; }

        landmarkerRef.current = landmarker;
        setCameraReady(true);

        /* ── 3. Detection loop ── */
        function detect(timestamp) {
          if (cancelled) return;
          if (timestamp - lastProcessRef.current >= FRAME_INTERVAL) {
            lastProcessRef.current = timestamp;
            try {
              const results = landmarker.detectForVideo(video, timestamp);
              const hasFace = results.faceLandmarks && results.faceLandmarks.length > 0;

              if (hasFace) {
                const lm = results.faceLandmarks[0]; // 478 landmarks

                // Head pose: prefer transformation matrix, fall back to geometry
                let pose;
                if (
                  results.facialTransformationMatrixes &&
                  results.facialTransformationMatrixes.length > 0
                ) {
                  pose = extractEulerAngles(results.facialTransformationMatrixes[0]);
                } else {
                  pose = estimatePoseFromLandmarks(lm);
                }

                // Eye Aspect Ratio
                const earLeft = computeEAR(lm, L_EYE);
                const earRight = computeEAR(lm, R_EYE);

                // Iris-based gaze
                const { gazeX, gazeY } = lm.length > LEFT_IRIS_CENTER
                  ? computeGaze(lm)
                  : { gazeX: 0, gazeY: 0 };

                // Face confidence (use first detection score if available)
                const faceConfidence = lm[NOSE_TIP] ? 1.0 : 0.0;

                // Backward-compatible boolean: looking away
                const lookingAway =
                  Math.abs(pose.yaw) > YAW_THRESHOLD ||
                  Math.abs(pose.pitch) > PITCH_THRESHOLD;

                setFeatures({
                  headYaw: Math.round(pose.yaw * 10) / 10,
                  headPitch: Math.round(pose.pitch * 10) / 10,
                  headRoll: Math.round(pose.roll * 10) / 10,
                  earLeft: Math.round(earLeft * 1000) / 1000,
                  earRight: Math.round(earRight * 1000) / 1000,
                  gazeX: Math.round(gazeX * 1000) / 1000,
                  gazeY: Math.round(gazeY * 1000) / 1000,
                  faceConfidence,
                  facePresent: true,
                  lookingAway,
                });
              } else {
                setFeatures({ ...DEFAULT_FEATURES });
              }
            } catch {
              // Skip frame on error
            }
          }
          rafRef.current = requestAnimationFrame(detect);
        }
        rafRef.current = requestAnimationFrame(detect);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Camera initialization failed');
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [enabled, stopCamera]);

  // Expose backward-compatible shape + new features
  return {
    ...features,
    cameraReady,
    error,
    videoRef,
  };
}
