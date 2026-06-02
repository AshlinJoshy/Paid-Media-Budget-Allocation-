'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import EditableCell from './EditableCell';
import DropdownCell from './DropdownCell';
import { PaidAssignment, PLATFORM_COLORS, DropdownOptions } from '@/types';

interface Props {
  row: PaidAssignment;
  options: DropdownOptions;
  onUpdate: (id: string, field: string, value: string | number) => void;
  onDelete: (id: string) => void;
  onAddOption: (field: string, value: string) => void;
  onDeleteOption: (field: string, value: string) => void;
}

function fmtAED(n: number) {
  if (!n && n !== 0) return '—';
  if (n === 0) return '—';
  return 'AED ' + n.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtNum(n: number) {
  if (!n) return '—';
  return n.toLocaleString();
}

function statusChipClass(value: string) {
  const v = (value || '').toLowerCase();
  if (/live|active|running|enabled/.test(v)) return 'bg-emerald-100 text-emerald-700';
  if (/off|paus|stop|disabl|end/.test(v)) return 'bg-red-100 text-red-700';
  if (/plan/.test(v)) return 'bg-blue-50 text-blue-700';
  if (/complet/.test(v)) return 'bg-gray-100 text-gray-600';
  return '';
}

export default function AssignmentRow({ row, options, onUpdate, onDelete, onAddOption, onDeleteOption }: Props) {
  const [hovering, setHovering] = useState(false);
  const colors = PLATFORM_COLORS[row.platform] ?? PLATFORM_COLORS['unknown'];

  function save(field: string) {
    return (v: string) => {
      const numericFields = ['budget_allocation', 'budget_spent', 'leads', 'qualified_leads', 'impressions', 'clicks'];
      onUpdate(row.id, field, numericFields.includes(field) ? parseFloat(v) || 0 : v);
    };
  }

  const remaining = row.budget_allocation - row.budget_spent;
  const cpl = row.leads > 0 ? Math.round((row.budget_spent / row.leads) * 100) / 100 : 0;
  const isEmptyBudget = row.budget_allocation === 0 && row.budget_spent === 0;

  return (
    <tr
      className={`group ${colors.row} ${colors.accent} transition-colors duration-150 hover:brightness-[0.98]`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Type */}
      <td className="px-2 py-2 min-w-[130px] border border-gray-200">
        <DropdownCell
          value={row.type}
          options={options.type}
          field="type"
          onSave={save('type')}
          onAddOption={onAddOption}
          onDeleteOption={onDeleteOption}
          placeholder="Type…"
        />
      </td>
      {/* Source */}
      <td className="px-2 py-2 min-w-[130px] border border-gray-200">
        <DropdownCell
          value={row.source}
          options={options.source}
          field="source"
          onSave={save('source')}
          onAddOption={onAddOption}
          onDeleteOption={onDeleteOption}
          placeholder="Source…"
        />
      </td>
      {/* Paid Campaign Name */}
      <td className="px-2 py-2 min-w-[220px] border border-gray-200">
        <EditableCell value={row.paid_campaign_name ?? ''} onSave={save('paid_campaign_name')} placeholder="Campaign name…" />
      </td>
      {/* Status — read-only.
          - No campaign linked yet → 'Planned' (the row is a placeholder for an
            upcoming launch). Drag a Supermetrics campaign onto the row to link it.
          - Linked but no synced status yet → '—' with a hint to run Sync.
          - Linked + synced → live platform status (ENABLED/PAUSED/etc.) */}
      <td className="px-2 py-2 min-w-[100px] border border-gray-200">
        {!row.supermetrics_campaign_id ? (
          <span
            className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700"
            title="No campaign linked yet — this row is in planning. Drag a campaign from the right panel to launch it."
          >
            Planned
          </span>
        ) : row.campaign_status ? (
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusChipClass(row.campaign_status)}`}
            title="Live status from the ad platform — synced from Supermetrics, not editable."
          >
            {row.campaign_status}
          </span>
        ) : (
          <span className="text-xs text-gray-400" title="Campaign linked but not synced yet. Run Sync to populate live status.">—</span>
        )}
      </td>
      {/* Start Date */}
      <td className="px-2 py-2 min-w-[120px] border border-gray-200">
        <EditableCell value={row.start_date} onSave={save('start_date')} placeholder="YYYY-MM-DD" type="date" />
      </td>
      {/* Allocated */}
      <td className="px-2 py-2 min-w-[120px] text-right border border-gray-200">
        <EditableCell
          value={row.budget_allocation ? String(row.budget_allocation) : ''}
          onSave={save('budget_allocation')}
          type="number"
          placeholder="—"
          className="text-right tabular-nums"
        />
      </td>
      {/* Spent */}
      <td className="px-2 py-2 min-w-[110px] text-right border border-gray-200">
        <span className="block text-xs text-right px-1 tabular-nums text-gray-700">{fmtAED(row.budget_spent)}</span>
      </td>
      {/* Remaining */}
      <td className="px-2 py-2 min-w-[110px] text-right border border-gray-200">
        <span className={`block text-xs text-right px-1 font-medium tabular-nums ${isEmptyBudget ? 'text-gray-400' : remaining < 0 ? 'text-red-600' : remaining < row.budget_allocation * 0.1 ? 'text-orange-600' : 'text-emerald-700'}`}>
          {isEmptyBudget ? '—' : fmtAED(remaining)}
        </span>
      </td>
      {/* Leads */}
      <td className="px-2 py-2 min-w-[70px] text-right border border-gray-200">
        <span className="block text-xs text-right px-1 font-medium tabular-nums">{fmtNum(row.leads)}</span>
      </td>
      {/* CPL */}
      <td className="px-2 py-2 min-w-[90px] text-right border border-gray-200">
        <span className="block text-xs text-right px-1 tabular-nums text-gray-600">{cpl > 0 ? fmtAED(cpl) : '—'}</span>
      </td>
      {/* Qualified Leads (from Engage) */}
      <td className="px-2 py-2 min-w-[110px] text-right border border-gray-200" title="From Engage (matched by UTM)">
        <span className="block text-xs text-right px-1 font-medium tabular-nums text-gray-700">{fmtNum(row.qualified_leads ?? 0)}</span>
      </td>
      {/* Impressions */}
      <td className="px-2 py-2 min-w-[110px] text-right border border-gray-200">
        <span className="block text-xs text-right px-1 tabular-nums text-gray-600">{fmtNum(row.impressions ?? 0)}</span>
      </td>
      {/* Clicks */}
      <td className="px-2 py-2 min-w-[90px] text-right border border-gray-200">
        <span className="block text-xs text-right px-1 tabular-nums text-gray-600">{fmtNum(row.clicks ?? 0)}</span>
      </td>
      {/* Actions */}
      <td className="px-2 py-2 w-10 border border-gray-200">
        <button
          onClick={() => onDelete(row.id)}
          className={`p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150 ${hovering ? 'opacity-100' : 'opacity-0'}`}
          title="Delete row"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}
