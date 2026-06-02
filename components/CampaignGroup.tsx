'use client';
import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import AssignmentRow from './AssignmentRow';
import EditableCell from './EditableCell';
import DropdownCell from './DropdownCell';
import { BreakdownData } from './BreakdownRows';
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
  onDeleteOption: (field: string, value: string) => void;
  expandedRows: Set<string>;
  breakdowns: Record<string, BreakdownData | 'loading' | 'error' | undefined>;
  onToggleExpand: (rowId: string, paidCampaignName: string) => void;
}

function fmtAED(n: number) {
  if (!n) return '—';
  return 'AED ' + n.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtNum(n: number) {
  if (!n) return '—';
  return n.toLocaleString();
}

export default function CampaignGroup({
  campaign, options,
  onUpdateCampaign, onDeleteCampaign,
  onUpdateAssignment, onDeleteAssignment,
  onAddAssignment, onAddOption, onDeleteOption,
  expandedRows, breakdowns, onToggleExpand,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [hovering, setHovering] = useState(false);

  const { setNodeRef, isOver } = useDroppable({ id: campaign.id });

  const assignments = campaign.assignments ?? [];
  const totalBudget = assignments.reduce((s, a) => s + (a.budget_allocation ?? 0), 0);
  const totalSpent = assignments.reduce((s, a) => s + (a.budget_spent ?? 0), 0);
  const totalRemaining = totalBudget - totalSpent;
  const totalLeads = assignments.reduce((s, a) => s + (a.leads ?? 0), 0);
  const totalQualified = assignments.reduce((s, a) => s + (a.qualified_leads ?? 0), 0);
  const totalImpressions = assignments.reduce((s, a) => s + (a.impressions ?? 0), 0);
  const totalClicks = assignments.reduce((s, a) => s + (a.clicks ?? 0), 0);
  const avgCpl = totalLeads > 0 ? Math.round((totalSpent / totalLeads) * 100) / 100 : 0;
  const isEmptyTotals = totalBudget === 0 && totalSpent === 0;

  return (
    <>
      {/* Group banner — title block (colSpan 5) + 8 total cells + action col = 14 columns */}
      <tr
        ref={setNodeRef}
        className={`group bg-white transition-all duration-200 ease-out ${isOver ? 'bg-blue-50/70 shadow-[inset_3px_0_0_0_rgb(59,130,246)]' : 'shadow-[inset_3px_0_0_0_rgb(229,231,235)] hover:shadow-[inset_3px_0_0_0_rgb(148,163,184)]'}`}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {/* Title block — entity + project/campaign name + line count + Add row */}
        <td colSpan={5} className="px-3 py-2.5 border border-gray-200">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-gray-400 hover:text-gray-700 transition-colors duration-150 shrink-0"
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <div className="shrink-0 max-w-[120px]">
              <DropdownCell
                value={campaign.entity}
                options={options.entity}
                field="entity"
                onSave={(v) => onUpdateCampaign(campaign.id, 'entity', v)}
                onAddOption={onAddOption}
                onDeleteOption={onDeleteOption}
                placeholder="Entity…"
                className="font-semibold uppercase tracking-wide text-gray-500"
              />
            </div>
            <span className="text-gray-300 shrink-0 select-none">·</span>
            <div className="flex-1 min-w-0">
              <EditableCell
                value={campaign.name}
                onSave={(v) => onUpdateCampaign(campaign.id, 'name', v)}
                placeholder="Project / campaign name…"
                className="font-semibold text-gray-900"
              />
            </div>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 shrink-0">
              {assignments.length} line{assignments.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1 shrink-0 pl-2 ml-1 border-l border-gray-200">
              <span
                className={`text-xs text-blue-600 font-medium transition-opacity duration-200 mr-1 ${isOver ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              >
                Drop here
              </span>
              <button
                onClick={() => onAddAssignment(campaign.id)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded border border-blue-200 transition-colors duration-150"
              >
                <Plus className="h-3 w-3" /> Add row
              </button>
            </div>
          </div>
        </td>
        {/* Allocated total */}
        <td className="px-2 py-2.5 text-right min-w-[120px] border border-gray-200">
          <span className="text-xs font-semibold text-gray-800 tabular-nums">{fmtAED(totalBudget)}</span>
        </td>
        {/* Spent total */}
        <td className="px-2 py-2.5 text-right min-w-[110px] border border-gray-200">
          <span className="text-xs text-gray-600 tabular-nums">{fmtAED(totalSpent)}</span>
        </td>
        {/* Remaining total */}
        <td className="px-2 py-2.5 text-right min-w-[110px] border border-gray-200">
          <span className={`text-xs font-semibold tabular-nums ${isEmptyTotals ? 'text-gray-400' : totalRemaining < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
            {isEmptyTotals ? '—' : fmtAED(totalRemaining)}
          </span>
        </td>
        {/* Leads total */}
        <td className="px-2 py-2.5 text-right min-w-[70px] border border-gray-200">
          <span className="text-xs font-semibold text-gray-700 tabular-nums">{fmtNum(totalLeads)}</span>
        </td>
        {/* CPL avg */}
        <td className="px-2 py-2.5 text-right min-w-[90px] border border-gray-200">
          <span className="text-xs text-gray-600 tabular-nums">{avgCpl > 0 ? fmtAED(avgCpl) : '—'}</span>
        </td>
        {/* Qualified Leads total */}
        <td className="px-2 py-2.5 text-right min-w-[110px] border border-gray-200">
          <span className="text-xs font-semibold text-gray-700 tabular-nums">{fmtNum(totalQualified)}</span>
        </td>
        {/* Impressions total */}
        <td className="px-2 py-2.5 text-right min-w-[110px] border border-gray-200">
          <span className="text-xs text-gray-600 tabular-nums">{fmtNum(totalImpressions)}</span>
        </td>
        {/* Clicks total */}
        <td className="px-2 py-2.5 text-right min-w-[90px] border border-gray-200">
          <span className="text-xs text-gray-600 tabular-nums">{fmtNum(totalClicks)}</span>
        </td>
        {/* Delete campaign */}
        <td className="px-2 py-2.5 w-10 border border-gray-200">
          <button
            onClick={() => onDeleteCampaign(campaign.id)}
            className={`p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150 ${hovering ? 'opacity-100' : 'opacity-0'}`}
            title="Delete campaign"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
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
          onDeleteOption={onDeleteOption}
          expanded={expandedRows.has(a.id)}
          breakdown={breakdowns[a.id]}
          onToggleExpand={onToggleExpand}
        />
      ))}
    </>
  );
}
