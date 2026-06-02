'use client';
import { Fragment, useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface BreakdownAd {
  name: string;
  leads: number;
  qualified: number;
}
export interface BreakdownAdset {
  name: string;
  leads: number;
  qualified: number;
  ads: BreakdownAd[];
}
export interface BreakdownData {
  campaign: string;
  adsets: BreakdownAdset[];
}

interface Props {
  data: BreakdownData | 'loading' | 'error' | undefined;
}

function fmtNum(n: number) {
  if (!n) return '—';
  return n.toLocaleString();
}

// Renders the ad-set / ad sub-rows that appear under an expanded AssignmentRow.
// Returns a fragment of <tr>s aligned to the parent table's 14-column layout.
//
// Each ad set has its own collapsible chevron — toggling it reveals the ads
// (utm_content) under that ad set. Two-level expand: campaign → ad sets → ads.
export default function BreakdownRows({ data }: Props) {
  const initialExpanded = useMemo(() => {
    // Auto-expand the top ad set if there's only one — saves a click.
    if (data && typeof data === 'object' && data.adsets.length === 1) {
      return new Set([data.adsets[0].name]);
    }
    return new Set<string>();
  }, [data]);
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(initialExpanded);

  if (data === 'loading') {
    return (
      <tr className="bg-blue-50/30">
        <td colSpan={14} className="px-3 py-2 text-xs text-gray-500 italic border border-gray-200">
          Loading ad set / ad breakdown from Engage…
        </td>
      </tr>
    );
  }
  if (data === 'error') {
    return (
      <tr className="bg-red-50/30">
        <td colSpan={14} className="px-3 py-2 text-xs text-red-600 border border-gray-200">
          Couldn&apos;t load breakdown. Check that the campaign name matches a utm_campaign or internal code in Engage.
        </td>
      </tr>
    );
  }
  if (!data) return null;
  if (data.adsets.length === 0) {
    return (
      <tr className="bg-gray-50/50">
        <td colSpan={14} className="px-3 py-2 text-xs text-gray-500 italic border border-gray-200">
          No matching leads in Engage for this campaign.
        </td>
      </tr>
    );
  }

  function toggleAdset(name: string) {
    setExpandedAdsets((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  return (
    <>
      {data.adsets.map((adset) => {
        const open = expandedAdsets.has(adset.name);
        return (
          <Fragment key={`adset-${adset.name}`}>
            {/* Ad set row */}
            <tr className="bg-blue-50/40 text-gray-700">
              {/* Type + Source — empty */}
              <td colSpan={2} className="border border-gray-200" />
              {/* Paid Campaign — adset name with expand chevron */}
              <td className="px-2 py-1.5 border border-gray-200">
                <button
                  onClick={() => toggleAdset(adset.name)}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-gray-900"
                >
                  {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                  <span className="text-gray-400 select-none">↳ Ad set:</span>
                  <span className="truncate">{adset.name}</span>
                  <span className="text-[10px] text-gray-400">({adset.ads.length} ad{adset.ads.length !== 1 ? 's' : ''})</span>
                </button>
              </td>
              {/* Status + Start Date + Allocated + Spent + Remaining — empty */}
              <td colSpan={5} className="border border-gray-200" />
              {/* Leads */}
              <td className="px-2 py-1.5 text-right border border-gray-200">
                <span className="text-xs font-medium text-gray-700 tabular-nums">{fmtNum(adset.leads)}</span>
              </td>
              {/* CPL — empty (no spend per ad set) */}
              <td className="border border-gray-200" />
              {/* Qualified */}
              <td className="px-2 py-1.5 text-right border border-gray-200">
                <span className="text-xs font-medium text-gray-700 tabular-nums">{fmtNum(adset.qualified)}</span>
              </td>
              {/* Impressions + Clicks + Action — empty */}
              <td colSpan={3} className="border border-gray-200" />
            </tr>

            {/* Ad rows (utm_content) — only when this ad set is expanded */}
            {open && adset.ads.map((ad) => (
              <tr key={`ad-${adset.name}-${ad.name}`} className="bg-blue-50/20 text-gray-600">
                <td colSpan={2} className="border border-gray-200" />
                <td className="px-2 py-1 border border-gray-200">
                  <div className="flex items-center gap-1.5 pl-5 text-xs">
                    <span className="text-gray-400 select-none">↳ Ad:</span>
                    <span className="truncate">{ad.name}</span>
                  </div>
                </td>
                <td colSpan={5} className="border border-gray-200" />
                <td className="px-2 py-1 text-right border border-gray-200">
                  <span className="text-xs tabular-nums">{fmtNum(ad.leads)}</span>
                </td>
                <td className="border border-gray-200" />
                <td className="px-2 py-1 text-right border border-gray-200">
                  <span className="text-xs tabular-nums">{fmtNum(ad.qualified)}</span>
                </td>
                <td colSpan={3} className="border border-gray-200" />
              </tr>
            ))}
          </Fragment>
        );
      })}
    </>
  );
}
