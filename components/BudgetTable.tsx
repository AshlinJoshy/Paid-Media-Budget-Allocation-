'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { DndContext, DragEndEvent, DragOverlay, useSensor, useSensors, PointerSensor, defaultDropAnimationSideEffects, DropAnimation } from '@dnd-kit/core';
import { Plus, Settings, RefreshCw, LayoutGrid, PanelRightOpen, Calendar, X, BarChart3, Users } from 'lucide-react';
import Link from 'next/link';
import CampaignGroup from './CampaignGroup';
import CampaignPanel from './CampaignPanel';
import PlatformBadge from './PlatformBadge';
import { MarketingCampaign, PaidAssignment, DropdownOptions, CachedCampaign, getPlatformFromSource } from '@/types';

const EMPTY_OPTIONS: DropdownOptions = { entity: [], type: [], status: [], source: [], start_month: [] };

export default function BudgetTable() {
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [options, setOptions] = useState<DropdownOptions>(EMPTY_OPTIONS);
  const [showPanel, setShowPanel] = useState(false);
  const [activeDrag, setActiveDrag] = useState<CachedCampaign | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [engageSyncing, setEngageSyncing] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const dropAnimation: DropAnimation = {
    duration: 220,
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    sideEffects: defaultDropAnimationSideEffects({
      styles: { active: { opacity: '0.4' } },
    }),
  };

  // Filter assignments by start_date range. Rows with empty / unparseable dates pass through.
  // Campaigns that originally had assignments but all got filtered out are hidden;
  // campaigns that were always empty stay visible so you can still drop rows onto them.
  const filteredCampaigns = useMemo(() => {
    if (!dateFrom && !dateTo) return campaigns;
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : -Infinity;
    const toTs = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : Infinity;
    return campaigns
      .map((c) => {
        const all = c.assignments ?? [];
        const kept = all.filter((a) => {
          if (!a.start_date) return true;
          const ts = new Date(a.start_date).getTime();
          if (isNaN(ts)) return true;
          return ts >= fromTs && ts <= toTs;
        });
        return { campaign: { ...c, assignments: kept }, hadAny: all.length > 0 };
      })
      .filter(({ campaign, hadAny }) => !hadAny || (campaign.assignments?.length ?? 0) > 0)
      .map(({ campaign }) => campaign);
  }, [campaigns, dateFrom, dateTo]);

  const assignedCampaignIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of campaigns) {
      for (const a of c.assignments ?? []) {
        if (a.supermetrics_campaign_id) ids.add(a.supermetrics_campaign_id);
      }
    }
    return ids;
  }, [campaigns]);

  const totals = useMemo(() => {
    let allocated = 0, spent = 0, leads = 0, qualified = 0, impressions = 0, clicks = 0, lineCount = 0;
    for (const c of filteredCampaigns) {
      for (const a of c.assignments ?? []) {
        allocated += a.budget_allocation || 0;
        spent += a.budget_spent || 0;
        leads += a.leads || 0;
        qualified += a.qualified_leads || 0;
        impressions += a.impressions || 0;
        clicks += a.clicks || 0;
        lineCount += 1;
      }
    }
    const remaining = allocated - spent;
    const cpl = leads > 0 ? Math.round((spent / leads) * 100) / 100 : 0;
    const pct = allocated > 0 ? Math.min(100, Math.round((spent / allocated) * 100)) : 0;
    return { allocated, spent, remaining, leads, qualified, impressions, clicks, cpl, lineCount, pct };
  }, [filteredCampaigns]);

  const loadAll = useCallback(async () => {
    const [campRes, optRes] = await Promise.all([
      fetch('/api/campaigns'),
      fetch('/api/dropdown-options'),
    ]);
    const campData = await campRes.json();
    const optData = await optRes.json();
    setCampaigns(Array.isArray(campData) ? campData : []);
    setOptions({ ...EMPTY_OPTIONS, ...optData });
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // --- Campaign CRUD ---
  async function addCampaign() {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: '', name: 'New Campaign' }),
    });
    const data = await res.json();
    setCampaigns((prev) => [...prev, data]);
  }

  async function updateCampaign(id: string, field: string, value: string) {
    setCampaigns((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
    await fetch(`/api/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
  }

  async function deleteCampaign(id: string) {
    if (!confirm('Delete this campaign and all its rows?')) return;
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
  }

  // --- Assignment CRUD ---
  async function addAssignment(campaignId: string, overrides: Partial<PaidAssignment> = {}) {
    const res = await fetch('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketing_campaign_id: campaignId, ...overrides }),
    });
    const newRow = await res.json();
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === campaignId
          ? { ...c, assignments: [...(c.assignments ?? []), newRow] }
          : c
      )
    );
  }

  async function updateAssignment(id: string, field: string, value: string | number) {
    setCampaigns((prev) =>
      prev.map((c) => ({
        ...c,
        assignments: (c.assignments ?? []).map((a) => {
          if (a.id !== id) return a;
          const updated = { ...a, [field]: value };
          updated.remaining = updated.budget_allocation - updated.budget_spent;
          updated.cpl = updated.leads > 0 ? Math.round((updated.budget_spent / updated.leads) * 100) / 100 : 0;
          return updated;
        }),
      }))
    );
    await fetch(`/api/assignments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
  }

  async function deleteAssignment(id: string) {
    setCampaigns((prev) =>
      prev.map((c) => ({ ...c, assignments: (c.assignments ?? []).filter((a) => a.id !== id) }))
    );
    await fetch(`/api/assignments/${id}`, { method: 'DELETE' });
  }

  // --- Dropdown options ---
  async function addOption(field: string, value: string) {
    setOptions((prev) => ({
      ...prev,
      [field]: [...(prev[field as keyof DropdownOptions] ?? []), value],
    }));
    await fetch('/api/dropdown-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
    });
  }

  async function deleteOption(field: string, value: string) {
    setOptions((prev) => ({
      ...prev,
      [field]: (prev[field as keyof DropdownOptions] ?? []).filter((v) => v !== value),
    }));
    await fetch('/api/dropdown-options', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
    });
  }

  // --- Drag and drop ---
  function handleDragStart(event: { active: { data: { current?: { campaign?: CachedCampaign } } } }) {
    setActiveDrag(event.active.data.current?.campaign ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over || !active.data.current?.campaign) return;

    const cachedCampaign = active.data.current.campaign as CachedCampaign;
    const targetCampaignId = over.id as string;

    const target = campaigns.find((c) => c.id === targetCampaignId);
    if (!target) return;

    await addAssignment(targetCampaignId, {
      supermetrics_campaign_id: cachedCampaign.campaign_id,
      paid_campaign_name: cachedCampaign.campaign_name,
      source: getPlatformFromSource(cachedCampaign.platform) === 'meta' ? 'Meta'
        : getPlatformFromSource(cachedCampaign.platform) === 'google' ? 'Google Search'
        : cachedCampaign.platform.charAt(0).toUpperCase() + cachedCampaign.platform.slice(1),
      platform: cachedCampaign.platform,
      campaign_status: cachedCampaign.status,
      budget_spent: cachedCampaign.spend,
      leads: cachedCampaign.leads,
      impressions: cachedCampaign.impressions ?? 0,
      clicks: cachedCampaign.clicks ?? 0,
    } as Partial<PaidAssignment>);
  }

  async function syncEngage() {
    setEngageSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/engage/qualify-rollup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) setSyncMsg(`Engage: ${data.error}`);
      else {
        setSyncMsg(`Engage: matched ${data.matched} / ${data.assignments_scanned} rows`);
        loadAll();
      }
    } catch {
      setSyncMsg('Network error syncing Engage');
    } finally {
      setEngageSyncing(false);
      setTimeout(() => setSyncMsg(null), 4000);
    }
  }

  // --- Sync ---
  async function syncAll() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/supermetrics/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) setSyncMsg(`Error: ${data.error}`);
      else {
        setSyncMsg(`Synced ${data.campaigns_synced} campaigns, updated ${data.assignments_updated} rows`);
        loadAll();
      }
    } catch {
      setSyncMsg('Network error during sync');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 4000);
    }
  }

  const dateFilterActive = !!(dateFrom || dateTo);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-screen bg-gray-50">
        {/* Page header */}
        <header className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white shadow-sm shrink-0">
          <div className="flex items-center gap-2.5">
            <LayoutGrid className="h-5 w-5 text-blue-400" />
            <span className="font-semibold text-sm tracking-tight">Paid Media Budget Tracker</span>
          </div>
          <div className="flex items-center gap-2">
            {syncMsg && (
              <span className="text-xs text-green-300 bg-green-900/40 px-2 py-0.5 rounded">{syncMsg}</span>
            )}
            <Link
              href="/analytics"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded font-medium"
              title="Lead Analytics"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </Link>
            <button
              onClick={syncEngage}
              disabled={engageSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 rounded font-medium disabled:opacity-60"
              title="Recompute qualified lead counts from Engage"
            >
              <Users className={`h-3.5 w-3.5 ${engageSyncing ? 'animate-pulse' : ''}`} />
              {engageSyncing ? 'Syncing…' : 'Sync Engage'}
            </button>
            <button
              onClick={syncAll}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 rounded font-medium disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync Supermetrics'}
            </button>
            <button
              onClick={() => setShowPanel((v) => !v)}
              className={`p-1.5 rounded hover:bg-white/10 ${showPanel ? 'bg-white/10' : ''}`}
              title="Campaign Panel"
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
            <a href="/settings" className="p-1.5 rounded hover:bg-white/10" title="Settings">
              <Settings className="h-4 w-4" />
            </a>
          </div>
        </header>

        {/* Date filter + summary strip */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 shrink-0">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Filter by start date</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="text-xs px-2 py-1 border border-gray-200 rounded outline-none focus:border-blue-400"
                placeholder="From"
                aria-label="From date"
              />
              <span className="text-xs text-gray-400">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="text-xs px-2 py-1 border border-gray-200 rounded outline-none focus:border-blue-400"
                placeholder="To"
                aria-label="To date"
              />
              {dateFilterActive && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-50"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
            <span className="text-[11px] text-gray-400">
              {totals.lineCount} line{totals.lineCount !== 1 ? 's' : ''}
              {dateFilterActive && ' (filtered)'}
            </span>
          </div>
          <SummaryStrip totals={totals} />
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Table area */}
          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                {/* Single header row — labels match what's in each column below.
                    Project / campaign names live in the group banner above each section. */}
                <tr className="bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wider">
                  <th className="px-2 py-2.5 text-left font-semibold min-w-[130px] border border-gray-200">Type</th>
                  <th className="px-2 py-2.5 text-left font-semibold min-w-[130px] border border-gray-200">Source</th>
                  <th className="px-2 py-2.5 text-left font-semibold min-w-[220px] border border-gray-200">Paid Campaign</th>
                  <th className="px-2 py-2.5 text-left font-semibold min-w-[100px] border border-gray-200">Status</th>
                  <th className="px-2 py-2.5 text-left font-semibold min-w-[120px] border border-gray-200">Start Date</th>
                  <th className="px-2 py-2.5 text-right font-semibold min-w-[120px] border border-gray-200">Allocated</th>
                  <th className="px-2 py-2.5 text-right font-semibold min-w-[110px] border border-gray-200">Spent</th>
                  <th className="px-2 py-2.5 text-right font-semibold min-w-[110px] border border-gray-200">Remaining</th>
                  <th className="px-2 py-2.5 text-right font-semibold min-w-[70px] border border-gray-200">Leads</th>
                  <th className="px-2 py-2.5 text-right font-semibold min-w-[90px] border border-gray-200">CPL</th>
                  <th className="px-2 py-2.5 text-right font-semibold min-w-[110px] border border-gray-200" title="From Engage (matched by UTM)">Qualified</th>
                  <th className="px-2 py-2.5 text-right font-semibold min-w-[110px] border border-gray-200">Impressions</th>
                  <th className="px-2 py-2.5 text-right font-semibold min-w-[90px] border border-gray-200">Clicks</th>
                  <th className="px-2 py-2.5 w-10 border border-gray-200" />
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map((campaign) => (
                  <CampaignGroup
                    key={campaign.id}
                    campaign={campaign}
                    options={options}
                    onUpdateCampaign={updateCampaign}
                    onDeleteCampaign={deleteCampaign}
                    onUpdateAssignment={updateAssignment}
                    onDeleteAssignment={deleteAssignment}
                    onAddAssignment={addAssignment}
                    onAddOption={addOption}
                    onDeleteOption={deleteOption}
                  />
                ))}
                {filteredCampaigns.length === 0 && (
                  <tr>
                    <td colSpan={14} className="py-16 text-center text-gray-400 text-sm border border-gray-200">
                      {campaigns.length === 0
                        ? 'No campaigns yet. Add your first one below.'
                        : 'No campaigns match the current date filter.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Add campaign button */}
            <div className="px-4 py-3">
              <button
                onClick={addCampaign}
                className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 border border-dashed border-blue-200 rounded-lg w-full justify-center"
              >
                <Plus className="h-4 w-4" />
                Add Campaign / Project
              </button>
            </div>
          </div>

          {/* Campaign panel */}
          {showPanel && (
            <CampaignPanel
              onClose={() => setShowPanel(false)}
              assignedCampaignIds={assignedCampaignIds}
            />
          )}
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay dropAnimation={dropAnimation}>
        {activeDrag && (
          <div
            className="bg-white border border-gray-300 shadow-2xl rounded-md px-2.5 py-2 text-xs max-w-[220px] cursor-grabbing"
            style={{ transform: 'rotate(-1.5deg) scale(1.02)' }}
          >
            <PlatformBadge platform={activeDrag.platform} />
            <p className="mt-1 text-gray-800 truncate">{activeDrag.campaign_name}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function fmtAED(n: number) {
  if (!n) return 'AED 0';
  return 'AED ' + n.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface SummaryStripProps {
  totals: {
    allocated: number;
    spent: number;
    remaining: number;
    leads: number;
    qualified: number;
    impressions: number;
    clicks: number;
    cpl: number;
    lineCount: number;
    pct: number;
  };
}

function SummaryStrip({ totals }: SummaryStripProps) {
  const { allocated, spent, remaining, leads, qualified, impressions, clicks, cpl, pct } = totals;
  const overBudget = allocated > 0 && remaining < 0;
  const warning = allocated > 0 && remaining >= 0 && remaining < allocated * 0.1;
  const barColor = overBudget ? 'bg-red-500' : warning ? 'bg-orange-400' : 'bg-emerald-500';
  const remainingColor = overBudget ? 'text-red-600' : warning ? 'text-orange-600' : 'text-emerald-700';
  const fmtNum = (n: number) => (n > 0 ? n.toLocaleString() : '—');

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <Stat label="Allocated" value={fmtAED(allocated)} />
        <Stat label="Spent" value={fmtAED(spent)} hint={allocated > 0 ? `${pct}%` : undefined} />
        <Stat label="Remaining" value={fmtAED(remaining)} valueClassName={remainingColor} />
        <Stat label="Leads" value={fmtNum(leads)} />
        <Stat label="Qualified" value={fmtNum(qualified)} hint="from Engage" />
        <Stat label="Avg CPL" value={cpl > 0 ? fmtAED(cpl) : '—'} />
        <Stat label="Impressions" value={fmtNum(impressions)} />
        <Stat label="Clicks" value={fmtNum(clicks)} />
      </div>
      {allocated > 0 && (
        <div className="mt-2.5 h-1 w-full bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-500 ease-out`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint, valueClassName = 'text-gray-900' }: { label: string; value: string; hint?: string; valueClassName?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">{label}</div>
      <div className={`text-sm font-semibold tabular-nums mt-0.5 ${valueClassName}`}>{value}</div>
      {hint && <div className="text-[10px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}
