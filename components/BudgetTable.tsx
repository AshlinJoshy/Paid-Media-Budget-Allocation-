'use client';
import { useState, useEffect, useCallback } from 'react';
import { DndContext, DragEndEvent, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { Plus, Settings, RefreshCw, LayoutGrid, PanelRightOpen } from 'lucide-react';
import CampaignGroup from './CampaignGroup';
import CampaignPanel from './CampaignPanel';
import PlatformBadge from './PlatformBadge';
import { MarketingCampaign, PaidAssignment, DropdownOptions, CachedCampaign, getPlatformFromSource } from '@/types';

const EMPTY_OPTIONS: DropdownOptions = { entity: [], status: [], source: [], start_month: [] };

export default function BudgetTable() {
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [options, setOptions] = useState<DropdownOptions>(EMPTY_OPTIONS);
  const [showPanel, setShowPanel] = useState(false);
  const [activeDrag, setActiveDrag] = useState<CachedCampaign | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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
    // Optimistic update
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

    // Check target is a valid marketing campaign
    const target = campaigns.find((c) => c.id === targetCampaignId);
    if (!target) return;

    // Create assignment from the dragged campaign
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
    } as Partial<PaidAssignment>);
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
      if (!res.ok) {
        setSyncMsg(`Error: ${data.error}`);
      } else {
        const errNote = data.errors?.length ? ` (${data.errors.length} error${data.errors.length > 1 ? 's' : ''}: ${data.errors[0]})` : '';
        setSyncMsg(`Synced ${data.campaigns_synced} campaigns, updated ${data.assignments_updated} rows${errNote}`);
        loadAll();
      }
    } catch {
      setSyncMsg('Network error during sync');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 7000);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-screen bg-gray-50">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white shadow-sm shrink-0">
          <div className="flex items-center gap-2.5">
            <LayoutGrid className="h-5 w-5 text-blue-400" />
            <span className="font-semibold text-sm tracking-tight">Paid Media Budget Tracker</span>
          </div>
          <div className="flex items-center gap-2">
            {syncMsg && (
              <span className={`text-xs px-2 py-0.5 rounded max-w-xs truncate ${syncMsg.startsWith('Error') || syncMsg.includes('error') ? 'text-red-300 bg-red-900/40' : 'text-green-300 bg-green-900/40'}`} title={syncMsg}>{syncMsg}</span>
            )}
            <button
              onClick={syncAll}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 rounded font-medium disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync Now'}
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

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Table area */}
          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                {/* Column headers — must match CampaignGroup (8 cols) + AssignmentRow (11 cols + action) */}
                <tr className="bg-slate-800 text-slate-300 text-xs">
                  {/* CampaignGroup: toggle | entity | name(colspan2) | status | budget | spent | remaining | leads | cpl | pad(3) */}
                  <th className="px-2 py-2 w-8" />
                  <th className="px-2 py-2 text-left font-medium min-w-[100px]">Entity</th>
                  <th className="px-2 py-2 text-left font-medium min-w-[180px]" colSpan={2}>Campaign / Project</th>
                  <th className="px-2 py-2 text-left font-medium min-w-[90px]">Status / Lines</th>
                  <th className="px-2 py-2 text-right font-medium min-w-[120px]">Budget Alloc.</th>
                  <th className="px-2 py-2 text-right font-medium min-w-[110px]">Spent</th>
                  <th className="px-2 py-2 text-right font-medium min-w-[110px]">Remaining</th>
                  <th className="px-2 py-2 text-right font-medium min-w-[70px]">Leads</th>
                  <th className="px-2 py-2 text-right font-medium min-w-[90px]">CPL</th>
                  {/* AssignmentRow extra cols */}
                  <th className="px-2 py-2 text-left font-medium min-w-[200px]">Paid Campaign Name</th>
                  <th className="px-2 py-2 text-left font-medium min-w-[80px]">Synced</th>
                  <th className="px-2 py-2 w-10" />
                </tr>
                {/* Sub-header — must match AssignmentRow <td> count exactly (13 cells) */}
                <tr className="bg-slate-700 text-slate-400 text-[11px]">
                  <th className="px-2 py-1 text-left min-w-[110px]">↳ Type</th>
                  <th className="px-2 py-1 text-left min-w-[130px]">Source</th>
                  <th className="px-2 py-1 text-left min-w-[100px]">Start Month</th>
                  <th className="px-2 py-1 text-left min-w-[110px]">Start Date</th>
                  <th className="px-2 py-1 text-left min-w-[90px]">Status</th>
                  <th className="px-2 py-1 text-right min-w-[120px]">Budget Alloc.</th>
                  <th className="px-2 py-1 text-right min-w-[110px]">Spent</th>
                  <th className="px-2 py-1 text-right min-w-[110px]">Remaining</th>
                  <th className="px-2 py-1 text-right min-w-[70px]">Leads</th>
                  <th className="px-2 py-1 text-right min-w-[90px]">CPL</th>
                  <th className="px-2 py-1 text-left min-w-[200px]">Paid Campaign Name</th>
                  <th className="px-2 py-1 text-left min-w-[80px]">Synced</th>
                  <th className="px-2 py-1 w-10" />
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
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
                  />
                ))}
                {campaigns.length === 0 && (
                  <tr>
                    <td colSpan={15} className="py-16 text-center text-gray-400 text-sm">
                      No campaigns yet. Add your first one below.
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
          {showPanel && <CampaignPanel onClose={() => setShowPanel(false)} />}
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeDrag && (
          <div className="bg-white border border-gray-300 shadow-xl rounded px-2 py-1.5 text-xs max-w-[200px]">
            <PlatformBadge platform={activeDrag.platform} />
            <p className="mt-1 text-gray-800 truncate">{activeDrag.campaign_name}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
