import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { metabaseQuery, MetabaseError } from '@/lib/metabase';

// GET /api/engage/diagnostic
// Step-by-step health check. Hit this URL in a browser to see exactly which
// piece of the integration is broken. Never exposes secret values.

export async function GET() {
  const started = Date.now();
  const checks: Array<{ step: string; ok: boolean; detail?: string; ms?: number }> = [];

  function record(step: string, ok: boolean, detail?: string, t0?: number) {
    checks.push({ step, ok, detail, ms: t0 ? Date.now() - t0 : undefined });
  }

  // 1. Env vars present?
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'METABASE_BASE_URL', 'METABASE_USERNAME', 'METABASE_PASSWORD', 'METABASE_DATABASE_ID'];
  const missing = required.filter((k) => !process.env[k]);
  record('env_vars_present', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : `all ${required.length} set`);

  // 1b. METABASE_BASE_URL is parseable?
  if (process.env.METABASE_BASE_URL) {
    try {
      let raw = process.env.METABASE_BASE_URL.trim().replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
      new URL(raw);
      record('metabase_base_url_parseable', true, `resolved → ${raw}`);
    } catch (e) {
      record('metabase_base_url_parseable', false, e instanceof Error ? e.message : String(e));
    }
  }

  // 1c. METABASE_DATABASE_ID is numeric?
  if (process.env.METABASE_DATABASE_ID) {
    const n = parseInt(process.env.METABASE_DATABASE_ID, 10);
    record('metabase_database_id_numeric', !!n, `value="${process.env.METABASE_DATABASE_ID}" → ${n || 'NaN'}`);
  }

  // 2. Supabase reachable?
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    const t0 = Date.now();
    try {
      const { error, count } = await supabase
        .from('paid_assignments')
        .select('id', { count: 'exact', head: true });
      if (error) record('supabase_query', false, error.message, t0);
      else record('supabase_query', true, `paid_assignments has ${count ?? 0} rows`, t0);
    } catch (e) {
      record('supabase_query', false, e instanceof Error ? e.message : String(e), t0);
    }
  }

  // 3. Metabase login?
  let metabaseLoginOk = false;
  if (missing.length === 0) {
    const t0 = Date.now();
    try {
      await metabaseQuery('SELECT 1 AS ok');
      record('metabase_login_and_query', true, 'SELECT 1 returned', t0);
      metabaseLoginOk = true;
    } catch (e) {
      const detail = e instanceof MetabaseError
        ? `stage=${e.stage} status=${e.status ?? '-'} msg=${e.message} upstream=${(e.upstream ?? '').slice(0, 200)}`
        : e instanceof Error ? e.message : String(e);
      record('metabase_login_and_query', false, detail, t0);
    }
  } else {
    record('metabase_login_and_query', false, 'skipped: env vars missing');
  }

  // 4. Engage leads table exists in Metabase?
  if (metabaseLoginOk) {
    const t0 = Date.now();
    try {
      const r = await metabaseQuery('SELECT COUNT(*) AS n FROM leads WHERE created_at >= CURDATE() - INTERVAL 7 DAY');
      const n = (r.rows?.[0]?.[0] as number) ?? 0;
      record('metabase_engage_leads_last_7d', true, `${n.toLocaleString()} leads in last 7 days`, t0);
    } catch (e) {
      const detail = e instanceof MetabaseError
        ? `stage=${e.stage} status=${e.status ?? '-'} msg=${e.message} upstream=${(e.upstream ?? '').slice(0, 200)}`
        : e instanceof Error ? e.message : String(e);
      record('metabase_engage_leads_last_7d', false, detail, t0);
    }
  }

  const allOk = checks.every((c) => c.ok);
  return NextResponse.json({
    ok: allOk,
    total_ms: Date.now() - started,
    checks,
    hint: allOk
      ? 'All systems go — try clicking "Sync Engage" on the budget table.'
      : 'See the first failing check above. Logs in Vercel → Deployments → Functions tab have more detail.',
  }, { status: allOk ? 200 : 503 });
}
