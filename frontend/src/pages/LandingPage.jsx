import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center">
      <h1 className="text-5xl font-bold mb-4">DeepFocus</h1>
      <p className="text-gray-400 text-lg max-w-md mb-8">
        Privacy-first focus tracker. Measure your productivity using browser signals
        and on-device AI — no data ever leaves your browser.
      </p>
      {user ? (
        <Link
          to="/session"
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg text-lg"
        >
          Start a Session
        </Link>
      ) : (
        <div className="flex gap-4">
          <Link
            to="/signup"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg"
          >
            Get Started
          </Link>
          <Link
            to="/login"
            className="border border-gray-600 hover:border-gray-400 text-gray-300 px-6 py-3 rounded-lg"
          >
            Login
          </Link>
        </div>
      )}
    </div>
  );
}
