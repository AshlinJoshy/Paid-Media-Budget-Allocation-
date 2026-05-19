const BASE = 'https://api.supermetrics.com/enterprise/v2';

export interface SMLogin {
  id: string;
  ds_id: string;
  ds_name?: string;
  name?: string;
  status?: string;
}

export interface SMRawAccount {
  account_id: string;
  name?: string;
  account_name?: string;
  group?: string;
}

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

function authHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

export async function smFetchLogins(apiKey: string): Promise<SMLogin[]> {
  const res = await fetch(`${BASE}/ds/logins`, {
    headers: authHeaders(apiKey),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`SM logins error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.data ?? []) as SMLogin[];
}

export async function smFetchLoginAccounts(apiKey: string, loginId: string): Promise<SMRawAccount[]> {
  const res = await fetch(`${BASE}/ds/login/${encodeURIComponent(loginId)}/accounts?limit=1000`, {
    headers: authHeaders(apiKey),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`SM login-accounts error ${res.status}: ${await res.text()}`);
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
    ds_id: dsId,
    ds_accounts: accountIds,
    date_range_type: dateRangeType,
    fields,
    max_rows: 10000,
  };

  const res = await fetch(`${BASE}/query/data/json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(apiKey) },
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
