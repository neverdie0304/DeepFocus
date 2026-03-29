import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Password change
  const [pw, setPw] = useState({ old_password: '', new_password: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');

  // Delete account
  const [showDelete, setShowDelete] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwMsg('');
    setPwError('');
    try {
      await api.post('/auth/change-password/', pw);
      setPwMsg('Password changed successfully.');
      setPw({ old_password: '', new_password: '' });
    } catch (err) {
      setPwError(err.response?.data?.detail || 'Failed to change password.');
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await api.delete('/auth/delete-account/');
      logout();
      navigate('/');
    } catch {
      setPwError('Failed to delete account.');
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-8 py-4">
      <h2 className="text-2xl font-bold">Settings</h2>

      {/* Privacy Notice */}
      <div className="bg-gray-900 rounded-xl p-6 space-y-2">
        <h3 className="text-lg font-semibold">Privacy</h3>
        <p className="text-gray-400 text-sm leading-relaxed">
          DeepFocus is privacy-first. When camera tracking is enabled, all face detection
          runs locally in your browser using MediaPipe. <strong className="text-white">No images,
          video, or biometric data are ever stored or sent to any server.</strong> Only aggregated
          focus scores and behavioural signals (tab visibility, idle status) are saved to your account.
        </p>
      </div>

      {/* Account Info */}
      <div className="bg-gray-900 rounded-xl p-6 space-y-2">
        <h3 className="text-lg font-semibold">Account</h3>
        <p className="text-gray-400 text-sm">Username: <span className="text-white">{user?.username}</span></p>
        <p className="text-gray-400 text-sm">Email: <span className="text-white">{user?.email}</span></p>
      </div>

      {/* Change Password */}
      <form onSubmit={handlePasswordChange} className="bg-gray-900 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold">Change Password</h3>
        {pwMsg && <div className="text-green-400 text-sm">{pwMsg}</div>}
        {pwError && <div className="text-red-400 text-sm">{pwError}</div>}
        <input
          type="password"
          placeholder="Current password"
          value={pw.old_password}
          onChange={(e) => setPw({ ...pw, old_password: e.target.value })}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
          required
        />
        <input
          type="password"
          placeholder="New password (min 8 characters)"
          value={pw.new_password}
          onChange={(e) => setPw({ ...pw, new_password: e.target.value })}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
          required
          minLength={8}
        />
        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded"
        >
          Update Password
        </button>
      </form>

      {/* Delete Account */}
      <div className="bg-gray-900 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-red-400">Danger Zone</h3>
        {!showDelete ? (
          <button
            onClick={() => setShowDelete(true)}
            className="bg-red-900/50 hover:bg-red-900 text-red-300 text-sm px-4 py-2 rounded border border-red-800"
          >
            Delete Account
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">
              This will permanently delete your account and all session data. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteAccount}
                className="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-2 rounded"
              >
                Confirm Delete
              </button>
              <button
                onClick={() => setShowDelete(false)}
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-4 py-2 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
