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
import { formatDuration, formatTime } from '../utils/scoring';

const SAMPLE_SECONDS = 2;

// Distraction categories shown in the breakdown. Webcam-derived signals
// always apply (they keep working regardless of tab focus). System-wide
// idle — sourced from the W3C Idle Detection API — applies only for
// task types that require continuous keyboard or mouse input; ``is_idle``
// is always false in events recorded for reading / video / study /
// other sessions, so this row auto-hides via the zero-time filter.
// Tab switches are excluded entirely: the Page Visibility API cannot
// distinguish productive multi-tab workflows from distraction.
const DISTRACTION_META = [
  { key: 'phone_use',     label: 'Phone Use',       color: '#fb923c', emoji: '📱' },
  { key: 'face_missing',  label: 'Away from Desk',  color: '#f97316', emoji: '🚶' },
  { key: 'looking_away',  label: 'Looking Away',    color: '#a855f7', emoji: '👀' },
  { key: 'idle',          label: 'Idle (no input)', color: '#eab308', emoji: '😴' },
];

/**
 * Compute accurate "locked in" seconds from per-event flags.
 *
 * A sample counts as Locked In only when every distraction flag is
 * false. ``is_idle`` here is the system-wide flag from Idle Detection,
 * already gated by task type during sampling — it is only ever true
 * for input-required tasks, so reading / video / study sessions still
 * count as Locked In when the user is attentively idle-to-the-keyboard.
 *
 * Using ``duration - sum(time_*)`` would double-count samples where
 * multiple flags fire at once (e.g. phone + looking away when a user
 * glances at a phone in their lap). Counting events with *no* flag set
 * gives the true share of wholly-focused samples.
 */
function computeLockedInSeconds(events) {
  if (!events || events.length === 0) return 0;
  const clean = events.filter((e) => (
    !e.is_face_missing
      && !e.is_looking_away
      && !e.is_phone_present
      && !e.is_idle
  ));
  return clean.length * SAMPLE_SECONDS;
}

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

  // Per-category totals. Each is reported as cumulative seconds.
  // Locked In is computed from events (accurate per-sample AND across
  // overlapping categories), everything else comes from the session
  // aggregates written at end-of-session.
  const phoneUse = session.time_phone_use ?? 0;
  const lockedIn = computeLockedInSeconds(events);
  const duration = session.duration || 1;  // avoid /0 on empty sessions
  const lockedInPct = Math.min(100, Math.max(0, (lockedIn / duration) * 100));

  const distractionTotals = {
    face_missing: session.time_face_missing,
    looking_away: session.time_looking_away,
    phone_use: phoneUse,
    idle: session.time_idle,
  };

  // Rank distractions by time (desc), drop zero-time ones — nothing to
  // say about categories that never fired.
  const distractionList = DISTRACTION_META
    .map((m) => ({ ...m, value: distractionTotals[m.key] || 0 }))
    .filter((d) => d.value > 0.5)  // half a second noise floor
    .sort((a, b) => b.value - a.value);

  // Informational signals — shown separately from distractions because
  // they can't distinguish productive external work from genuine
  // disengagement (see DISTRACTION_META comment above).
  const tabSwitchCount = events.reduce((acc, e, i) => {
    if (i === 0) return 0;
    return acc + (e.is_tab_hidden && !events[i - 1].is_tab_hidden ? 1 : 0);
  }, 0);
  const tabHiddenSeconds = session.time_tab_hidden || 0;

  // Breakdown doughnut — kept as a visual overview alongside the list.
  const breakdownData = {
    labels: ['Locked In', ...distractionList.map((d) => d.label)],
    datasets: [{
      data: [lockedIn, ...distractionList.map((d) => d.value)],
      backgroundColor: ['#22c55e', ...distractionList.map((d) => d.color)],
      borderWidth: 0,
    }],
  };
  const breakdownOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#9ca3af' } },
    },
  };

  const topDistraction = distractionList[0] || null;

  // Headline copy — three tiers based on what share of the session
  // was unambiguously focused. Thresholds chosen to feel rewarding
  // without inflating grades (an 80%+ session is genuinely strong).
  let lockedInVerdict;
  if (lockedInPct >= 80) lockedInVerdict = 'Locked in the whole way.';
  else if (lockedInPct >= 50) lockedInVerdict = 'Solid focus with some slips.';
  else if (lockedInPct >= 25) lockedInVerdict = 'A working session, but fragmented.';
  else lockedInVerdict = 'This one got away from you.';

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
          Duration: {formatDuration(session.duration)} · Mode: {session.mode === 'camera_on' ? 'Camera On' : 'Camera Off'}
        </p>
      </div>

      {/* Focus Breakdown — the honest answer to "how hard did I work". */}
      <div className="bg-gray-900 rounded-xl p-6 space-y-6">
        {/* Locked In hero */}
        <div className="text-center">
          <p className="text-gray-400 text-xs uppercase tracking-wider">Locked In</p>
          <p className="text-5xl font-bold text-green-400 mt-2 font-mono">
            {formatDuration(lockedIn)}
          </p>
          <p className="text-gray-500 text-sm mt-1">
            {Math.round(lockedInPct)}% of {formatDuration(session.duration)} · {lockedInVerdict}
          </p>
          <div className="w-full bg-gray-800 rounded-full h-2 mt-4 overflow-hidden">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: `${lockedInPct}%` }}
            />
          </div>
        </div>

        {/* Per-category distraction list */}
        {distractionList.length > 0 ? (
          <div className="pt-4 border-t border-gray-800 space-y-2">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">
              Time Spent Distracted
            </p>
            {distractionList.map((d) => {
              const pct = (d.value / duration) * 100;
              return (
                <div key={d.key} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="text-base">{d.emoji}</span>
                    <span className="text-gray-300">{d.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 font-mono tabular-nums">
                      {formatDuration(d.value)}
                    </span>
                    <span className="text-gray-500 text-xs w-10 text-right tabular-nums">
                      {pct < 1 ? '<1%' : `${Math.round(pct)}%`}
                    </span>
                  </div>
                </div>
              );
            })}
            {topDistraction && topDistraction.value > 0 && (
              <p className="text-xs text-gray-500 pt-3 border-t border-gray-800 mt-3">
                Biggest drag: <span className="text-gray-300">{topDistraction.label.toLowerCase()}</span>
                {' '}for <span className="text-gray-300">{formatDuration(topDistraction.value)}</span>.
              </p>
            )}
          </div>
        ) : (
          <div className="pt-4 border-t border-gray-800 text-center text-sm text-gray-500">
            No distractions recorded — full focus from start to end.
          </div>
        )}

        {/* Activity info — tab switches are not scored against focus
            (cannot distinguish productive external work from
            distraction), shown here as context for the user. */}
        {(tabSwitchCount > 0 || tabHiddenSeconds > 1) && (
          <div className="pt-4 border-t border-gray-800 space-y-2">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">
              Outside This Tab
            </p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-300">Tab switches</span>
              <span className="text-gray-400 font-mono tabular-nums">
                {tabSwitchCount}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-300">Time in other tabs / apps</span>
              <span className="text-gray-400 font-mono tabular-nums">
                {formatDuration(tabHiddenSeconds)}
              </span>
            </div>
            <p className="text-xs text-gray-500 pt-2">
              Not counted against focus — you may have been working productively elsewhere.
            </p>
          </div>
        )}
      </div>

      {/* Timeline Chart */}
      {events.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Focus Over Time</h3>
          <Line data={timelineData} options={timelineOptions} />
        </div>
      )}

      {/* Doughnut (visual overview to complement the list above) */}
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
