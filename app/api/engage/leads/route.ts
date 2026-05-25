import { NextResponse } from 'next/server';
import { metabaseQuery, MetabaseError } from '@/lib/metabase';
import { buildLeadsAnalyticsSql } from '@/lib/engage-sql';

// GET /api/engage/leads?since=YYYY-MM-DD
//
// Live pull of the analytical lead set from Engage via Metabase.
// Returns { columns, rows } so the client can do its own aggregations.

export const maxDuration = 60; // Vercel: extend serverless timeout (Pro tier; Hobby caps at 10s).

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sinceParam = searchParams.get('since') ?? '';
  const since = /^\d{4}-\d{2}-\d{2}$/.test(sinceParam) ? sinceParam : defaultSince();

  console.log(`[engage-leads] start since=${since}`);
  const t0 = Date.now();
  try {
    const result = await metabaseQuery(buildLeadsAnalyticsSql(since));
    console.log(`[engage-leads] done in ${Date.now() - t0}ms — ${result.rowCount} rows`);
    return NextResponse.json({
      since,
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
    });
  } catch (err) {
    console.error(`[engage-leads] failed after ${Date.now() - t0}ms: ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof MetabaseError) {
      return NextResponse.json({
        error: err.message,
        stage: err.stage,
        status: err.status,
        upstream: err.upstream,
        hint: 'Hit /api/engage/diagnostic for a step-by-step health check.',
      }, { status: 502 });
    }
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
      hint: 'Hit /api/engage/diagnostic for a step-by-step health check.',
    }, { status: 502 });
  }
}

function defaultSince(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-01-01`;
}
