'use client';
import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, X, GripVertical } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { CachedCampaign, PLATFORM_COLORS, DS_NAMES } from '@/types';
import PlatformBadge from './PlatformBadge';

interface DraggableItemProps {
  campaign: CachedCampaign;
}

function DraggableItem({ campaign }: DraggableItemProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: campaign.id,
    data: { campaign },
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  const colors = PLATFORM_COLORS[campaign.platform] ?? PLATFORM_COLORS['unknown'];
  const isEnabled = campaign.status.toUpperCase() === 'ENABLED';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-1.5 px-2 py-2 rounded border ${colors.row} border-transparent hover:border-gray-200 cursor-grab select-none ${isDragging ? 'opacity-50 shadow-lg z-50' : ''}`}
    >
      <button {...listeners} {...attributes} className="mt-0.5 text-gray-300 hover:text-gray-500 touch-none">
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <PlatformBadge platform={campaign.platform} />
          <span className={`inline-flex items-center px-1 py-0.5 rounded text-[10px] ${isEnabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {isEnabled ? 'On' : 'Off'}
          </span>
        </div>
        <p className="text-xs text-gray-800 mt-0.5 leading-tight break-words">{campaign.campaign_name}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          Spend: AED {campaign.spend.toLocaleString()} · Leads: {campaign.leads}
        </p>
      </div>
    </div>
  );
}

interface Props {
  onClose: () => void;
}

export default function CampaignPanel({ onClose }: Props) {
  const [campaigns, setCampaigns] = useState<CachedCampaign[]>([]);
  const [search, setSearch] = useState('');
  const [dsFilter, setDsFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async (q = '', ds = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (ds) params.set('ds_id', ds);
      const res = await fetch(`/api/supermetrics/campaigns?${params}`);
      const data = await res.json();
      setCampaigns(Array.isArray(data) ? data : []);
      if (data.length > 0) setLastSync(data[0].last_updated);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(search, dsFilter); }, [search, dsFilter, load]);

  async function syncNow() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/supermetrics/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) setSyncError(data.error || 'Sync failed');
      else {
        setLastSync(new Date().toISOString());
        load(search, dsFilter);
      }
    } catch (e) {
      setSyncError('Network error');
    } finally {
      setSyncing(false);
    }
  }

  const dsPlatforms = [...new Set(campaigns.map((c) => c.ds_id))];

  return (
    <div className="w-80 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 bg-gray-50">
        <span className="text-sm font-semibold text-gray-700">Supermetrics Campaigns</span>
        <div className="flex items-center gap-1">
          <button
            onClick={syncNow}
            disabled={syncing}
            className="p-1 rounded text-gray-500 hover:bg-gray-200 disabled:opacity-50"
            title="Sync from Supermetrics"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={onClose} className="p-1 rounded text-gray-500 hover:bg-gray-200">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-2 py-2 border-b border-gray-100 space-y-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns…"
            className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded outline-none focus:border-blue-400"
          />
        </div>
        {dsPlatforms.length > 1 && (
          <select
            value={dsFilter}
            onChange={(e) => setDsFilter(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-200 rounded outline-none"
          >
            <option value="">All platforms</option>
            {dsPlatforms.map((ds) => (
              <option key={ds} value={ds}>{DS_NAMES[ds] ?? ds}</option>
            ))}
          </select>
        )}
      </div>

      {/* Error */}
      {syncError && (
        <div className="mx-2 mt-2 px-2 py-1.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {syncError}
        </div>
      )}

      {/* Count + last sync */}
      <div className="px-3 py-1 flex items-center justify-between">
        <span className="text-[11px] text-gray-400">{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}</span>
        {lastSync && <span className="text-[10px] text-gray-300">Synced {new Date(lastSync).toLocaleDateString()}</span>}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-1 pb-4 space-y-0.5">
        {loading && (
          <div className="py-8 text-center text-xs text-gray-400">Loading…</div>
        )}
        {!loading && campaigns.length === 0 && (
          <div className="py-8 text-center text-xs text-gray-400">
            {search ? 'No campaigns match your search.' : 'No campaigns yet. Sync from Supermetrics to see campaigns here.'}
          </div>
        )}
        {campaigns.map((c) => (
          <DraggableItem key={c.id} campaign={c} />
        ))}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
        <p className="text-[10px] text-gray-400 text-center">Drag a campaign onto a row to assign it</p>
      </div>
    </div>
  );
}
