// Client-side analytics helpers. Operates on the raw row arrays returned by
// /api/engage/leads so we can build any view without another round-trip.

export interface LeadRow {
  lead_id: number;
  lead_reference: string | null;
  lead_created_at: string;
  lead_last_updated_at: string | null;
  customer_id: number | null;
  client_type: string | null;
  current_stage: string | null;
  lead_state: string | null;
  lead_score: string | null;
  purpose: string | null;
  canonical_source: string | null;
  raw_source: string | null;
  enquiry_method: string | null;
  contact_method: string | null;
  input_source: string | null;
  is_whatsapp_chat: number | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  campaign_code: string | null;
  campaign_code_origin: string | null; // 'UTM' | 'Internal' | null
  internal_campaign_ids: string | null;
  internal_campaign_codes: string | null;
  internal_campaign_names: string | null;
  current_agent_id: number | null;
  current_agent_name: string | null;
  current_agent_status: string | null;
  branch: string | null;
  division: string | null;
  agent_reassignment_count: number;
  first_agent_change_at: string | null;
  last_agent_change_at: string | null;
  stage_1_lead_received: number;
  stage_2_qualified: number;
  stage_2b_valuation: number;
  stage_3b_listed: number;
  stage_3_viewing: number;
  stage_4_offer: number;
  stage_5_reserved: number;
  stage_6_deal_closed: number;
  customer_comm_count: number;
  incoming_contacts: number;
  outgoing_contacts: number;
  successful_contacts: number;
  phone_attempts: number;
  email_attempts: number;
  whatsapp_attempts: number;
  total_activities: number;
  first_activity_at: string | null;
  last_activity_datetime: string | null;
  first_touch_at: string | null;
  hours_to_first_touch: number | null;
  last_touch_at: string | null;
  days_since_last_touch: number | null;
  responsiveness_flag: string | null;
  lead_notes_count: number;
  listings_enquired: number | null;
  conversion_status: string | null;
  deal_reference: string | null;
  deal_type: string | null;
  deal_status: string | null;
  deal_final_price: number | null;
  deal_commission: number | null;
  deal_reserved_at: string | null;
  deal_closed_at: string | null;
}

export function rowsToObjects(columns: string[], rows: unknown[][]): LeadRow[] {
  const idx: Record<string, number> = {};
  columns.forEach((c, i) => { idx[c] = i; });
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const c of columns) o[c] = r[idx[c]];
    return o as unknown as LeadRow;
  });
}

export type StringFilter = Set<string>;

export interface Filters {
  dateFrom: string;
  dateTo: string;
  clientType: StringFilter;
  canonicalSource: StringFilter;
  utmSource: StringFilter;
  utmMedium: StringFilter;
  utmCampaign: StringFilter;
  utmContent: StringFilter;
  campaignCode: StringFilter;
  campaignCodeOrigin: StringFilter; // 'UTM' / 'Internal'
  branch: StringFilter;
  division: StringFilter;
}

function passes(filter: StringFilter, value: string | null): boolean {
  if (filter.size === 0) return true;
  if (!value) return filter.has('(none)');
  return filter.has(value);
}

export function applyFilters(leads: LeadRow[], f: Filters): LeadRow[] {
  const fromTs = f.dateFrom ? new Date(f.dateFrom).getTime() : -Infinity;
  const toTs = f.dateTo ? new Date(f.dateTo + 'T23:59:59').getTime() : Infinity;
  return leads.filter((l) => {
    const ts = new Date(l.lead_created_at).getTime();
    if (isNaN(ts) || ts < fromTs || ts > toTs) return false;
    if (!passes(f.clientType, l.client_type)) return false;
    if (!passes(f.canonicalSource, l.canonical_source)) return false;
    if (!passes(f.utmSource, l.utm_source)) return false;
    if (!passes(f.utmMedium, l.utm_medium)) return false;
    if (!passes(f.utmCampaign, l.utm_campaign)) return false;
    if (!passes(f.utmContent, l.utm_content)) return false;
    if (!passes(f.campaignCode, l.campaign_code)) return false;
    if (!passes(f.campaignCodeOrigin, l.campaign_code_origin)) return false;
    if (!passes(f.branch, l.branch)) return false;
    if (!passes(f.division, l.division)) return false;
    return true;
  });
}

