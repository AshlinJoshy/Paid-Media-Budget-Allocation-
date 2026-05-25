'use client';
import { useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { Filters } from '@/lib/engage-analytics';

interface Props {
  options: {
    clientType: string[];
    canonicalSource: string[];
    utmSource: string[];
    utmMedium: string[];
    utmCampaign: string[];
    utmContent: string[];
    campaignCode: string[];
    campaignCodeOrigin: string[];
    branch: string[];
    division: string[];
  };
  filters: Filters;
  onChange: (f: Filters) => void;
  totalRows: number;
  filteredRows: number;
}

export default function FilterPanel({ options, filters, onChange, totalRows, filteredRows }: Props) {
  function toggle(field: keyof Filters, value: string) {
    const current = filters[field] as Set<string>;
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange({ ...filters, [field]: next });
  }

  function clear(field?: keyof Filters) {
    if (!field) {
      onChange({
        dateFrom: '', dateTo: '',
        clientType: new Set(), canonicalSource: new Set(),
        utmSource: new Set(), utmMedium: new Set(),
        utmCampaign: new Set(), utmContent: new Set(),
        campaignCode: new Set(), campaignCodeOrigin: new Set(),
        branch: new Set(), division: new Set(),
      });
      return;
    }
    if (field === 'dateFrom' || field === 'dateTo') {
      onChange({ ...filters, [field]: '' });
    } else {
      onChange({ ...filters, [field]: new Set() });
    }
  }

  const anyActive = !!(
    filters.dateFrom || filters.dateTo ||
    filters.clientType.size || filters.canonicalSource.size ||
    filters.utmSource.size || filters.utmMedium.size ||
    filters.utmCampaign.size || filters.utmContent.size ||
    filters.campaignCode.size || filters.campaignCodeOrigin.size ||
    filters.branch.size || filters.division.size
  );

  return (
    <aside className="w-64 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
      <div className="px-3 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Filters</div>
          <div className="text-xs text-gray-700 mt-0.5 tabular-nums">
            {filteredRows.toLocaleString()} <span className="text-gray-400">of {totalRows.toLocaleString()} leads</span>
          </div>
        </div>
        {anyActive && (
          <button onClick={() => clear()} className="text-[11px] text-blue-600 hover:text-blue-800">
            Clear all
          </button>
        )}
      </div>

      <Section title="Lead created" defaultOpen>
        <div className="space-y-1.5">
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
            className="w-full text-xs px-2 py-1 border border-gray-200 rounded outline-none"
            placeholder="From"
          />
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
            className="w-full text-xs px-2 py-1 border border-gray-200 rounded outline-none"
            placeholder="To"
          />
        </div>
      </Section>

      <Section title="Client type" count={filters.clientType.size} defaultOpen>
        <ChipList values={options.clientType} selected={filters.clientType} onToggle={(v) => toggle('clientType', v)} />
      </Section>
      <Section title="Campaign code" count={filters.campaignCode.size} defaultOpen>
        <ChipList values={options.campaignCode} selected={filters.campaignCode} onToggle={(v) => toggle('campaignCode', v)} searchable />
      </Section>
      <Section title="Code origin (UTM / Internal)" count={filters.campaignCodeOrigin.size}>
        <ChipList values={options.campaignCodeOrigin} selected={filters.campaignCodeOrigin} onToggle={(v) => toggle('campaignCodeOrigin', v)} />
      </Section>
      <Section title="Source bucket" count={filters.canonicalSource.size}>
        <ChipList values={options.canonicalSource} selected={filters.canonicalSource} onToggle={(v) => toggle('canonicalSource', v)} />
      </Section>
      <Section title="UTM source" count={filters.utmSource.size}>
        <ChipList values={options.utmSource} selected={filters.utmSource} onToggle={(v) => toggle('utmSource', v)} searchable />
      </Section>
      <Section title="UTM medium" count={filters.utmMedium.size}>
        <ChipList values={options.utmMedium} selected={filters.utmMedium} onToggle={(v) => toggle('utmMedium', v)} searchable />
      </Section>
      <Section title="UTM campaign" count={filters.utmCampaign.size}>
        <ChipList values={options.utmCampaign} selected={filters.utmCampaign} onToggle={(v) => toggle('utmCampaign', v)} searchable />
      </Section>
      <Section title="UTM content (ad)" count={filters.utmContent.size}>
        <ChipList values={options.utmContent} selected={filters.utmContent} onToggle={(v) => toggle('utmContent', v)} searchable />
      </Section>
      <Section title="Branch" count={filters.branch.size}>
        <ChipList values={options.branch} selected={filters.branch} onToggle={(v) => toggle('branch', v)} searchable />
      </Section>
      <Section title="Division" count={filters.division.size}>
        <ChipList values={options.division} selected={filters.division} onToggle={(v) => toggle('division', v)} />
      </Section>
    </aside>
  );
}

function Section({ title, count, defaultOpen, children }: { title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-b border-gray-100">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wider text-gray-500 font-semibold hover:bg-gray-50"
      >
        <span className="flex items-center gap-1">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {title}
          {!!count && <span className="bg-blue-100 text-blue-700 rounded px-1 py-0 text-[9px] ml-1">{count}</span>}
        </span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function ChipList({ values, selected, onToggle, searchable }: {
  values: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  searchable?: boolean;
}) {
  const [q, setQ] = useState('');
  const filtered = q ? values.filter((v) => v.toLowerCase().includes(q.toLowerCase())) : values;
  const display = filtered.slice(0, 80);
  return (
    <div>
      {searchable && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="w-full text-xs px-2 py-1 mb-1.5 border border-gray-200 rounded outline-none"
        />
      )}
      <div className="space-y-0.5 max-h-48 overflow-y-auto">
        {display.map((v) => {
          const on = selected.has(v);
          return (
            <button
              key={v}
              onClick={() => onToggle(v)}
              className={`w-full flex items-center justify-between text-left text-[11px] px-2 py-1 rounded transition-colors duration-100 ${on ? 'bg-blue-50 text-blue-800' : 'hover:bg-gray-50 text-gray-700'}`}
            >
              <span className="truncate">{v}</span>
              {on && <X className="h-3 w-3 shrink-0 ml-1" />}
            </button>
          );
        })}
        {filtered.length > display.length && (
          <div className="text-[10px] text-gray-400 py-1 text-center">
            +{filtered.length - display.length} more — refine search
          </div>
        )}
        {display.length === 0 && <div className="text-[10px] text-gray-400 py-1">No options</div>}
      </div>
    </div>
  );
}
