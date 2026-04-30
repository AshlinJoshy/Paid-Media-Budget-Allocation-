const BASE = 'https://api.supermetrics.com/enterprise/v2';

export interface SMRawAccount { id: string; name: string }
export interface SMRawCampaign {
  campaign_id?: string;
  campaign_name?: string;
  campaign_status?: string;
  spend?: string | number;
  cost?: string | number;
  leads?: string | number;
  conversions?: string | number;
}

export interface SMAccountsResult {
  accounts: SMRawAccount[];
  rawResponse?: unknown;
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
    // website_leads field is not available on all Meta accounts — use leads only
    fields = ['campaign_id', 'campaign_name', 'campaign_status', 'spend', 'leads'];
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
  const json = await res.json() as Record<string, unknown>;
  const rawData = (json.data ?? []) as unknown[];

  // Supermetrics returns columnar format (array of arrays) when no_json_keys=true (account default).
  // First row is the header row — skip it and map remaining rows to objects by field position.
  if (rawData.length > 0 && Array.isArray(rawData[0])) {
    const dataRows = rawData.slice(1) as unknown[][];
    return dataRows.map((row) => {
      const obj: Record<string, unknown> = {};
      fields.forEach((f, i) => { obj[f] = row[i]; });
      return obj as SMRawCampaign;
    });
  }

  return rawData as SMRawCampaign[];
}

export function parseCampaignRow(row: SMRawCampaign, dsId: string) {
  const spend = parseFloat(String(row.spend ?? row.cost ?? 0)) || 0;
  const leads =
    dsId === 'FA'
      ? parseInt(String(row.leads ?? 0)) || 0
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
