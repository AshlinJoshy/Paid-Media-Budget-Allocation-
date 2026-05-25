import { NextResponse } from 'next/server';
import { metabaseQuery } from '@/lib/metabase';
import { buildLeadsAnalyticsSql } from '@/lib/engage-sql';

// GET /api/engage/leads?since=YYYY-MM-DD
//
// Live pull of the analytical lead set from Engage via Metabase.
// Returns { columns, rows } so the client can do its own aggregations.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sinceParam = searchParams.get('since') ?? '';
  const since = /^\d{4}-\d{2}-\d{2}$/.test(sinceParam) ? sinceParam : defaultSince();

  try {
    const result = await metabaseQuery(buildLeadsAnalyticsSql(since));
    return NextResponse.json({
      since,
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

function defaultSince(): string {
  // Default: start of current year. Leads volume at ~5K/mo is fine to ship.
  const now = new Date();
  return `${now.getUTCFullYear()}-01-01`;
}
