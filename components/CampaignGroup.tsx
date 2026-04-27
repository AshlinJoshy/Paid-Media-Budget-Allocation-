'use client';
import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import AssignmentRow from './AssignmentRow';
import EditableCell from './EditableCell';
import DropdownCell from './DropdownCell';
import { MarketingCampaign, PaidAssignment, DropdownOptions } from '@/types';

interface Props {
  campaign: MarketingCampaign;
  options: DropdownOptions;
  onUpdateCampaign: (id: string, field: string, value: string) => void;
  onDeleteCampaign: (id: string) => void;
  onUpdateAssignment: (id: string, field: string, value: string | number) => void;
  onDeleteAssignment: (id: string) => void;
  onAddAssignment: (campaignId: string) => void;
  onAddOption: (field: string, value: string) => void;
}

function fmtAED(n: number) {
  return 'AED ' + n.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function CampaignGroup({
  campaign, options,
  onUpdateCampaign, onDeleteCampaign,
  onUpdateAssignment, onDeleteAssignment,
  onAddAssignment, onAddOption,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [hovering, setHovering] = useState(false);

  const { setNodeRef, isOver } = useDroppable({ id: campaign.id });

  const assignments = campaign.assignments ?? [];
  const totalBudget = assignments.reduce((s, a) => s + (a.budget_allocation ?? 0), 0);
  const totalSpent = assignments.reduce((s, a) => s + (a.budget_spent ?? 0), 0);
  const totalRemaining = totalBudget - totalSpent;
  const totalLeads = assignments.reduce((s, a) => s + (a.leads ?? 0), 0);
  const avgCpl = totalLeads > 0 ? Math.round((totalSpent / totalLeads) * 100) / 100 : 0;

  return (
    <>
      {/* Group header */}
      <tr
        ref={setNodeRef}
        className={`bg-gray-100 border-b-2 border-gray-300 transition-colors ${isOver ? 'bg-blue-50 ring-2 ring-blue-300' : ''}`}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {/* Expand toggle */}
        <td className="px-2 py-2 w-8">
          <button onClick={() => setExpanded((e) => !e)} className="text-gray-500 hover:text-gray-700">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        {/* Entity */}
        <td className="px-2 py-2 min-w-[100px]">
          <DropdownCell
            value={campaign.entity}
            options={options.entity}
            field="entity"
            onSave={(v) => onUpdateCampaign(campaign.id, 'entity', v)}
            onAddOption={onAddOption}
            placeholder="Entity…"
            className="font-semibold text-xs"
          />
        </td>
        {/* Campaign name */}
        <td className="px-2 py-2 min-w-[200px]" colSpan={2}>
          <EditableCell
            value={campaign.name}
            onSave={(v) => onUpdateCampaign(campaign.id, 'name', v)}
            placeholder="Campaign / Project name…"
            className="font-semibold text-sm"
          />
        </td>
        {/* Totals — shown starting from Status column onward */}
        <td className="px-2 py-2 min-w-[90px]">
          <span className="text-[11px] text-gray-400">{assignments.length} line{assignments.length !== 1 ? 's' : ''}</span>
        </td>
        <td className="px-2 py-2 text-right min-w-[120px]">
          <span className="text-xs font-semibold text-gray-700">{fmtAED(totalBudget)}</span>
        </td>
        <td className="px-2 py-2 text-right min-w-[110px]">
          <span className="text-xs text-gray-600">{fmtAED(totalSpent)}</span>
        </td>
        <td className="px-2 py-2 text-right min-w-[110px]">
          <span className={`text-xs font-semibold ${totalRemaining < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
            {fmtAED(totalRemaining)}
          </span>
        </td>
        <td className="px-2 py-2 text-right min-w-[70px]">
          <span className="text-xs font-semibold text-gray-700">{totalLeads > 0 ? totalLeads.toLocaleString() : '—'}</span>
        </td>
        <td className="px-2 py-2 text-right min-w-[90px]">
          <span className="text-xs text-gray-600">{avgCpl > 0 ? fmtAED(avgCpl) : '—'}</span>
        </td>
        {/* Pad remaining columns */}
        <td colSpan={3} className="px-2 py-2">
          <div className="flex items-center gap-1">
            {isOver && <span className="text-xs text-blue-600 font-medium">Drop here →</span>}
            <button
              onClick={() => onAddAssignment(campaign.id)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded border border-blue-200"
            >
              <Plus className="h-3 w-3" /> Add row
            </button>
            <button
              onClick={() => onDeleteCampaign(campaign.id)}
              className={`p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-opacity ${hovering ? 'opacity-100' : 'opacity-0'}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>

      {/* Assignment rows */}
      {expanded && assignments.map((a: PaidAssignment) => (
        <AssignmentRow
          key={a.id}
          row={a}
          options={options}
          onUpdate={onUpdateAssignment}
          onDelete={onDeleteAssignment}
          onAddOption={onAddOption}
        />
      ))}
    </>
  );
}
