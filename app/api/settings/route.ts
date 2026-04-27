import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;
  // Never return the API key to the client in plain text — just indicate if it's set
  const hasKey = !!settings['supermetrics_api_key'];
  delete settings['supermetrics_api_key'];
  return NextResponse.json({ ...settings, has_api_key: String(hasKey) });
}

export async function POST(req: Request) {
  const db = getDb();
  const body = await req.json() as Record<string, string>;
  const upsert = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  for (const [key, value] of Object.entries(body)) {
    upsert.run(key, value);
  }
  return NextResponse.json({ success: true });
}
