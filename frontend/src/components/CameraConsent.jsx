export default function CameraConsent({ onAccept, onDecline }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl p-6 max-w-md mx-4 space-y-4">
        <h3 className="text-lg font-bold">Enable Camera Tracking</h3>
        <p className="text-gray-400 text-sm leading-relaxed">
          DeepFocus uses your webcam to detect face presence and gaze direction,
          improving focus score accuracy. <strong className="text-white">All processing
          happens locally in your browser.</strong> No images or video are ever stored
          or sent to any server.
        </p>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onAccept}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded"
          >
            Enable Camera
          </button>
          <button
            onClick={onDecline}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded"
          >
            Continue Without
          </button>
        </div>
      </div>
    </div>
  );
}
