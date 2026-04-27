import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { smFetchAccounts } from '@/lib/supermetrics';
import { DS_NAMES } from '@/types';

export async function GET() {
  const { data, error } = await supabase
    .from('supermetrics_accounts')
    .select('*')
    .order('ds_name')
    .order('account_name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST() {
  const { data: keyRow } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'supermetrics_api_key')
    .single();

  if (!keyRow?.value) {
    return NextResponse.json(
      { error: 'No API key configured. Please add it in Settings.' },
      { status: 400 }
    );
  }

  const apiKey = keyRow.value;
  const errors: string[] = [];
  const perPlatform: Record<string, number> = {};
  let totalFetched = 0;

  for (const dsId of Object.keys(DS_NAMES)) {
    try {
      const { accounts } = await smFetchAccounts(apiKey, dsId);
      const dsName = DS_NAMES[dsId];
      perPlatform[dsName] = accounts.length;

      for (const acc of accounts) {
        await supabase.from('supermetrics_accounts').upsert(
          { ds_id: dsId, ds_name: dsName, account_id: acc.id, account_name: acc.name },
          { onConflict: 'ds_id,account_id', ignoreDuplicates: false }
        );
        totalFetched++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Only skip true 404s (platform genuinely not available on this key)
      if (msg.includes('HTTP 404')) {
        perPlatform[DS_NAMES[dsId]] = 0;
      } else {
        errors.push(`${DS_NAMES[dsId]}: ${msg}`);
      }
    }
  }

  const { data: accounts } = await supabase
    .from('supermetrics_accounts')
    .select('*')
    .order('ds_name')
    .order('account_name');

  return NextResponse.json({
    accounts: accounts ?? [],
    fetched: totalFetched,
    per_platform: perPlatform,
    errors: errors.length ? errors : undefined,
  });
}

export async function PATCH(req: Request) {
  const { id, is_selected } = await req.json();
  const { error } = await supabase
    .from('supermetrics_accounts')
    .update({ is_selected: !!is_selected })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
