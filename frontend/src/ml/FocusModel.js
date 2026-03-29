/**
 * FocusModel.js — Browser-side ML inference for focus score prediction.
 *
 * Loads TensorFlow.js from CDN at runtime (avoids bundling the 3MB library).
 * Falls back to rule-based scoring if the model or TF.js fails to load.
 */

let tf = null;
let model = null;
let modelMeta = null;
let loadAttempted = false;
let loadFailed = false;

const MODEL_URL = '/models/focus_model/model.json';
const META_URL = '/models/focus_model/model_meta.json';
const TFJS_CDN = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';

/**
 * Load TF.js from CDN by injecting a script tag.
 */
function loadTfjsFromCDN() {
  return new Promise((resolve, reject) => {
    if (window.tf) { resolve(window.tf); return; }

    const script = document.createElement('script');
    script.src = TFJS_CDN;
    script.async = true;
    script.onload = () => resolve(window.tf);
    script.onerror = () => reject(new Error('Failed to load TensorFlow.js from CDN'));
    document.head.appendChild(script);
  });
}

/**
 * Load the TF.js model and metadata. Call once at app startup.
 * Non-blocking: if model doesn't exist, falls back gracefully.
 */
export async function loadModel() {
  if (loadAttempted) return !loadFailed;
  loadAttempted = true;

  try {
    // Load metadata first — if this fails, there's no model deployed
    const metaResp = await fetch(META_URL);
    if (!metaResp.ok) throw new Error('Model metadata not found');
    modelMeta = await metaResp.json();

    // Load TF.js from CDN
    tf = await loadTfjsFromCDN();

    // Load TF.js graph model
    model = await tf.loadGraphModel(MODEL_URL);

    console.log('[FocusModel] ML model loaded successfully');
    return true;
  } catch (err) {
    loadFailed = true;
    console.log('[FocusModel] ML model not available, using rule-based fallback:', err.message);
    return false;
  }
}

/**
 * Check if the ML model is loaded and ready.
 */
export function isModelLoaded() {
  return model !== null && modelMeta !== null && tf !== null;
}

/**
 * Predict focus score from a feature vector.
 *
 * @param {Object} featureVector - Output from assembleFeatureVector()
 * @param {Object} scalerParams - Z-score normalisation params from training
 * @returns {number|null} Predicted focus score (0-100), or null if model unavailable
 */
export async function predictFocusScore(featureVector, scalerParams = null) {
  if (!isModelLoaded()) return null;

  try {
    const features = modelMeta.features;

    // Build input tensor in the same feature order as training
    const values = features.map((name) => {
      let val = featureVector[name] ?? 0;

      // Apply Z-score normalisation if scaler params provided
      if (scalerParams && scalerParams[name]) {
        const { mean, std } = scalerParams[name];
        val = (val - mean) / (std || 1);
      }

      return val;
    });

    const inputTensor = tf.tensor2d([values], [1, features.length]);
    const prediction = model.predict(inputTensor);
    const score = (await prediction.data())[0];

    // Cleanup tensors
    inputTensor.dispose();
    prediction.dispose();

    // Clamp to valid range
    return Math.max(0, Math.min(100, score));
  } catch (err) {
    console.error('[FocusModel] Prediction error:', err);
    return null;
  }
}
