import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { listSessions } from '../api/sessions';
import { formatTime } from '../utils/scoring';

const PAGE_SIZE = 20;

export default function HistoryPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalPages = Math.ceil(sessions.length / PAGE_SIZE);
  const displayed = sessions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Session History</h2>
        <Link to="/dashboard" className="text-indigo-400 hover:text-indigo-300 text-sm">
          Back to Dashboard
        </Link>
      </div>

      {sessions.length === 0 && (
        <div className="text-center py-10 text-gray-500">
          No sessions yet. <Link to="/session" className="text-indigo-400">Start one!</Link>
        </div>
      )}

      <div className="space-y-2">
        {displayed.map((s) => {
          const score = s.focus_score_final ?? 0;
          const scoreColor = score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400';
          const date = new Date(s.start_time);
          const dateStr = date.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
          const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

          return (
            <Link
              key={s.id}
              to={`/session/${s.id}/report`}
              className="flex items-center justify-between bg-gray-900 hover:bg-gray-800 rounded-lg px-4 py-3 transition-colors hover:ring-1 hover:ring-indigo-500/50"
            >
              <div className="flex items-center gap-4">
                <span className={`text-2xl font-bold w-12 ${scoreColor}`}>
                  {Math.round(score)}
                </span>
                <div>
                  <p className="text-sm text-gray-200">{dateStr} at {timeStr}</p>
                  <p className="text-xs text-gray-500">
                    {formatTime(s.duration)} · {s.mode === 'camera_on' ? 'Camera On' : 'Camera Off'}
                    {s.tag && <span className="ml-2 px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">{s.tag}</span>}
                  </p>
                </div>
              </div>
              <span className="text-gray-600 text-sm">&rarr;</span>
            </Link>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="text-gray-400 hover:text-white disabled:opacity-30 text-sm"
          >
            &larr; Previous
          </button>
          <span className="text-gray-500 text-sm">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="text-gray-400 hover:text-white disabled:opacity-30 text-sm"
          >
            Next &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
