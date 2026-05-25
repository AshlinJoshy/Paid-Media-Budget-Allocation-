'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { RefreshCw, LayoutGrid, ArrowLeft, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  LeadRow, Filters, rowsToObjects, applyFilters, buildFacetedOptions, pickFunnels,
  groupBy, attachSpend, leadsByDay, LeaderboardRow,
} from '@/lib/engage-analytics';
import FilterPanel from './components/FilterPanel';
import FunnelChart from './components/FunnelChart';
import Leaderboard from './components/Leaderboard';

const EMPTY_FILTERS: Filters = {
  dateFrom: '',
  dateTo: '',
  clientType: new Set(),
  canonicalSource: new Set(),
  utmSource: new Set(),
  utmMedium: new Set(),
  utmCampaign: new Set(),
  utmContent: new Set(),
  campaignCode: new Set(),
  branch: new Set(),
  division: new Set(),
};

function defaultSince() {
  const now = new Date();
  return `${now.getUTCFullYear()}-01-01`;
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [since, setSince] = useState(defaultSince());
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [spendByCampaign, setSpendByCampaign] = useState<Map<string, number>>(new Map());

  const fetchLeads = useCallback(async (sinceDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const [leadsRes, campRes] = await Promise.all([
        fetch(`/api/engage/leads?since=${encodeURIComponent(sinceDate)}`),
        fetch('/api/campaigns'),
      ]);
      const leadsJson = await leadsRes.json();
      if (!leadsRes.ok) {
        setError(leadsJson.error ?? 'Failed to load leads');
        setLeads([]);
        return;
      }
      setLeads(rowsToObjects(leadsJson.columns, leadsJson.rows));

      // Build spend lookup keyed by normalized paid_campaign_name.
      const campJson = await campRes.json();
      const map = new Map<string, number>();
      for (const c of campJson ?? []) {
        for (const a of c.assignments ?? []) {
          const name = (a.paid_campaign_name ?? '').trim().toLowerCase();
          if (!name) continue;
          map.set(name, (map.get(name) ?? 0) + (Number(a.budget_spent) || 0));
        }
      }
      setSpendByCampaign(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeads(since); }, [since, fetchLeads]);

  const filtered = useMemo(() => applyFilters(leads, filters), [leads, filters]);

  const funnels = useMemo(() => pickFunnels(filters.clientType, filtered), [filtered, filters.clientType]);

  // Spend is attached to both — budget rows can be named either with the
  // internal Engage code or with the UTM string, depending on how the team
  // sets up paid_assignments.paid_campaign_name. Whichever matches wins.
  const byCampaign = useMemo(() => attachSpend(groupBy(filtered, 'campaign_code'), spendByCampaign), [filtered, spendByCampaign]);
  const byUtmCampaign = useMemo(() => attachSpend(groupBy(filtered, 'utm_campaign'), spendByCampaign), [filtered, spendByCampaign]);
  const byTerm = useMemo(() => groupBy(filtered, 'utm_term'), [filtered]);
  const byContent = useMemo(() => groupBy(filtered, 'utm_content'), [filtered]);
  const bySource = useMemo(() => groupBy(filtered, 'canonical_source'), [filtered]);
  const byBranch = useMemo(() => groupBy(filtered, 'branch'), [filtered]);

  const series = useMemo(() => leadsByDay(filtered), [filtered]);

  // KPIs
  const totalLeads = filtered.length;
  const totalQualified = filtered.reduce((s, l) => s + (l.stage_2_qualified || l.stage_2b_valuation ? 1 : 0), 0);
  const totalReserved = filtered.reduce((s, l) => s + (l.stage_5_reserved ? 1 : 0), 0);
  const totalClosed = filtered.reduce((s, l) => s + (l.stage_6_deal_closed ? 1 : 0), 0);
  const totalCommission = filtered.reduce((s, l) => s + (Number(l.deal_commission) || 0), 0);
  const totalSpend = useMemo(() => {
    let s = 0;
    for (const r of byCampaign) s += r.cost ?? 0;
    return s;
  }, [byCampaign]);
  const avgCpql = totalQualified > 0 ? totalSpend / totalQualified : 0;

  // Responsiveness
  const respCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of filtered) {
      const k = l.responsiveness_flag ?? 'UNKNOWN';
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  // Option lists for filter sidebar (based on the full pull, not the filtered subset
  // so filter changes don't make options disappear).
  // Faceted: each filter's options are values that exist in leads passing every
  // OTHER filter. Pick Campaign X → Branch list narrows to branches with
  // Campaign X leads. Recomputes when filters change.
  const optionLists = useMemo(() => buildFacetedOptions(leads, filters), [leads, filters]);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" />
            Budget Table
          </Link>
          <span className="text-gray-600">|</span>
          <div className="flex items-center gap-2.5">
            <LayoutGrid className="h-5 w-5 text-blue-400" />
            <span className="font-semibold text-sm tracking-tight">Lead Analytics</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Pull since</label>
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded outline-none text-white"
          />
          <button
            onClick={() => fetchLeads(since)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 rounded font-medium disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <FilterPanel
          options={optionLists}
          filters={filters}
          onChange={setFilters}
          totalRows={leads.length}
          filteredRows={filtered.length}
        />
        <main className="flex-1 overflow-auto p-4 space-y-4">
          {loading && leads.length === 0 ? (
            <div className="py-24 text-center text-gray-400 text-sm">
              Pulling {since} → today from Engage… this can take 10-30s on the first call.
            </div>
          ) : (
            <>
              {/* KPI strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 bg-white rounded-lg border border-gray-200 p-4">
                <Kpi label="Leads" value={totalLeads.toLocaleString()} />
                <Kpi label="Qualified" value={totalQualified.toLocaleString()} hint={pct(totalQualified, totalLeads)} />
                <Kpi label="Reserved" value={totalReserved.toLocaleString()} hint={pct(totalReserved, totalLeads)} />
                <Kpi label="Closed" value={totalClosed.toLocaleString()} hint={pct(totalClosed, totalLeads)} />
                <Kpi label="Total Spend" value={fmtAED(totalSpend)} />
                <Kpi label="Avg CPQL" value={avgCpql > 0 ? fmtAED(avgCpql) : '—'} hint="cost per qualified" />
                <Kpi label="Commission" value={fmtAED(totalCommission)} hint="from closed deals" />
              </div>

              {/* Funnel(s) */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <SectionTitle>Funnel</SectionTitle>
                <div className={`grid gap-6 ${funnels.length > 1 ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
                  {funnels.map((f) => (
                    <FunnelChart key={f.label} label={f.label} stages={f.stages} />
                  ))}
                  {funnels.length === 0 && (
                    <div className="text-sm text-gray-400 py-8 text-center">No leads match the current filters.</div>
                  )}
                </div>
              </div>

              {/* Leads over time */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <SectionTitle>Leads over time</SectionTitle>
                <div className="h-56">
                  <ResponsiveContainer>
                    <LineChart data={series} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={false} name="Total" />
                      <Line type="monotone" dataKey="qualified" stroke="#10b981" strokeWidth={2} dot={false} name="Qualified" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Source breakdown + responsiveness */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <SectionTitle>Source breakdown</SectionTitle>
                  <div className="h-64">
                    <ResponsiveContainer>
                      <BarChart data={bySource.slice(0, 12)} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 24 }}>
                        <CartesianGrid strokeDasharray="2 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="key" tick={{ fontSize: 10 }} width={120} />
                        <Tooltip />
                        <Bar dataKey="leads" fill="#3b82f6" name="Leads" radius={[0, 3, 3, 0]} />
                        <Bar dataKey="qualified" fill="#10b981" name="Qualified" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <SectionTitle>Responsiveness</SectionTitle>
                  <div className="h-64">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={respCounts} dataKey="value" nameKey="name" innerRadius={48} outerRadius={88} paddingAngle={1}>
                          {respCounts.map((entry, i) => (
                            <Cell key={i} fill={RESP_COLORS[entry.name] ?? '#9ca3af'} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Internal campaign code — the Engage-assigned tracking ID */}
              <Leaderboard
                title="Internal campaign code (Engage tracking ID)"
                rows={byCampaign}
                showCost
                emptyMessage="No leads have an internal campaign code under the current filters."
              />

              {/* UTM campaign — the URL query-string value. One internal code
                  can have many UTM variants across ads, so this is independent. */}
              <Leaderboard
                title="UTM campaign (from URL query string)"
                rows={byUtmCampaign}
                showCost
              />

              <div className="grid md:grid-cols-2 gap-4">
                <Leaderboard title="Ad sets (utm_term)" rows={byTerm} />
                <Leaderboard title="Ads (utm_content)" rows={byContent} />
              </div>

              {/* Branch */}
              <Leaderboard title="Branch performance" rows={byBranch} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

const RESP_COLORS: Record<string, string> = {
  ACTIVE: '#10b981',
  'COOLING_>3D': '#f59e0b',
  'STALE_>7D': '#ef4444',
  NEVER_TOUCHED: '#6b7280',
  CLOSED: '#94a3b8',
  COMPLETED: '#3b82f6',
};

function fmtAED(n: number) {
  if (!n) return 'AED 0';
  return 'AED ' + Math.round(n).toLocaleString('en-AE');
}

function pct(num: number, denom: number): string {
  if (!denom) return '';
  return `${((num / denom) * 100).toFixed(1)}%`;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">{label}</div>
      <div className="text-sm font-semibold tabular-nums mt-0.5 text-gray-900">{value}</div>
      {hint && <div className="text-[10px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">{children}</h2>;
}
