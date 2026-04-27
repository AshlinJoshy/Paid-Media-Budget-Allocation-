import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/supermetrics/debug — calls /query/accounts and returns the raw response
export async function GET() {
  const { data: keyRow } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'supermetrics_api_key')
    .single();

  if (!keyRow?.value) {
    return NextResponse.json({ error: 'No API key saved yet.' }, { status: 400 });
  }

  const apiKey = keyRow.value;
  const url = `https://api.supermetrics.com/enterprise/v2/query/accounts?api_key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* keep raw */ }

    return NextResponse.json({
      endpoint: '/enterprise/v2/query/accounts',
      status: res.status,
      ok: res.ok,
      raw_response: parsed,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
