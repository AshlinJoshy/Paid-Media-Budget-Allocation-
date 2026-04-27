import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const db = getDb();
  const campaigns = db.prepare(`SELECT * FROM marketing_campaigns ORDER BY created_at ASC`).all();
  const assignments = db.prepare(`SELECT * FROM paid_assignments ORDER BY created_at ASC`).all();

  type CRow = Record<string, unknown>;
  const result = (campaigns as CRow[]).map((c) => ({
    ...c,
    assignments: (assignments as CRow[])
      .filter((a) => a.marketing_campaign_id === c.id)
      .map((a) => ({
        ...a,
        remaining: (a.budget_allocation as number) - (a.budget_spent as number),
        cpl: (a.leads as number) > 0
          ? Math.round(((a.budget_spent as number) / (a.leads as number)) * 100) / 100
          : 0,
      })),
  }));

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const db = getDb();
  const body = await req.json();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO marketing_campaigns (id, entity, name)
    VALUES (?, ?, ?)
  `).run(id, body.entity ?? '', body.name ?? '');
  const campaign = db.prepare(`SELECT * FROM marketing_campaigns WHERE id = ?`).get(id);
  return NextResponse.json({ ...(campaign as object), assignments: [] }, { status: 201 });
}
