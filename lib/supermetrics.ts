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
// Filters to dsId if provided, or returns all platforms.
export async function smFetchAccounts(apiKey: string, dsId: string): Promise<SMAccountsResult> {
  const url = `${BASE}/query/accounts?api_key=${encodeURIComponent(apiKey)}&ds_id=${encodeURIComponent(dsId)}`;
  // Use query param only — avoids ByteString issues if key has non-ASCII chars
  const res = await fetch(url, { cache: 'no-store' });

  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);

  let json: unknown;
  try { json = JSON.parse(text); } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 200)}`);
  }

  // Extract the list from whatever shape Supermetrics returns
  let logins: Record<string, unknown>[] = [];
  if (Array.isArray(json)) {
    logins = json as Record<string, unknown>[];
  } else if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    const candidate = obj.data ?? obj.logins ?? obj.accounts ?? obj.results ?? [];
    logins = Array.isArray(candidate) ? (candidate as Record<string, unknown>[]) : [];
  }

  // Filter by ds_id and extract id + name
  const accounts: SMRawAccount[] = logins
    .filter((l) => !dsId || l.ds_id === dsId)
    .map((l) => ({
      id: String(l.account_id ?? l.id ?? ''),
      name: String(l.account_name ?? l.name ?? l.account_id ?? l.id ?? ''),
    }))
    .filter((a) => a.id);

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
