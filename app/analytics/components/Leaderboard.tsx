'use client';
import { useState } from 'react';
import { ArrowUpDown, ArrowDown, ArrowUp } from 'lucide-react';
import { LeaderboardRow } from '@/lib/engage-analytics';

interface Props {
  title: string;
  rows: LeaderboardRow[];
  showCost?: boolean;
  emptyMessage?: string;
}

type SortKey = 'key' | 'leads' | 'qualified' | 'reserved' | 'closed' | 'qualifyRate' | 'closeRate' | 'cost' | 'cpl' | 'cpql' | 'totalCommission' | 'avgHoursToTouch';

export default function Leaderboard({ title, rows, showCost, emptyMessage }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('leads');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [limit, setLimit] = useState(10);

  function sort(k: SortKey) {
    if (sortKey === k) setDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(k); setDir('desc'); }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = (a as Record<SortKey, unknown>)[sortKey];
    const bv = (b as Record<SortKey, unknown>)[sortKey];
    if (typeof av === 'string' && typeof bv === 'string') {
      return dir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
    }
    const an = Number(av ?? 0);
    const bn = Number(bv ?? 0);
    return dir === 'desc' ? bn - an : an - bn;
  });
  const display = sorted.slice(0, limit);

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{title}</h2>
        <span className="text-[11px] text-gray-400">{rows.length} total</span>
      </div>
      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">{emptyMessage ?? 'No data.'}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                <tr>
                  <Th onClick={() => sort('key')} active={sortKey === 'key'} dir={dir} className="text-left min-w-[200px]">Name</Th>
                  <Th onClick={() => sort('leads')} active={sortKey === 'leads'} dir={dir}>Leads</Th>
                  <Th onClick={() => sort('qualified')} active={sortKey === 'qualified'} dir={dir}>Qualified</Th>
                  <Th onClick={() => sort('qualifyRate')} active={sortKey === 'qualifyRate'} dir={dir}>Qual %</Th>
                  <Th onClick={() => sort('reserved')} active={sortKey === 'reserved'} dir={dir}>Reserved</Th>
                  <Th onClick={() => sort('closed')} active={sortKey === 'closed'} dir={dir}>Closed</Th>
                  <Th onClick={() => sort('closeRate')} active={sortKey === 'closeRate'} dir={dir}>Close %</Th>
                  <Th onClick={() => sort('avgHoursToTouch')} active={sortKey === 'avgHoursToTouch'} dir={dir}>Avg h to touch</Th>
                  {showCost && <>
                    <Th onClick={() => sort('cost')} active={sortKey === 'cost'} dir={dir}>Spend</Th>
                    <Th onClick={() => sort('cpl')} active={sortKey === 'cpl'} dir={dir}>CPL</Th>
                    <Th onClick={() => sort('cpql')} active={sortKey === 'cpql'} dir={dir}>CPQL</Th>
                  </>}
                  <Th onClick={() => sort('totalCommission')} active={sortKey === 'totalCommission'} dir={dir}>Commission</Th>
                </tr>
              </thead>
              <tbody>
                {display.map((r) => (
                  <tr key={r.key} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-800 truncate max-w-[300px]" title={r.key}>{r.key}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{r.leads}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.qualified}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">{(r.qualifyRate * 100).toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.reserved}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.closed}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">{(r.closeRate * 100).toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">{r.avgHoursToTouch ?? '—'}</td>
                    {showCost && <>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtAED(r.cost ?? 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">{r.cpl ? fmtAED(r.cpl) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">{r.cpql ? fmtAED(r.cpql) : '—'}</td>
                    </>}
                    <td className="px-3 py-2 text-right tabular-nums">{fmtAED(r.totalCommission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > limit && (
            <div className="px-4 py-2 border-t border-gray-100 text-center">
              <button
                onClick={() => setLimit((l) => l + 20)}
                className="text-[11px] text-blue-600 hover:text-blue-800"
              >
                Show more ({rows.length - limit} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Th({ onClick, active, dir, className = '', children }: { onClick: () => void; active: boolean; dir: 'asc' | 'desc'; className?: string; children: React.ReactNode }) {
  return (
    <th className={`px-3 py-2 text-right font-semibold ${className}`}>
      <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-gray-800">
        {children}
        {active ? (dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

function fmtAED(n: number) {
  if (!n) return '—';
  return 'AED ' + Math.round(n).toLocaleString('en-AE');
}
