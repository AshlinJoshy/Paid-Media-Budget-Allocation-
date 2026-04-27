import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase.from('settings').select('key, value');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const settings: Record<string, string> = {};
  for (const row of data ?? []) settings[row.key] = row.value;

  const hasKey = !!settings['supermetrics_api_key'];
  delete settings['supermetrics_api_key'];
  return NextResponse.json({ ...settings, has_api_key: String(hasKey) });
}

export async function POST(req: Request) {
  const body = await req.json() as Record<string, string>;
  // Strip non-ASCII chars from API key so it's always safe in HTTP headers/URLs
  if (body.supermetrics_api_key) {
    body.supermetrics_api_key = body.supermetrics_api_key
      .replace(/[^\x00-\x7F]/g, '')  // remove non-ASCII
      .trim();
  }
  const rows = Object.entries(body).map(([key, value]) => ({ key, value }));

  const { error } = await supabase
    .from('settings')
    .upsert(rows, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
