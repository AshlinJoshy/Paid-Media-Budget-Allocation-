const BASE = 'https://api.supermetrics.com/enterprise/v2';

export interface SMLogin {
  login_id: string;
  display_name?: string;
  username?: string;
  revoked_time?: string | null;
  ds_info?: {
    ds_id?: string;
    name?: string;
  };
}

export interface SMRawAccount {
  account_id: string;
  name?: string;
  account_name?: string;
  group?: string;
}

export type SMRawCampaign = Record<string, string | number | undefined>;

export interface ParsedCampaign {
  campaign_id: string;
  campaign_name: string;
  status: string;
  spend: number;
  leads: number;
  conversions: number;
}

function authHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

function num(v: unknown): number {
  const n = parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
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

interface DsFieldSpec {
  fields: string[];
  parse: (row: SMRawCampaign) => ParsedCampaign;
}

const DS_SPECS: Record<string, DsFieldSpec> = {
  FA: {
    fields: [
      'adcampaign_id',
      'adcampaign_name',
      'campaignstatus',
      'cost',
      'offsite_conversions_fb_pixel_lead',
      'onsite_conversion.lead_grouped',
    ],
    parse: (row) => {
      const websiteLeads = num(row['offsite_conversions_fb_pixel_lead']);
      const onFbLeads = num(row['onsite_conversion.lead_grouped']);
      const leads = websiteLeads + onFbLeads;
      return {
        campaign_id: String(row['adcampaign_id'] ?? ''),
        campaign_name: String(row['adcampaign_name'] ?? ''),
        status: String(row['campaignstatus'] ?? 'ENABLED').toUpperCase(),
        spend: num(row['cost']),
        leads,
        conversions: leads,
      };
    },
  },
  AW: {
    fields: ['CampaignID', 'Campaignname', 'Campaignstatus', 'Cost', 'Conversions'],
    parse: (row) => {
      const conversions = num(row['Conversions']);
      return {
        campaign_id: String(row['CampaignID'] ?? ''),
        campaign_name: String(row['Campaignname'] ?? ''),
        status: String(row['Campaignstatus'] ?? 'ENABLED').toUpperCase(),
        spend: num(row['Cost']),
        leads: conversions,
        conversions,
      };
    },
  },
};

export function dsSpec(dsId: string): DsFieldSpec | null {
  return DS_SPECS[dsId] ?? null;
}

export async function smFetchCampaigns(
  apiKey: string,
  dsId: string,
  accountIds: string[],
  dateRangeType = 'this_month'
): Promise<SMRawCampaign[]> {
  const spec = DS_SPECS[dsId];
  if (!spec) throw new Error(`Unsupported ds_id: ${dsId}`);

  const body = {
    ds_id: dsId,
    ds_accounts: accountIds,
    date_range_type: dateRangeType,
    fields: spec.fields,
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

export function parseCampaignRow(row: SMRawCampaign, dsId: string): ParsedCampaign {
  const spec = DS_SPECS[dsId];
  if (!spec) {
    return {
      campaign_id: '',
      campaign_name: '',
      status: 'ENABLED',
      spend: 0,
      leads: 0,
      conversions: 0,
    };
  }
  return spec.parse(row);
}
