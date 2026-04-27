import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { getPlatformFromSource } from '@/types';

export async function POST(req: Request) {
  const db = getDb();
  const body = await req.json();
  const id = uuidv4();

  const platform = body.platform || getPlatformFromSource(body.source ?? '');

  db.prepare(`
    INSERT INTO paid_assignments (
      id, marketing_campaign_id, supermetrics_campaign_id, paid_campaign_name,
      type, source, platform, start_month, start_date, status, campaign_status,
      budget_allocation, budget_spent, leads
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    body.marketing_campaign_id,
    body.supermetrics_campaign_id ?? null,
    body.paid_campaign_name ?? '',
    body.type ?? '',
    body.source ?? '',
    platform,
    body.start_month ?? '',
    body.start_date ?? '',
    body.status ?? 'Live',
    body.campaign_status ?? '',
    body.budget_allocation ?? 0,
    body.budget_spent ?? 0,
    body.leads ?? 0,
  );

  const row = db.prepare(`SELECT * FROM paid_assignments WHERE id = ?`).get(id) as Record<string, unknown>;
  return NextResponse.json({
    ...row,
    remaining: (row.budget_allocation as number) - (row.budget_spent as number),
    cpl: (row.leads as number) > 0
      ? Math.round(((row.budget_spent as number) / (row.leads as number)) * 100) / 100
      : 0,
  }, { status: 201 });
}
