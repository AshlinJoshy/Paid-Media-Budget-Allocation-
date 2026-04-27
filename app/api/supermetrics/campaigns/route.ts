import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: Request) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q')?.toLowerCase() ?? '';
  const dsId = searchParams.get('ds_id') ?? '';

  let sql = `SELECT * FROM cached_campaigns`;
  const conditions: string[] = [];
  const args: string[] = [];

  if (query) {
    conditions.push(`LOWER(campaign_name) LIKE ?`);
    args.push(`%${query}%`);
  }
  if (dsId) {
    conditions.push(`ds_id = ?`);
    args.push(dsId);
  }
  if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
  sql += ` ORDER BY platform, campaign_name`;

  const campaigns = db.prepare(sql).all(...args);
  return NextResponse.json(campaigns);
}
