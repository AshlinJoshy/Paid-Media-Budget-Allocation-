import { NextResponse } from 'next/server';
import { getSmApiKey } from '@/lib/supabase';

export async function GET() {
  const apiKey = await getSmApiKey();

  if (!apiKey) {
    return NextResponse.json({ error: 'No API key saved yet.' }, { status: 400 });
  }

  const url = `https://api.supermetrics.com/enterprise/v2/query/accounts?api_key=${encodeURIComponent(apiKey)}&ds_id=FA`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* keep raw */ }

    return NextResponse.json({
      endpoint: '/enterprise/v2/query/accounts',
      key_length: apiKey.length,
      key_preview: `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`,
      status: res.status,
      ok: res.ok,
      raw_response: parsed,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
