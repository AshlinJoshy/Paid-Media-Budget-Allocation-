import { NextResponse } from 'next/server';
import { supabase, getSmApiKey } from '@/lib/supabase';

export async function GET() {
  const apiKey = await getSmApiKey();
  if (!apiKey) return NextResponse.json({ error: 'No API key saved.' }, { status: 400 });

  // Get first selected Meta (FA) account — that's the licensed platform
  const { data: selected } = await supabase
    .from('supermetrics_accounts')
    .select('ds_id, account_id, account_name, ds_name')
    .eq('is_selected', true)
    .eq('ds_id', 'FA')
    .limit(1)
    .single();

  if (!selected) {
    // Fall back to any Meta account (selected or not)
    const { data: anyMeta } = await supabase
      .from('supermetrics_accounts')
      .select('ds_id, account_id, account_name, ds_name')
      .eq('ds_id', 'FA')
      .limit(1)
      .single();
    if (!anyMeta) return NextResponse.json({ error: 'No Meta Ads accounts in DB. Run Fetch Accounts first.' }, { status: 400 });
    return NextResponse.json({ error: 'No Meta Ads accounts selected. Go to Settings → Ad Accounts and check some Meta Ads accounts.', hint: `Unselected example: ${anyMeta.account_name} (${anyMeta.account_id})` }, { status: 400 });
  }

  const fields = selected.ds_id === 'FA'
    ? ['campaign_id', 'campaign_name', 'campaign_status', 'spend', 'leads', 'website_leads']
    : ['campaign_id', 'campaign_name', 'campaign_status', 'cost', 'conversions'];

  const body = {
    api_key: apiKey,
    ds_id: selected.ds_id,
    ds_accounts: [selected.account_id],
    date_range_type: 'this_month',
    fields,
    max_rows: 10,
  };

  try {
    const res = await fetch('https://api.supermetrics.com/enterprise/v2/query/data/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const text = await res.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* keep raw */ }

    return NextResponse.json({
      account_used: { ds_id: selected.ds_id, ds_name: selected.ds_name, account_id: selected.account_id, account_name: selected.account_name },
      request_body: { ...body, api_key: `${body.api_key.slice(0, 4)}…${body.api_key.slice(-4)}` },
      status: res.status,
      ok: res.ok,
      raw_response: parsed,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
