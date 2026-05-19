const BASE = 'https://api.supermetrics.com/enterprise/v2';

export interface SMRawAccount { id: string; name: string }

export interface SMNormalizedCampaign {
  campaign_id: string;
  campaign_name: string;
  status: string;
  spend: number;
  leads: number;
  conversions: number;
}

interface FieldMapping {
  request: string[];
  campaign_id: string;
  campaign_name: string;
  campaign_status: string;
  spend: string;
  leads: string[];
  conversions: string;
}

// Supermetrics field IDs are platform-specific. Verified via field_discovery
// against the Supermetrics Enterprise v2 API.
const MAPPINGS: Record<string, FieldMapping> = {
  FA: {
    request: [
      'adcampaign_id',
      'adcampaign_name',
      'campaignstatus',
      'cost',
      'offsite_conversions_fb_pixel_lead',
      'onsite_conversion.lead_grouped',
    ],
    campaign_id: 'adcampaign_id',
    campaign_name: 'adcampaign_name',
    campaign_status: 'campaignstatus',
    spend: 'cost',
    leads: ['offsite_conversions_fb_pixel_lead', 'onsite_conversion.lead_grouped'],
    conversions: 'offsite_conversions_fb_pixel_lead',
  },
  AW: {
    request: ['CampaignID', 'Campaignname', 'Campaignstatus', 'Cost', 'Conversions'],
    campaign_id: 'CampaignID',
    campaign_name: 'Campaignname',
    campaign_status: 'Campaignstatus',
    spend: 'Cost',
    leads: ['Conversions'],
    conversions: 'Conversions',
  },
};

// Normalize platform status strings so the UI's "ENABLED" check works for both
// Meta ("ACTIVE") and Google ("enabled").
const ACTIVE_STATUSES = new Set(['ENABLED', 'ACTIVE']);

export async function smFetchAccounts(apiKey: string, dsId: string): Promise<SMRawAccount[]> {
  const url = `${BASE}/meta/profiles?api_key=${encodeURIComponent(apiKey)}&ds_id=${encodeURIComponent(dsId)}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`SM profiles error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.data ?? []) as SMRawAccount[];
}

async function postWithRetry(url: string, body: unknown, retries = 1): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      next: { revalidate: 0 },
    });
    if (res.ok || res.status < 500 || attempt === retries) return res;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error('postWithRetry exhausted');
}

export async function smFetchCampaigns(
  apiKey: string,
  dsId: string,
  accountIds: string[],
  dateRangeType = 'this_month'
): Promise<SMNormalizedCampaign[]> {
  const mapping = MAPPINGS[dsId];
  if (!mapping) {
    throw new Error(`Unsupported data source "${dsId}". Add a field mapping in lib/supermetrics.ts.`);
  }

  const body = {
    api_key: apiKey,
    ds_id: dsId,
    ds_accounts: accountIds,
    date_range_type: dateRangeType,
    fields: mapping.request,
    max_rows: 10000,
  };

  const res = await postWithRetry(`${BASE}/query/data/json`, body);
  if (!res.ok) throw new Error(`SM query error ${res.status}: ${await res.text()}`);
  const json = await res.json();

  const rawData: unknown[] = json.data ?? [];
  if (rawData.length === 0) return [];

  // Supermetrics v2 /query/data/json returns array-of-arrays in the order of fields
  // requested. The first row is a header row of display names (e.g. "Campaign ID")
  // and rows 1..n are real data. Map positionally using the field IDs we sent, then
  // filter out the header.
  const positional: unknown[][] = Array.isArray(rawData[0])
    ? (rawData as unknown[][])
    : (rawData as Record<string, unknown>[]).map((r) => mapping.request.map((f) => r[f]));

  const rows = positional
    .map((row) => {
      const obj: Record<string, unknown> = {};
      mapping.request.forEach((name, i) => { obj[name] = row[i]; });
      return obj;
    })
    .filter((row) => {
      const id = String(row[mapping.campaign_id] ?? '').trim();
      // Drop empty IDs and header rows (display names contain spaces; real
      // campaign IDs are numeric or `act_<digits>` and never contain spaces).
      return !!id && !id.includes(' ');
    });

  return rows.map((row): SMNormalizedCampaign => {
    const spend = parseFloat(String(row[mapping.spend] ?? 0)) || 0;
    const leads = mapping.leads.reduce(
      (sum, fieldId) => sum + (parseInt(String(row[fieldId] ?? 0)) || 0),
      0,
    );
    const conversions = parseInt(String(row[mapping.conversions] ?? leads)) || leads;
    const rawStatus = String(row[mapping.campaign_status] ?? 'ENABLED').toUpperCase();
    return {
      campaign_id: String(row[mapping.campaign_id] ?? ''),
      campaign_name: String(row[mapping.campaign_name] ?? ''),
      status: ACTIVE_STATUSES.has(rawStatus) ? 'ENABLED' : rawStatus,
      spend,
      leads,
      conversions,
    };
  });
}
