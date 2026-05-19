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

export async function smFetchAccounts(apiKey: string, dsId: string): Promise<SMRawAccount[]> {
  const url = `${BASE}/meta/profiles?api_key=${encodeURIComponent(apiKey)}&ds_id=${encodeURIComponent(dsId)}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`SM profiles error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.data ?? []) as SMRawAccount[];
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

  const res = await fetch(`${BASE}/query/data/json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`SM query error ${res.status}: ${await res.text()}`);
  const json = await res.json();

  const rawData: unknown[] = json.data ?? [];
  if (rawData.length === 0) return [];

  // Supermetrics v2 /query/data/json returns array-of-arrays (positional).
  // Use meta.query.fields to map positional values back to field IDs.
  const metaFieldsRaw = json.meta?.query?.fields;
  const metaFields: string[] = Array.isArray(metaFieldsRaw) && metaFieldsRaw.length
    ? metaFieldsRaw
        .map((f: unknown) => typeof f === 'string' ? f : (f as { id?: string })?.id ?? '')
        .filter(Boolean)
    : mapping.request;

  const rows: Record<string, unknown>[] = Array.isArray(rawData[0])
    ? (rawData as unknown[][]).map((row) => {
        const obj: Record<string, unknown> = {};
        metaFields.forEach((name, i) => { obj[name] = row[i]; });
        return obj;
      })
    : (rawData as Record<string, unknown>[]);

  return rows.map((row): SMNormalizedCampaign => {
    const spend = parseFloat(String(row[mapping.spend] ?? 0)) || 0;
    const leads = mapping.leads.reduce(
      (sum, fieldId) => sum + (parseInt(String(row[fieldId] ?? 0)) || 0),
      0,
    );
    const conversions = parseInt(String(row[mapping.conversions] ?? leads)) || leads;
    return {
      campaign_id: String(row[mapping.campaign_id] ?? ''),
      campaign_name: String(row[mapping.campaign_name] ?? ''),
      status: String(row[mapping.campaign_status] ?? 'ENABLED').toUpperCase(),
      spend,
      leads,
      conversions,
    };
  });
}
