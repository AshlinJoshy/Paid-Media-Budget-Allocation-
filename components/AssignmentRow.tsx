'use client';
import { useState } from 'react';
import { Trash2, RefreshCw } from 'lucide-react';
import EditableCell from './EditableCell';
import DropdownCell from './DropdownCell';
import { PaidAssignment, PLATFORM_COLORS, DropdownOptions } from '@/types';

interface Props {
  row: PaidAssignment;
  options: DropdownOptions;
  onUpdate: (id: string, field: string, value: string | number) => void;
  onDelete: (id: string) => void;
  onAddOption: (field: string, value: string) => void;
}

function fmtAED(n: number) {
  if (!n && n !== 0) return '—';
  return 'AED ' + n.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function CampaignStatusBadge({ status }: { status: string }) {
  if (!status) return null;
  const isEnabled = status.toUpperCase() === 'ENABLED';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
      isEnabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
    }`}>
      {isEnabled ? 'Enabled' : 'Disabled'}
    </span>
  );
}

export default function AssignmentRow({ row, options, onUpdate, onDelete, onAddOption }: Props) {
  const [hovering, setHovering] = useState(false);
  const colors = PLATFORM_COLORS[row.platform] ?? PLATFORM_COLORS['unknown'];

  function save(field: string) {
    return (v: string) => {
      const numericFields = ['budget_allocation', 'budget_spent', 'leads'];
      onUpdate(row.id, field, numericFields.includes(field) ? parseFloat(v) || 0 : v);
    };
  }

  const remaining = row.budget_allocation - row.budget_spent;
  const cpl = row.leads > 0 ? Math.round((row.budget_spent / row.leads) * 100) / 100 : 0;

  return (
    <tr
      className={`${colors.row} ${colors.accent} border-b border-gray-100 transition-colors`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Type */}
      <td className="px-2 py-1.5 min-w-[110px]">
        <EditableCell value={row.type} onSave={save('type')} placeholder="Type…" />
      </td>
      {/* Source */}
      <td className="px-2 py-1.5 min-w-[130px]">
        <DropdownCell
          value={row.source}
          options={options.source}
          field="source"
          onSave={save('source')}
          onAddOption={onAddOption}
          placeholder="Source…"
        />
      </td>
      {/* Start Month */}
      <td className="px-2 py-1.5 min-w-[100px]">
        <DropdownCell
          value={row.start_month}
          options={options.start_month}
          field="start_month"
          onSave={save('start_month')}
          onAddOption={onAddOption}
          placeholder="Month…"
        />
      </td>
      {/* Start Date */}
      <td className="px-2 py-1.5 min-w-[110px]">
        <EditableCell value={row.start_date} onSave={save('start_date')} placeholder="dd-Mon-yyyy" />
      </td>
      {/* Status */}
      <td className="px-2 py-1.5 min-w-[90px]">
        <DropdownCell
          value={row.status}
          options={options.status}
          field="status"
          onSave={save('status')}
          onAddOption={onAddOption}
          placeholder="Status…"
        />
      </td>
      {/* Budget Allocation */}
      <td className="px-2 py-1.5 min-w-[120px] text-right">
        <EditableCell
          value={row.budget_allocation ? String(row.budget_allocation) : ''}
          onSave={save('budget_allocation')}
          type="number"
          placeholder="0"
          className="text-right"
        />
      </td>
      {/* Budget Spent */}
      <td className="px-2 py-1.5 min-w-[110px] text-right">
        <span className="block text-xs text-right px-1">{fmtAED(row.budget_spent)}</span>
      </td>
      {/* Remaining */}
      <td className={`px-2 py-1.5 min-w-[110px] text-right`}>
        <span className={`block text-xs text-right px-1 font-medium ${remaining < 0 ? 'text-red-600' : remaining < row.budget_allocation * 0.1 ? 'text-orange-600' : 'text-gray-700'}`}>
          {fmtAED(remaining)}
        </span>
      </td>
      {/* Leads */}
      <td className="px-2 py-1.5 min-w-[70px] text-right">
        <span className="block text-xs text-right px-1 font-medium">{row.leads > 0 ? row.leads.toLocaleString() : '—'}</span>
      </td>
      {/* CPL */}
      <td className="px-2 py-1.5 min-w-[90px] text-right">
        <span className="block text-xs text-right px-1">{cpl > 0 ? fmtAED(cpl) : '—'}</span>
      </td>
      {/* Paid Campaign Name */}
      <td className="px-2 py-1.5 min-w-[200px]">
        <div className="flex items-center gap-1.5">
          <EditableCell value={row.paid_campaign_name ?? ''} onSave={save('paid_campaign_name')} placeholder="Campaign name…" className="flex-1" />
          {row.campaign_status && <CampaignStatusBadge status={row.campaign_status} />}
        </div>
      </td>
      {/* Last synced */}
      <td className="px-2 py-1.5 min-w-[80px]">
        {row.last_synced && (
          <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
            <RefreshCw className="h-2.5 w-2.5" />
            {new Date(row.last_synced).toLocaleDateString()}
          </span>
        )}
      </td>
      {/* Actions */}
      <td className="px-2 py-1.5 w-10">
        <button
          onClick={() => onDelete(row.id)}
          className={`p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-opacity ${hovering ? 'opacity-100' : 'opacity-0'}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}
