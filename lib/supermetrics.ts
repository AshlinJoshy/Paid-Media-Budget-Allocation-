const BASE = 'https://api.supermetrics.com/enterprise/v2';

export interface SMRawAccount { id: string; name: string }
export interface SMRawCampaign {
  campaign_id?: string;
  campaign_name?: string;
  campaign_status?: string;
  spend?: string | number;
  cost?: string | number;
  leads?: string | number;
  website_leads?: string | number;
  conversions?: string | number;
}

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
): Promise<SMRawCampaign[]> {
  let fields: string[];
  if (dsId === 'FA') {
    fields = ['campaign_id', 'campaign_name', 'campaign_status', 'spend', 'leads', 'website_leads'];
  } else if (dsId === 'AW') {
    fields = ['campaign_id', 'campaign_name', 'campaign_status', 'cost', 'conversions'];
  } else {
    fields = ['campaign_id', 'campaign_name', 'campaign_status', 'cost', 'conversions'];
  }

  const body = {
    api_key: apiKey,
    ds_id: dsId,
    ds_accounts: accountIds,
    date_range_type: dateRangeType,
    fields,
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
  return (json.data ?? []) as SMRawCampaign[];
}

export function parseCampaignRow(row: SMRawCampaign, dsId: string) {
  const spend = parseFloat(String(row.spend ?? row.cost ?? 0)) || 0;
  const leads =
    dsId === 'FA'
      ? (parseInt(String(row.leads ?? 0)) || 0) + (parseInt(String(row.website_leads ?? 0)) || 0)
      : parseInt(String(row.conversions ?? 0)) || 0;

  return {
    campaign_id: String(row.campaign_id ?? ''),
    campaign_name: String(row.campaign_name ?? ''),
    status: String(row.campaign_status ?? 'ENABLED').toUpperCase(),
    spend,
    leads,
    conversions: parseInt(String(row.conversions ?? leads)) || 0,
  };
}
