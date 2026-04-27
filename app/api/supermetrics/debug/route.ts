import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Probes every plausible Supermetrics v2 endpoint path and returns all results.
// Open this in your browser to see which one returns 200.
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
  const headers = { Authorization: `Bearer ${apiKey}` };

  const candidates = [
    `${BASE}/ds-accounts`,
    `${BASE}/ds-logins`,
    `${BASE}/accounts`,
    `${BASE}/logins`,
    `${BASE}/datasources`,
    `${BASE}/data-sources`,
    `${BASE}/connectors`,
    `${BASE}/connections`,
    `${BASE}/profiles`,
    `${BASE}/me`,
    `${BASE}/user`,
  ];

  const results = await Promise.all(
    candidates.map(async (url) => {
      try {
        const res = await fetch(`${url}?api_key=${encodeURIComponent(apiKey)}`, {
          headers,
          cache: 'no-store',
        });
        const text = await res.text();
        let parsed: unknown = text;
        try { parsed = JSON.parse(text); } catch { /* keep raw */ }
        return { url: url.replace(BASE, '/enterprise/v2'), status: res.status, ok: res.ok, response: parsed };
      } catch (e) {
        return { url: url.replace(BASE, '/enterprise/v2'), status: 0, ok: false, response: String(e) };
      }
    })
  );

  return NextResponse.json({
    note: 'Find the entry with ok:true — that is the correct endpoint',
    results,
  });
}
