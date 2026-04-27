import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM dropdown_options ORDER BY field, value`).all() as {
    id: string; field: string; value: string;
  }[];

  const result: Record<string, string[]> = {};
  for (const row of rows) {
    if (!result[row.field]) result[row.field] = [];
    result[row.field].push(row.value);
  }
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const db = getDb();
  const { field, value } = await req.json();
  if (!field || !value) return NextResponse.json({ error: 'field and value required' }, { status: 400 });
  const id = uuidv4();
  try {
    db.prepare(`INSERT INTO dropdown_options (id, field, value) VALUES (?, ?, ?)`).run(id, field, value);
    return NextResponse.json({ id, field, value }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Already exists' }, { status: 409 });
  }
}

export async function DELETE(req: Request) {
  const db = getDb();
  const { field, value } = await req.json();
  db.prepare(`DELETE FROM dropdown_options WHERE field = ? AND value = ?`).run(field, value);
  return NextResponse.json({ success: true });
}
