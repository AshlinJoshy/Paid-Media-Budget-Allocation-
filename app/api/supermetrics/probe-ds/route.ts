import { NextResponse } from 'next/server';
import { supabase, getSmApiKey } from '@/lib/supabase';

// Probe a list of candidate Google Ads ds_ids to find which one is licensed.
// Visit /api/supermetrics/probe-ds to run it.
const GOOGLE_ADS_CANDIDATES = [
  'AW',       // Classic AdWords
  'GAW',      // variant seen in some Supermetrics docs
  'google_ads',
  'GOOGLE_ADS',
  'GoogleAds',
  'adwords',
  'ADWORDS',
  'GAD',
  'DV360',    // Display & Video 360 (different product but checking)
  'SA360',    // Search Ads 360
];

export async function GET() {
  const apiKey = await getSmApiKey();
  if (!apiKey) return NextResponse.json({ error: 'No API key saved.' }, { status: 400 });

  // Use the first Google Ads account we have stored
  const { data: googleAcc } = await supabase
    .from('supermetrics_accounts')
    .select('account_id, account_name')
    .eq('ds_id', 'AW')
    .limit(1)
    .single();

  const accountId = googleAcc?.account_id ?? '5063000241';

  const results: Record<string, { status: number; error?: string; rows?: number }> = {};

  for (const dsId of GOOGLE_ADS_CANDIDATES) {
    const body = {
      api_key: apiKey,
      ds_id: dsId,
      ds_accounts: [accountId],
      date_range_type: 'this_month',
      fields: ['campaign_id', 'campaign_name', 'campaign_status', 'cost'],
      max_rows: 3,
    };

    try {
      const res = await fetch('https://api.supermetrics.com/enterprise/v2/query/data/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      });
      const json = await res.json() as Record<string, unknown>;
      if (res.ok && Array.isArray(json.data)) {
        results[dsId] = { status: res.status, rows: (json.data as unknown[]).length };
      } else {
        const err = (json.error as Record<string, string> | undefined);
        results[dsId] = { status: res.status, error: err?.code ?? JSON.stringify(json).slice(0, 120) };
      }
    } catch (e) {
      results[dsId] = { status: 0, error: String(e) };
    }
  }

  const working = Object.entries(results).filter(([, v]) => !v.error).map(([k]) => k);

  return NextResponse.json({
    account_tested: googleAcc?.account_name ?? accountId,
    working_ds_ids: working,
    all_results: results,
  });
}
