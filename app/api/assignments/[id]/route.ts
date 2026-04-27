import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getPlatformFromSource } from '@/types';

const ALLOWED = [
  'type', 'source', 'platform', 'start_month', 'start_date', 'status',
  'campaign_status', 'budget_allocation', 'budget_spent', 'leads',
  'supermetrics_campaign_id', 'paid_campaign_name',
];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();

  const fields = Object.keys(body).filter((k) => ALLOWED.includes(k));
  if (fields.length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 });

  // Auto-derive platform when source changes
  if (body.source && !body.platform) {
    body.platform = getPlatformFromSource(body.source);
    if (!fields.includes('platform')) fields.push('platform');
  }

  const sets = fields.map((f) => `${f} = ?`).join(', ');
  const values = fields.map((f) => body[f]);
  db.prepare(`UPDATE paid_assignments SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
    .run(...values, id);

  const row = db.prepare(`SELECT * FROM paid_assignments WHERE id = ?`).get(id) as Record<string, unknown>;
  return NextResponse.json({
    ...row,
    remaining: (row.budget_allocation as number) - (row.budget_spent as number),
    cpl: (row.leads as number) > 0
      ? Math.round(((row.budget_spent as number) / (row.leads as number)) * 100) / 100
      : 0,
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  db.prepare(`DELETE FROM paid_assignments WHERE id = ?`).run(id);
  return NextResponse.json({ success: true });
}
