import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/supermetrics/debug
// Probes the data-source-logins endpoint and returns the raw response.
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
  const BASE = 'https://api.supermetrics.com/enterprise/v2';
  const url = `${BASE}/data-source-logins?api_key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });
    const text = await res.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* keep raw */ }

    return NextResponse.json({
      endpoint: url.replace(apiKey, '***'),
      status: res.status,
      ok: res.ok,
      raw_response: parsed,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