export function uniqueValues(leads: LeadRow[], key: keyof LeadRow): string[] {
  const set = new Set<string>();
  for (const l of leads) {
    const v = l[key];
    if (v == null || v === '') continue;
    set.add(String(v));
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

// Mapping from Filters set-field → LeadRow column. Used by buildFacetedOptions
// to know which lead column a given filter dimension narrows.
const FILTER_TO_COLUMN: Record<Exclude<keyof Filters, 'dateFrom' | 'dateTo'>, keyof LeadRow> = {
  clientType: 'client_type',
  canonicalSource: 'canonical_source',
  utmSource: 'utm_source',
  utmMedium: 'utm_medium',
  utmCampaign: 'utm_campaign',
  utmContent: 'utm_content',
  campaignCode: 'campaign_code',
  campaignCodeOrigin: 'campaign_code_origin',
  branch: 'branch',
  division: 'division',
};

// Faceted options: for each filter dimension, return values that exist in the
// subset of leads passing every OTHER filter. So if you pick Campaign X, the
// Branch dropdown narrows to branches with Campaign X leads — but the Campaign
// dropdown keeps showing every campaign so you can swap your selection.
//
// Currently-selected values are always included even if the cross-filter
// produces zero rows for them, so the user can always deselect.
export function buildFacetedOptions(
  leads: LeadRow[],
  filters: Filters,
): Record<keyof typeof FILTER_TO_COLUMN, string[]> {
  const out = {} as Record<keyof typeof FILTER_TO_COLUMN, string[]>;
  for (const field of Object.keys(FILTER_TO_COLUMN) as (keyof typeof FILTER_TO_COLUMN)[]) {
    const tempFilters: Filters = { ...filters, [field]: new Set<string>() };
    const subset = applyFilters(leads, tempFilters);
    const available = new Set(uniqueValues(subset, FILTER_TO_COLUMN[field]));
    for (const v of filters[field]) available.add(v); // keep current selections visible
    out[field] = Array.from(available).sort((a, b) => a.localeCompare(b));
  }
  return out;
}

// ============ Funnel ============

export interface FunnelStage { name: string; key: keyof LeadRow; count: number }

const ACQUISITION_STAGES: { name: string; key: keyof LeadRow }[] = [
  { name: 'Lead', key: 'stage_1_lead_received' },
  { name: 'Qualified', key: 'stage_2_qualified' },
  { name: 'Viewing', key: 'stage_3_viewing' },
  { name: 'Offer', key: 'stage_4_offer' },
  { name: 'Reserved', key: 'stage_5_reserved' },
  { name: 'Deal Closed', key: 'stage_6_deal_closed' },
];

const SUPPLY_STAGES: { name: string; key: keyof LeadRow }[] = [
  { name: 'Lead', key: 'stage_1_lead_received' },
  { name: 'Valuation', key: 'stage_2b_valuation' },
  { name: 'Listed', key: 'stage_3b_listed' },
  { name: 'Reserved', key: 'stage_5_reserved' },
  { name: 'Deal Closed', key: 'stage_6_deal_closed' },
];

export function buildFunnel(leads: LeadRow[], stages: { name: string; key: keyof LeadRow }[]): FunnelStage[] {
  return stages.map((s) => ({
    name: s.name,
    key: s.key,
    count: leads.reduce((sum, l) => sum + (Number(l[s.key]) || 0), 0),
  }));
}

// Decide which funnel(s) to show based on the active client_type filter.
export function pickFunnels(clientFilter: StringFilter, leads: LeadRow[]): {
  label: string;
  stages: FunnelStage[];
}[] {
  const ACQ = new Set(['Buyer', 'Tenant']);
  const SUP = new Set(['Landlord', 'Seller']);

  const active = clientFilter.size > 0 ? clientFilter : new Set(['Buyer', 'Tenant', 'Landlord', 'Seller']);
  const showAcq = Array.from(active).some((t) => ACQ.has(t));
  const showSup = Array.from(active).some((t) => SUP.has(t));

  const result: { label: string; stages: FunnelStage[] }[] = [];
  if (showAcq) {
    const subset = leads.filter((l) => l.client_type && ACQ.has(l.client_type));
    result.push({ label: 'Acquisition (Buyer / Tenant)', stages: buildFunnel(subset, ACQUISITION_STAGES) });
  }
  if (showSup) {
    const subset = leads.filter((l) => l.client_type && SUP.has(l.client_type));
    result.push({ label: 'Supply (Landlord / Seller)', stages: buildFunnel(subset, SUPPLY_STAGES) });
  }
  return result;
}

// ============ Leaderboards ============

export interface LeaderboardRow {
  key: string;
  leads: number;
  qualified: number;
  reserved: number;
  closed: number;
  qualifyRate: number;
  closeRate: number;
  totalCommission: number;
  avgHoursToTouch: number | null;
  cost?: number;
  cpl?: number;
  cpql?: number;
}

export function groupBy(leads: LeadRow[], key: keyof LeadRow): LeaderboardRow[] {
  const buckets = new Map<string, LeadRow[]>();
  for (const l of leads) {
    const k = (l[key] as string) || '(none)';
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(l);
  }
  const out: LeaderboardRow[] = [];
  for (const [k, ls] of buckets.entries()) {
    const qualified = ls.reduce((s, l) => s + (l.stage_2_qualified || l.stage_2b_valuation || 0 ? 1 : 0), 0);
    const reserved = ls.reduce((s, l) => s + (l.stage_5_reserved ? 1 : 0), 0);
    const closed = ls.reduce((s, l) => s + (l.stage_6_deal_closed ? 1 : 0), 0);
    const totalCommission = ls.reduce((s, l) => s + (Number(l.deal_commission) || 0), 0);
    const touchTimes = ls
      .map((l) => l.hours_to_first_touch)
      .filter((h): h is number => h != null && !Number.isNaN(h));
    const avgHoursToTouch = touchTimes.length
      ? Math.round((touchTimes.reduce((s, h) => s + h, 0) / touchTimes.length) * 10) / 10
      : null;
    out.push({
      key: k,
      leads: ls.length,
      qualified,
      reserved,
      closed,
      qualifyRate: ls.length ? qualified / ls.length : 0,
      closeRate: ls.length ? closed / ls.length : 0,
      totalCommission,
      avgHoursToTouch,
    });
  }
  out.sort((a, b) => b.leads - a.leads);
  return out;
}

// Attach campaign spend (from paid_assignments) keyed by paid_campaign_name → utm_campaign.
export function attachSpend(
  rows: LeaderboardRow[],
  spendByCampaign: Map<string, number>,
): LeaderboardRow[] {
  return rows.map((r) => {
    const cost = spendByCampaign.get(r.key.trim().toLowerCase()) ?? 0;
    return {
      ...r,
      cost,
      cpl: r.leads > 0 ? cost / r.leads : 0,
      cpql: r.qualified > 0 ? cost / r.qualified : 0,
    };
  });
}

// ============ Time series ============

export function leadsByDay(leads: LeadRow[]): { date: string; total: number; qualified: number }[] {
  const map = new Map<string, { total: number; qualified: number }>();
  for (const l of leads) {
    const d = l.lead_created_at?.slice(0, 10) ?? '';
    if (!d) continue;
    if (!map.has(d)) map.set(d, { total: 0, qualified: 0 });
    const b = map.get(d)!;
    b.total++;
    if (l.stage_2_qualified || l.stage_2b_valuation) b.qualified++;
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, total: v.total, qualified: v.qualified }));
}
