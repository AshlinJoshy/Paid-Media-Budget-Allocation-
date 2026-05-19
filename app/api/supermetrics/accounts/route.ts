import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { smFetchLogins, smFetchLoginAccounts } from '@/lib/supermetrics';
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
  let totalFetched = 0;

  let logins;
  try {
    logins = await smFetchLogins(apiKey);
    console.log(`[SM accounts] Found ${logins.length} logins`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SM accounts] Failed to list logins: ${msg}`);
    return NextResponse.json({ error: `Failed to list logins: ${msg}` }, { status: 500 });
  }

  for (const login of logins) {
    const dsId = login.ds_id;
    const dsName = login.ds_name ?? DS_NAMES[dsId] ?? dsId;
    try {
      const accounts = await smFetchLoginAccounts(apiKey, login.id);
      console.log(`[SM accounts] login ${login.id} (${dsName}): ${accounts.length} accounts`);
      for (const acc of accounts) {
        const accountId = acc.account_id;
        const accountName = acc.name ?? acc.account_name ?? accountId;
        if (!accountId) continue;
        await supabase.from('supermetrics_accounts').upsert(
          { ds_id: dsId, ds_name: dsName, account_id: accountId, account_name: accountName },
          { onConflict: 'ds_id,account_id', ignoreDuplicates: false }
        );
        totalFetched++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[SM accounts] ${dsName} login ${login.id} failed: ${msg}`);
      errors.push(`${dsName} (${login.id}): ${msg}`);
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
    logins: logins.length,
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
