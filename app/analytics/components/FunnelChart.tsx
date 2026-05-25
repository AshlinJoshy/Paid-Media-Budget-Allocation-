'use client';
import { FunnelStage } from '@/lib/engage-analytics';

interface Props {
  label: string;
  stages: FunnelStage[];
}

export default function FunnelChart({ label, stages }: Props) {
  const top = stages[0]?.count ?? 0;
  if (top === 0) {
    return (
      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-2">{label}</h3>
        <div className="text-sm text-gray-400 py-6 text-center">No leads.</div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-700 mb-3">{label}</h3>
      <div className="space-y-1.5">
        {stages.map((s, i) => {
          const pctOfTop = (s.count / top) * 100;
          const prev = i > 0 ? stages[i - 1].count : s.count;
          const stepConv = prev > 0 ? (s.count / prev) * 100 : 0;
          return (
            <div key={s.name} className="group">
              <div className="flex items-baseline justify-between text-[11px] mb-1">
                <span className="text-gray-700 font-medium">{s.name}</span>
                <span className="tabular-nums text-gray-500">
                  <span className="text-gray-900 font-semibold">{s.count.toLocaleString()}</span>
                  <span className="ml-2 text-gray-400">{pctOfTop.toFixed(1)}%</span>
                  {i > 0 && (
                    <span className={`ml-2 text-[10px] ${stepConv < 30 ? 'text-orange-600' : 'text-emerald-600'}`}>
                      {stepConv.toFixed(0)}% step
                    </span>
                  )}
                </span>
              </div>
              <div className="h-5 bg-gray-100 rounded overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${stageColor(i, stages.length)}`}
                  style={{ width: `${pctOfTop}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function stageColor(i: number, total: number) {
  const colors = ['bg-blue-500', 'bg-blue-400', 'bg-indigo-400', 'bg-emerald-400', 'bg-emerald-500', 'bg-emerald-600'];
  if (total <= 5) return colors[Math.min(i + 1, colors.length - 1)];
  return colors[Math.min(i, colors.length - 1)];
}
