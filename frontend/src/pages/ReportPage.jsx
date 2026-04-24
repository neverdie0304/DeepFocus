import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import { getSession, updateSession, submitSelfReport, deleteSession } from '../api/sessions';
import { formatTime } from '../utils/scoring';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

export default function ReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [tag, setTag] = useState('');
  const [selfReportScore, setSelfReportScore] = useState(null);
  const [selfReportSaved, setSelfReportSaved] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  useEffect(() => {
    getSession(id)
      .then((data) => {
        setSession(data);
        setNote(data.note || '');
        setTag(data.tag || '');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleSaveNote = async () => {
    try {
      await updateSession(id, { note, tag });
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 3000);
    } catch {
      alert('Failed to save note.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <div className="text-center py-20 text-gray-400">Session not found.</div>;
  }

  const score = session.focus_score_final ?? 0;
  const scoreColor = score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400';

  // Timeline chart data
  const events = session.events || [];
  const timelineLabels = events.map((e, i) => {
    const seconds = i * 2;
    return formatTime(seconds);
  });
  const timelineData = {
    labels: timelineLabels,
    datasets: [{
      label: 'Focus Score',
      data: events.map((e) => e.focus_score),
      borderColor: '#818cf8',
      backgroundColor: 'rgba(129, 140, 248, 0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
    }],
  };
  const timelineOptions = {
    responsive: true,
    scales: {
      y: { min: 0, max: 100, ticks: { color: '#9ca3af' }, grid: { color: '#374151' } },
      x: {
        ticks: {
          color: '#9ca3af',
          maxTicksLimit: 10,
        },
        grid: { color: '#374151' },
      },
    },
    plugins: { legend: { display: false } },
  };

  // Breakdown doughnut
  const phoneUse = session.time_phone_use ?? 0;
  const focused = Math.max(
    0,
    session.duration
      - session.time_idle
      - session.time_tab_hidden
      - session.time_face_missing
      - session.time_looking_away
      - phoneUse,
  );
  const breakdownData = {
    labels: ['Focused', 'Idle', 'Tab Hidden', 'Face Missing', 'Looking Away', 'Phone Use'],
    datasets: [{
      data: [
        focused,
        session.time_idle,
        session.time_tab_hidden,
        session.time_face_missing,
        session.time_looking_away,
        phoneUse,
      ],
      backgroundColor: ['#22c55e', '#eab308', '#ef4444', '#f97316', '#a855f7', '#fb923c'],
      borderWidth: 0,
    }],
  };
  const breakdownOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#9ca3af' } },
    },
  };

  // Determine main distraction
  const distractions = [
    { name: 'idle time', value: session.time_idle },
    { name: 'tab-hidden time', value: session.time_tab_hidden },
    { name: 'face missing', value: session.time_face_missing },
    { name: 'looking away', value: session.time_looking_away },
    { name: 'phone use', value: phoneUse },
  ].sort((a, b) => b.value - a.value);

  const topDistraction = distractions[0];

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Session Report</h2>
        <Link to="/dashboard" className="text-indigo-400 hover:text-indigo-300 text-sm">
          Back to Dashboard
        </Link>
      </div>

      {/* Overall Score */}
      <div className="bg-gray-900 rounded-xl p-8 text-center">
        <p className="text-gray-400 text-sm mb-2">Overall Focus Score</p>
        <p className={`text-6xl font-bold ${scoreColor}`}>{Math.round(score)}</p>
        <p className="text-gray-500 text-sm mt-2">
          Duration: {formatTime(session.duration)} | Mode: {session.mode === 'camera_on' ? 'Camera On' : 'Camera Off'}
        </p>
      </div>

      {/* Score Explanation */}
      {topDistraction && topDistraction.value > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 text-sm text-gray-400">
          Score was mainly affected by <span className="text-white font-medium">{formatTime(Math.round(topDistraction.value))}</span> of {topDistraction.name}.
        </div>
      )}

      {/* Timeline Chart */}
      {events.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Focus Over Time</h3>
          <Line data={timelineData} options={timelineOptions} />
        </div>
      )}

      {/* Breakdown Chart */}
      <div className="bg-gray-900 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Time Breakdown</h3>
        <div className="max-w-xs mx-auto">
          <Doughnut data={breakdownData} options={breakdownOptions} />
        </div>
      </div>

      {/* Post-Session Self-Report */}
      {!selfReportSaved && (
        <div className="bg-gray-900 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold">How focused were you overall?</h3>
          <p className="text-xs text-gray-500">This helps train the ML model. Your rating is used as ground-truth data.</p>
          <div className="flex gap-2 items-center">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                onClick={() => setSelfReportScore(n)}
                className={`w-9 h-9 rounded-lg text-xs font-bold transition-colors ${
                  selfReportScore === n
                    ? 'bg-indigo-600 text-white'
                    : n <= 3 ? 'bg-red-900/40 text-red-400 hover:bg-red-800/60'
                    : n <= 6 ? 'bg-yellow-900/40 text-yellow-400 hover:bg-yellow-800/60'
                    : 'bg-green-900/40 text-green-400 hover:bg-green-800/60'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {selfReportScore && (
            <button
              onClick={async () => {
                await submitSelfReport(id, {
                  timestamp: new Date().toISOString(),
                  report_type: 'post_session',
                  score: selfReportScore,
                });
                setSelfReportSaved(true);
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded"
            >
              Submit Rating
            </button>
          )}
        </div>
      )}
      {selfReportSaved && (
        <div className="bg-gray-900 rounded-xl p-4 text-center text-sm text-green-400">
          Self-report saved ({selfReportScore}/10). Thank you!
        </div>
      )}

      {/* Notes & Tag */}
      <div className="bg-gray-900 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold">Session Notes</h3>
        <div className="flex gap-2">
          {['reading', 'coding', 'revision', 'writing', 'other'].map((t) => (
            <button
              key={t}
              onClick={() => setTag(t)}
              className={`px-3 py-1 rounded-full text-xs capitalize ${
                tag === t ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note about this session..."
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
          rows={3}
          maxLength={200}
        />
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveNote}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded"
          >
            Save Note
          </button>
          {noteSaved && (
            <span className="text-green-400 text-sm">Saved!</span>
          )}
        </div>
      </div>

      {/* Delete Session */}
      <div className="border border-red-900/50 rounded-xl p-6">
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-red-400 hover:text-red-300 text-sm"
          >
            Delete this session
          </button>
        ) : (
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">Are you sure?</span>
            <button
              onClick={async () => {
                await deleteSession(id);
                navigate('/dashboard');
              }}
              className="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-2 rounded"
            >
              Yes, delete
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="text-gray-400 hover:text-gray-300 text-sm"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
