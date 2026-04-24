/**
 * useFaceDetection
 *
 * React hook that acquires the webcam and runs MediaPipe FaceLandmarker on
 * each frame at ~10 FPS, exposing a set of continuous visual features
 * (head pose, EAR, iris-based gaze, engagement-relevant blendshapes) plus
 * the raw MediaStream for optional preview.
 *
 * All processing happens locally in the browser. The hook also exposes two
 * backward-compatible boolean flags (``facePresent``, ``lookingAway``) so
 * that callers of the first-generation system continue to work.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CAMERA_HEIGHT,
  CAMERA_WIDTH,
  FACE_LANDMARKER_MODEL_URL,
  FRAME_INTERVAL_MS,
  MEDIAPIPE_WASM_URL,
  OBJECT_DETECTOR_MODEL_URL,
  PHONE_CLASS_NAME,
  PHONE_SCORE_THRESHOLD,
  PITCH_THRESHOLD_DEG,
  YAW_THRESHOLD_DEG,
} from '../constants';
import { computeEAR } from '../utils/features/ear';
import { computeGaze } from '../utils/features/gaze';
import {
  estimatePoseFromLandmarks,
  extractEulerAngles,
} from '../utils/features/headPose';
import {
  L_EYE,
  LEFT_IRIS_CENTER,
  NOSE_TIP,
  R_EYE,
} from '../utils/features/landmarks';

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
  // Object detection — phone usage
  phonePresent: false,
  phoneConfidence: 0,
  // Blendshapes — engagement-relevant subset
  browDownLeft: 0,
  browDownRight: 0,
  browInnerUp: 0,
  eyeSquintLeft: 0,
  eyeSquintRight: 0,
  eyeWideLeft: 0,
  eyeWideRight: 0,
  jawOpen: 0,
  mouthFrownLeft: 0,
  mouthFrownRight: 0,
  mouthSmileLeft: 0,
  mouthSmileRight: 0,
};

/**
 * Round a float to a fixed number of decimal places.
 *
 * @param {number} value
 * @param {number} places
 * @returns {number}
 */
