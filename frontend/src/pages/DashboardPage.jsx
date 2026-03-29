import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { getWeeklyAnalytics } from '../api/sessions';
import { formatTime } from '../utils/scoring';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function DashboardPage() {
  const [weekDate, setWeekDate] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    return getMonday(today);
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getWeeklyAnalytics(weekDate)
      .then(setData)
      .finally(() => setLoading(false));
  }, [weekDate]);

  const prevWeek = () => setWeekDate(addDays(weekDate, -7));
  const nextWeek = () => setWeekDate(addDays(weekDate, 7));

  // Trend chart
  const trendData = useMemo(() => {
    if (!data) return null;
    return {
      labels: data.daily.map((d) => DAY_NAMES[new Date(d.date + 'T00:00:00').getDay() === 0 ? 6 : new Date(d.date + 'T00:00:00').getDay() - 1]),
      datasets: [{
        label: 'Avg Focus Score',
        data: data.daily.map((d) => d.avg_score),
        borderColor: '#818cf8',
        backgroundColor: 'rgba(129, 140, 248, 0.1)',
        fill: true,
        tension: 0.3,
      }],
    };
  }, [data]);

  const trendOptions = {
    responsive: true,
    scales: {
      y: { min: 0, max: 100, ticks: { color: '#9ca3af' }, grid: { color: '#374151' } },
      x: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' } },
    },
    plugins: { legend: { display: false } },
  };

  // Heatmap
  const heatmapGrid = useMemo(() => {
    if (!data) return [];
    const grid = Array.from({ length: 7 }, () => Array(24).fill(null));
    data.heatmap.forEach(({ day, hour, score }) => {
      grid[day][hour] = score;
    });
    return grid;
  }, [data]);

  const heatColor = (score) => {
    if (score === null) return 'bg-gray-800';
    if (score >= 80) return 'bg-green-600';
    if (score >= 60) return 'bg-green-800';
    if (score >= 40) return 'bg-yellow-700';
    if (score >= 20) return 'bg-orange-800';
    return 'bg-red-900';
  };

  // Distractions sorted
  const distractionsList = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Tab switching', value: data.distractions.tab_hidden },
      { label: 'Idle time', value: data.distractions.idle },
      { label: 'Face missing', value: data.distractions.face_missing },
      { label: 'Looking away', value: data.distractions.looking_away },
    ].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  }, [data]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Weekly Dashboard</h2>
        <Link to="/session" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded">
          New Session
        </Link>
      </div>

      {/* Week Selector */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={prevWeek} className="text-gray-400 hover:text-white">&larr;</button>
        <span className="text-gray-300 text-sm">
          {data?.week_start} &mdash; {data?.week_end}
        </span>
        <button onClick={nextWeek} className="text-gray-400 hover:text-white">&rarr;</button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-xl p-5 text-center">
          <p className="text-gray-400 text-sm">Sessions</p>
          <p className="text-3xl font-bold mt-1">{data?.total_sessions ?? 0}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 text-center">
          <p className="text-gray-400 text-sm">Avg Score</p>
          <p className="text-3xl font-bold mt-1">{data?.avg_score ?? '—'}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 text-center">
          <p className="text-gray-400 text-sm">Total Focus Time</p>
          <p className="text-3xl font-bold mt-1">{formatTime(data?.total_duration ?? 0)}</p>
        </div>
      </div>

      {/* Trend Chart */}
      {trendData && (
        <div className="bg-gray-900 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Daily Average Score</h3>
          <Line data={trendData} options={trendOptions} />
        </div>
      )}

      {/* Heatmap */}
      {heatmapGrid.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Focus Heatmap</h3>
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              <div className="flex gap-0.5 mb-1 ml-10">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="w-5 text-center text-[10px] text-gray-500">
                    {h % 3 === 0 ? h : ''}
                  </div>
                ))}
              </div>
              {heatmapGrid.map((row, day) => (
                <div key={day} className="flex gap-0.5 items-center">
                  <span className="w-10 text-xs text-gray-500">{DAY_NAMES[day]}</span>
                  {row.map((score, hour) => (
                    <div
                      key={hour}
                      className={`w-5 h-5 rounded-sm ${heatColor(score)}`}
                      title={score !== null ? `${DAY_NAMES[day]} ${hour}:00 — Score: ${score}` : `${DAY_NAMES[day]} ${hour}:00 — No data`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top Distractions */}
      {distractionsList.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Top Distractions</h3>
          <div className="space-y-3">
            {distractionsList.map((d) => (
              <div key={d.label} className="flex items-center justify-between">
                <span className="text-gray-300 text-sm">{d.label}</span>
                <span className="text-gray-400 text-sm">{formatTime(Math.round(d.value))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data?.total_sessions === 0 && (
        <div className="text-center py-10 text-gray-500">
          No sessions this week. <Link to="/session" className="text-indigo-400 hover:text-indigo-300">Start one now!</Link>
        </div>
      )}
    </div>
  );
}
