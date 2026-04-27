import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { smFetchAccounts } from '@/lib/supermetrics';
import { DS_NAMES, DS_TO_PLATFORM } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const db = getDb();
  const accounts = db.prepare(`SELECT * FROM supermetrics_accounts ORDER BY ds_name, account_name`).all();
  return NextResponse.json(accounts);
}

// POST: Fetch fresh accounts from Supermetrics and save them
export async function POST() {
  const db = getDb();
  const apiKeyRow = db.prepare(`SELECT value FROM settings WHERE key = 'supermetrics_api_key'`).get() as { value: string } | undefined;
  if (!apiKeyRow?.value) {
    return NextResponse.json({ error: 'No API key configured. Please add it in Settings.' }, { status: 400 });
  }

  const apiKey = apiKeyRow.value;
  const dsIds = Object.keys(DS_NAMES);
  const errors: string[] = [];
  let totalFetched = 0;

  const upsert = db.prepare(`
    INSERT INTO supermetrics_accounts (id, ds_id, ds_name, account_id, account_name)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(ds_id, account_id) DO UPDATE SET
      account_name = excluded.account_name,
      ds_name = excluded.ds_name
  `);

  for (const dsId of dsIds) {
    try {
      const accounts = await smFetchAccounts(apiKey, dsId);
      const dsName = DS_NAMES[dsId] || dsId;
      for (const acc of accounts) {
        upsert.run(uuidv4(), dsId, dsName, acc.id, acc.name);
        totalFetched++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Only log if it's not just "no accounts for this platform"
      if (!msg.includes('404') && !msg.includes('not found')) {
        errors.push(`${DS_NAMES[dsId] || dsId}: ${msg}`);
      }
    }
  }

  const accounts = db.prepare(`SELECT * FROM supermetrics_accounts ORDER BY ds_name, account_name`).all();
  return NextResponse.json({
    accounts,
    fetched: totalFetched,
    errors: errors.length ? errors : undefined,
  });
}

// PATCH: Toggle account selection
export async function PATCH(req: Request) {
  const db = getDb();
  const { id, is_selected } = await req.json();
  db.prepare(`UPDATE supermetrics_accounts SET is_selected = ? WHERE id = ?`).run(is_selected ? 1 : 0, id);
  return NextResponse.json({ success: true });
}