function roundTo(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * @typedef {Object} FaceFeatures
 * @property {number} headYaw - Head rotation about the vertical axis, degrees.
 * @property {number} headPitch - Head rotation about the lateral axis, degrees.
 * @property {number} headRoll - Head tilt about the depth axis, degrees.
 * @property {number} earLeft - Left-eye EAR.
 * @property {number} earRight - Right-eye EAR.
 * @property {number} gazeX - Iris-based horizontal gaze in [-1, 1].
 * @property {number} gazeY - Iris-based vertical gaze in [-1, 1].
 * @property {number} faceConfidence - 1 if a face was detected, else 0.
 * @property {boolean} facePresent - Backward-compat: face is currently detected.
 * @property {boolean} lookingAway - Backward-compat: head orientation exceeds threshold.
 * @property {number} browDownLeft - Blendshape coefficient.
 * @property {number} browDownRight
 * @property {number} browInnerUp
 * @property {number} eyeSquintLeft
 * @property {number} eyeSquintRight
 * @property {number} eyeWideLeft
 * @property {number} eyeWideRight
 * @property {number} jawOpen
 * @property {number} mouthFrownLeft
 * @property {number} mouthFrownRight
 * @property {number} mouthSmileLeft
 * @property {number} mouthSmileRight
 */

/**
 * Hook entry point.
 *
 * @param {boolean} enabled - When false, the camera and detector are torn down.
 * @returns {FaceFeatures & {
 *   cameraReady: boolean,
 *   error: string|null,
 *   videoRef: React.MutableRefObject<HTMLVideoElement|null>,
 *   stream: MediaStream|null,
 * }}
 */
export default function useFaceDetection(enabled = false) {
  const [features, setFeatures] = useState(DEFAULT_FEATURES);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState(null);
  const [stream, setStream] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const objectDetectorRef = useRef(null);
  const rafRef = useRef(null);
  const lastProcessRef = useRef(0);

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
    }
    if (landmarkerRef.current) {
      landmarkerRef.current.close?.();
      landmarkerRef.current = null;
    }
    if (objectDetectorRef.current) {
      objectDetectorRef.current.close?.();
      objectDetectorRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.remove();
      videoRef.current = null;
    }
    setCameraReady(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      stopCamera();
      return undefined;
    }

    let cancelled = false;

    async function init() {
      try {
        // 1. Acquire the webcam stream.
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: CAMERA_WIDTH, height: CAMERA_HEIGHT, facingMode: 'user' },
        });
        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = mediaStream;
        setStream(mediaStream);

        // 2. Attach to a <video> for MediaPipe to read from. The element
        //    MUST be in the DOM — Chrome/Safari can pause detached video
        //    elements under memory pressure, which causes detectForVideo
        //    to keep returning the last rendered frame. That silently
        //    "freezes" facePresent=true even when the user has left the
        //    camera, flattening the focus-score graph.
        const video = document.createElement('video');
        video.srcObject = mediaStream;
        video.setAttribute('playsinline', '');
        video.muted = true;
        video.style.position = 'fixed';
        video.style.width = '1px';
        video.style.height = '1px';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';
        video.style.left = '-1px';
        video.style.top = '-1px';
        document.body.appendChild(video);
        await video.play();
        videoRef.current = video;

        // 3. Load the MediaPipe FaceLandmarker (v2 with blendshapes).
        const vision = await import('@mediapipe/tasks-vision');
        if (cancelled) { stopCamera(); return; }

        const { FaceLandmarker, FilesetResolver, ObjectDetector } = vision;
        const filesetResolver = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
        if (cancelled) { stopCamera(); return; }

        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: FACE_LANDMARKER_MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
        if (cancelled) { landmarker.close(); stopCamera(); return; }
        landmarkerRef.current = landmarker;

        // 3b. Load the MediaPipe ObjectDetector (EfficientDet-Lite0) for
        //     phone detection. Kept in the same hook so both detectors
        //     share the video element and frame cadence. Detection is
        //     best-effort — if model load fails, we still run face
        //     detection and leave phone features at their defaults.
        let objectDetector = null;
        try {
          objectDetector = await ObjectDetector.createFromOptions(filesetResolver, {
            baseOptions: {
              modelAssetPath: OBJECT_DETECTOR_MODEL_URL,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            scoreThreshold: PHONE_SCORE_THRESHOLD,
            maxResults: 5,
          });
          if (cancelled) { objectDetector.close(); landmarker.close(); stopCamera(); return; }
          objectDetectorRef.current = objectDetector;
        } catch {
          // Non-fatal: the rest of the pipeline continues without phone
          // detection. phonePresent stays false for the session.
        }

        setCameraReady(true);

        // 4. Run the detection loop at the configured frame interval.
        function detect(timestamp) {
          if (cancelled) return;
          if (timestamp - lastProcessRef.current >= FRAME_INTERVAL_MS) {
            lastProcessRef.current = timestamp;
            try {
              processFrame(landmarker, objectDetector, video);
            } catch {
              // Skip frame on transient errors.
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

    /** Extract the highest-confidence phone detection from an ObjectDetector result. */
    function extractPhone(objectResults) {
      if (!objectResults || !objectResults.detections) {
        return { phonePresent: false, phoneConfidence: 0 };
      }
      let best = 0;
      for (const det of objectResults.detections) {
        const cat = det.categories && det.categories[0];
        if (cat && cat.categoryName === PHONE_CLASS_NAME && cat.score > best) {
          best = cat.score;
        }
      }
      return {
        phonePresent: best >= PHONE_SCORE_THRESHOLD,
        phoneConfidence: best,
      };
    }

    /** Process a single detector result and update feature state. */
    function processFrame(landmarker, objectDetector, video) {
      const ts = performance.now();
      const results = landmarker.detectForVideo(video, ts);
      const objectResults = objectDetector
        ? objectDetector.detectForVideo(video, ts)
        : null;
      const { phonePresent, phoneConfidence } = extractPhone(objectResults);

      const hasFace = results.faceLandmarks && results.faceLandmarks.length > 0;

      if (!hasFace) {
        // Keep phone detection even when the face is gone — the user may
        // be looking down at the phone just below the camera frame.
        setFeatures({
          ...DEFAULT_FEATURES,
          phonePresent,
          phoneConfidence: roundTo(phoneConfidence, 3),
        });
        return;
      }

      const lm = results.faceLandmarks[0];

      // Head pose: prefer the transformation matrix, fall back to geometry.
      const matrices = results.facialTransformationMatrixes;
      const pose = matrices && matrices.length > 0
        ? extractEulerAngles(matrices[0])
        : estimatePoseFromLandmarks(lm);

      // Eye Aspect Ratio
      const earLeft = computeEAR(lm, L_EYE);
      const earRight = computeEAR(lm, R_EYE);

      // Iris-based gaze (only if iris landmarks present)
      const hasIris = lm.length > LEFT_IRIS_CENTER;
      const { gazeX, gazeY } = hasIris ? computeGaze(lm) : { gazeX: 0, gazeY: 0 };

      // Detection confidence (binary since FaceLandmarker doesn't expose it directly)
      const faceConfidence = lm[NOSE_TIP] ? 1.0 : 0.0;

      // Blendshapes — pull the subset we care about into a map.
      const blendshapes = {};
      if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
        for (const cat of results.faceBlendshapes[0].categories) {
          blendshapes[cat.categoryName] = roundTo(cat.score, 3);
        }
      }

      const lookingAway =
        Math.abs(pose.yaw) > YAW_THRESHOLD_DEG
        || Math.abs(pose.pitch) > PITCH_THRESHOLD_DEG;

      setFeatures({
        headYaw: roundTo(pose.yaw, 1),
        headPitch: roundTo(pose.pitch, 1),
        headRoll: roundTo(pose.roll, 1),
        earLeft: roundTo(earLeft, 3),
        earRight: roundTo(earRight, 3),
        gazeX: roundTo(gazeX, 3),
        gazeY: roundTo(gazeY, 3),
        faceConfidence,
        facePresent: true,
        lookingAway,
        phonePresent,
        phoneConfidence: roundTo(phoneConfidence, 3),
        browDownLeft: blendshapes.browDownLeft ?? 0,
        browDownRight: blendshapes.browDownRight ?? 0,
        browInnerUp: blendshapes.browInnerUp ?? 0,
        eyeSquintLeft: blendshapes.eyeSquintLeft ?? 0,
        eyeSquintRight: blendshapes.eyeSquintRight ?? 0,
        eyeWideLeft: blendshapes.eyeWideLeft ?? 0,
        eyeWideRight: blendshapes.eyeWideRight ?? 0,
        jawOpen: blendshapes.jawOpen ?? 0,
        mouthFrownLeft: blendshapes.mouthFrownLeft ?? 0,
        mouthFrownRight: blendshapes.mouthFrownRight ?? 0,
        mouthSmileLeft: blendshapes.mouthSmileLeft ?? 0,
        mouthSmileRight: blendshapes.mouthSmileRight ?? 0,
      });
    }

    init();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [enabled, stopCamera]);

  return {
    ...features,
    cameraReady,
    error,
    videoRef,
    stream,
  };
}
