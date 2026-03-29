export default function FocusGauge({ score }) {
  const color = score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400';
  const bgColor = score >= 80 ? 'bg-green-400' : score >= 50 ? 'bg-yellow-400' : 'bg-red-400';
  const label = score >= 80 ? 'Focused' : score >= 50 ? 'Distracted' : 'Away';

  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-32">
        <svg className="w-32 h-32 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="#374151" strokeWidth="8" />
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            className={bgColor.replace('bg-', 'stroke-')}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-3xl font-bold ${color}`}>{Math.round(score)}</span>
        </div>
      </div>
      <span className={`text-sm font-medium ${color}`}>{label}</span>
    </div>
  );
}
