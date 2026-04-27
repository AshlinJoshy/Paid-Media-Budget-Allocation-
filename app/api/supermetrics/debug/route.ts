import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/supermetrics/debug?ds_id=FA
// Returns the raw Supermetrics API response so you can see what's coming back.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dsId = searchParams.get('ds_id') ?? 'FA';

  const { data: keyRow } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'supermetrics_api_key')
    .single();

  if (!keyRow?.value) {
    return NextResponse.json({ error: 'No API key saved yet.' }, { status: 400 });
  }

  const BASE = 'https://api.supermetrics.com/enterprise/v2';
  const url = `${BASE}/meta/profiles?api_key=${encodeURIComponent(keyRow.value)}&ds_id=${encodeURIComponent(dsId)}`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* keep raw text */ }

    return NextResponse.json({
      ds_id: dsId,
      status: res.status,
      ok: res.ok,
      url_called: url.replace(keyRow.value, '***'),
      raw_response: parsed,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
