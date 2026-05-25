import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { metabaseQueryRows, MetabaseError } from '@/lib/metabase';
import { buildQualifiedRollupSql } from '@/lib/engage-sql';

// Refresh paid_assignments.qualified_leads from Engage.
//
// Vercel cron hits this as GET with `Authorization: Bearer ${CRON_SECRET}`.
// The dashboard "Sync Engage" button hits this as POST (browser-origin, no
// secret) and is gated by Supabase RLS / app auth in your deployment.

async function run(req: Request, sinceFromBody?: string) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const isCronCall = cronSecret && authHeader === `Bearer ${cronSecret}`;

  // If CRON_SECRET is set we require it for GET (cron) calls. POST calls from
  // the browser-side button are allowed through without it.
  if (req.method === 'GET' && cronSecret && !isCronCall) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const since = sinceFromBody && /^\d{4}-\d{2}-\d{2}$/.test(sinceFromBody)
    ? sinceFromBody
    : defaultSince();

  console.log(`[qualify-rollup] start since=${since}`);
  let rollup: { campaign_code: string; qualified_leads: number }[];
  try {
    rollup = await metabaseQueryRows<{ campaign_code: string; qualified_leads: number }>(
      buildQualifiedRollupSql(since),
    );
    console.log(`[qualify-rollup] metabase returned ${rollup.length} campaigns`);
  } catch (err) {
    console.error(`[qualify-rollup] metabase failed: ${err instanceof Error ? err.message : String(err)}`);
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

  const byName = new Map<string, number>();
  for (const r of rollup) {
    const key = (r.campaign_code ?? '').toString().trim().toLowerCase();
    if (!key) continue;
    byName.set(key, Number(r.qualified_leads) || 0);
  }

  const { data: assignments, error } = await supabase
    .from('paid_assignments')
    .select('id, paid_campaign_name')
    .not('paid_campaign_name', 'is', null)
    .neq('paid_campaign_name', '');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0;
  let matched = 0;
  const nowIso = new Date().toISOString();
  for (const a of assignments ?? []) {
    const key = (a.paid_campaign_name ?? '').trim().toLowerCase();
    const count = byName.get(key) ?? 0;
    if (count > 0) matched++;
    const { error: updErr } = await supabase
      .from('paid_assignments')
      .update({ qualified_leads: count, updated_at: nowIso })
      .eq('id', a.id);
    if (!updErr) updated++;
  }

  return NextResponse.json({
    success: true,
    since,
    campaign_codes_in_engage: byName.size,
    assignments_scanned: assignments?.length ?? 0,
    matched,
    updated,
  });
}

function defaultSince(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-01-01`;
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  let since: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.since === 'string') since = body.since;
  } catch {
    // ignore
  }
  return run(req, since);
}
