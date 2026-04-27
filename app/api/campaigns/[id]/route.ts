import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();
  const fields = Object.keys(body).filter((k) => ['entity', 'name'].includes(k));
  if (fields.length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 });

  const sets = fields.map((f) => `${f} = ?`).join(', ');
  const values = fields.map((f) => body[f]);
  db.prepare(`UPDATE marketing_campaigns SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
    .run(...values, id);

  const updated = db.prepare(`SELECT * FROM marketing_campaigns WHERE id = ?`).get(id);
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  db.prepare(`DELETE FROM marketing_campaigns WHERE id = ?`).run(id);
  return NextResponse.json({ success: true });
}
