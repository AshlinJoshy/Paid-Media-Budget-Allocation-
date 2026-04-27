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

export interface SMAccountsResult {
  accounts: SMRawAccount[];
  rawResponse?: unknown;
}

function authHeaders(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}` };
}

// Fetch all connected ad accounts via the Management API /query/accounts endpoint.
export async function smFetchAccounts(apiKey: string, dsId: string): Promise<SMAccountsResult> {
  const url = `${BASE}/query/accounts?api_key=${encodeURIComponent(apiKey)}&ds_id=${encodeURIComponent(dsId)}`;
  const res = await fetch(url, { cache: 'no-store' });

  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);

  let json: unknown;
  try { json = JSON.parse(text); } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 200)}`);
  }

  // Response shape: { data: [{ ds_user, accounts: [{ account_id, account_name }] }] }
  const accounts: SMRawAccount[] = [];
  const obj = json as Record<string, unknown>;
  const dataArr = Array.isArray(obj?.data) ? obj.data as Record<string, unknown>[] : [];

  for (const userEntry of dataArr) {
    const nested = userEntry.accounts;
    if (Array.isArray(nested)) {
      for (const acc of nested as Record<string, unknown>[]) {
        const id = String(acc.account_id ?? acc.id ?? '');
        const name = String(acc.account_name ?? acc.name ?? id);
        if (id) accounts.push({ id, name });
      }
    }
  }

  return { accounts, rawResponse: json };
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
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`SM query error ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
