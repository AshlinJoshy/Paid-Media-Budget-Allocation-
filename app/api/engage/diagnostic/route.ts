import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { metabaseQuery, MetabaseError, getAuthMode } from '@/lib/metabase';

// GET /api/engage/diagnostic
// Step-by-step health check. Hit this URL in a browser to see exactly which
// piece of the integration is broken. Never exposes secret values.

export async function GET() {
  const started = Date.now();
  const checks: Array<{ step: string; ok: boolean; detail?: string; ms?: number }> = [];

  function record(step: string, ok: boolean, detail?: string, t0?: number) {
    checks.push({ step, ok, detail, ms: t0 ? Date.now() - t0 : undefined });
  }

  // Helper: get detailed error info from a failed fetch (DNS, TLS, etc.).
  function describeFetchError(e: unknown): string {
    const err = e as { message?: string; cause?: { message?: string; code?: string; errno?: string; syscall?: string; hostname?: string } } | undefined;
    if (!err) return String(e);
    const top = err.message ?? '';
    const cause = err.cause ?? {};
    const parts = [
      top,
      cause.code ? `code=${cause.code}` : '',
      cause.errno ? `errno=${cause.errno}` : '',
      cause.syscall ? `syscall=${cause.syscall}` : '',
      cause.hostname ? `host=${cause.hostname}` : '',
      cause.message && cause.message !== top ? `cause=${cause.message}` : '',
    ].filter(Boolean);
    return parts.join(' ');
  }

  // 1. Env vars present?
  const baseRequired = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'METABASE_BASE_URL', 'METABASE_DATABASE_ID'];
  const hasApiKey = !!process.env.METABASE_API_KEY;
  const hasUserPass = !!(process.env.METABASE_USERNAME && process.env.METABASE_PASSWORD);
  const missingBase = baseRequired.filter((k) => !process.env[k]);
  const authOk = hasApiKey || hasUserPass;
  const missing = [...missingBase, ...(authOk ? [] : ['METABASE_API_KEY or (METABASE_USERNAME + METABASE_PASSWORD)'])];
  const usernameEcho = process.env.METABASE_USERNAME
    ? maskEmail(process.env.METABASE_USERNAME.trim())
    : '(not set)';
  const apiKeyEcho = process.env.METABASE_API_KEY
    ? `${process.env.METABASE_API_KEY.trim().slice(0, 6)}…${process.env.METABASE_API_KEY.trim().slice(-4)}`
    : '(not set)';
  // Flag whitespace contamination in env values — common copy-paste bug.
  const whitespaceWarnings: string[] = [];
  for (const k of ['METABASE_BASE_URL', 'METABASE_USERNAME', 'METABASE_PASSWORD', 'METABASE_API_KEY', 'METABASE_DATABASE_ID']) {
    const raw = process.env[k];
    if (raw && raw !== raw.trim()) {
      whitespaceWarnings.push(k);
    }
  }
  const envDetail = missing.length
    ? `missing: ${missing.join(', ')}`
    : `auth_mode=${getAuthMode()}, username=${usernameEcho}, api_key=${apiKeyEcho}` +
      (whitespaceWarnings.length ? ` ⚠ whitespace in: ${whitespaceWarnings.join(', ')}` : '');
  record('env_vars_present', missing.length === 0 && whitespaceWarnings.length === 0, envDetail);

  // 1b. METABASE_BASE_URL is parseable?
  let normalizedBase = '';
  if (process.env.METABASE_BASE_URL) {
    try {
      normalizedBase = process.env.METABASE_BASE_URL.trim().replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(normalizedBase)) normalizedBase = 'https://' + normalizedBase;
      new URL(normalizedBase);
      record('metabase_base_url_parseable', true, `resolved → ${normalizedBase}`);
    } catch (e) {
      record('metabase_base_url_parseable', false, e instanceof Error ? e.message : String(e));
    }
  }

  // 1c. METABASE_DATABASE_ID is numeric?
  if (process.env.METABASE_DATABASE_ID) {
    const n = parseInt(process.env.METABASE_DATABASE_ID.trim(), 10);
    record('metabase_database_id_numeric', !!n, `value="${process.env.METABASE_DATABASE_ID}" → ${n || 'NaN'}`);
  }

  // 1e. Control probe — can Vercel reach the public internet at all?
  // If this fails too, it's not a Metabase-specific issue.
  {
    const t0 = Date.now();
    try {
      const r = await fetch('https://example.com', { cache: 'no-store' });
      record('control_internet_probe', r.ok, `HTTP ${r.status}`, t0);
    } catch (e) {
      record('control_internet_probe', false, describeFetchError(e), t0);
    }
  }

  // 1f. DNS resolution probe — separates "host doesn't exist" from "host blocks me".
  if (normalizedBase) {
    const t0 = Date.now();
    try {
      const u = new URL(normalizedBase);
      // node:dns/promises is built-in to Node 18+.
      const dns = await import('node:dns/promises');
      const addresses = await dns.lookup(u.hostname, { all: true });
      const list = addresses.slice(0, 3).map((a) => `${a.address} (v${a.family})`).join(', ');
      record('metabase_dns_lookup', addresses.length > 0, `${u.hostname} → ${list}${addresses.length > 3 ? ` +${addresses.length - 3} more` : ''}`, t0);
    } catch (e) {
      record('metabase_dns_lookup', false, describeFetchError(e), t0);
    }
  }

  // 1g. Metabase /api/health probe (does the server respond at all?).
  if (normalizedBase) {
    const t0 = Date.now();
    try {
      const r = await fetch(`${normalizedBase}/api/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      const body = await r.text();
      record(
        'metabase_health_probe',
        r.ok,
        `HTTP ${r.status} body="${body.slice(0, 100).replace(/\s+/g, ' ')}"`,
        t0,
      );
    } catch (e) {
      record('metabase_health_probe', false, describeFetchError(e), t0);
    }
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

  // 3. Metabase login + query?
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
        : describeFetchError(e);
      record('metabase_login_and_query', false, detail, t0);
    }
  } else {
    record('metabase_login_and_query', false, 'skipped: env vars missing');
  }

  // 4. Engage leads table reachable?
  if (metabaseLoginOk) {
    const t0 = Date.now();
    try {
      const r = await metabaseQuery('SELECT COUNT(*) AS n FROM leads WHERE created_at >= CURDATE() - INTERVAL 7 DAY');
      const n = (r.rows?.[0]?.[0] as number) ?? 0;
      record('metabase_engage_leads_last_7d', true, `${n.toLocaleString()} leads in last 7 days`, t0);
    } catch (e) {
      const detail = e instanceof MetabaseError
        ? `stage=${e.stage} status=${e.status ?? '-'} msg=${e.message} upstream=${(e.upstream ?? '').slice(0, 200)}`
        : describeFetchError(e);
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
      : 'See first failing check. If control_internet_probe is OK but metabase_health_probe / dns fails, the host is likely IP-allowlisted — Vercel egress IPs are not on the allowlist.',
  }, { status: allOk ? 200 : 503 });
}

function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  if (!domain) return email.slice(0, 2) + '…';
  return `${user.slice(0, 2)}…@${domain}`;
}
