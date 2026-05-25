// Thin wrapper around Metabase's REST API with verbose logging.
// All [metabase] prefixed logs appear in Vercel → Deployments → Functions tab.
//
// Auth: prefers METABASE_API_KEY (works with SSO accounts on Metabase Cloud).
// Falls back to METABASE_USERNAME + METABASE_PASSWORD via /api/session.
//
// Env required:
//   METABASE_BASE_URL      e.g. https://engage.metabaseapp.com (scheme optional)
//   METABASE_DATABASE_ID   numeric DB id (Admin → Databases → URL has /databases/N)
//
// Plus EITHER:
//   METABASE_API_KEY       starts with "mb_..." — Metabase Cloud → Account → API keys
// OR:
//   METABASE_USERNAME + METABASE_PASSWORD   only works if account has a real password

interface SessionCache {
  token: string;
  fetchedAt: number;
}

const SESSION_TTL_MS = 13 * 24 * 60 * 60 * 1000;
let session: SessionCache | null = null;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  // Trim leading/trailing whitespace (incl. tabs/newlines) — pasted values in
  // Vercel often pick up stray whitespace that breaks downstream calls.
  return v.trim();
}

function baseUrl(): string {
  let raw = env('METABASE_BASE_URL').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  return raw;
}

export type AuthMode = 'api_key' | 'session';
export function getAuthMode(): AuthMode {
  return process.env.METABASE_API_KEY ? 'api_key' : 'session';
}

export class MetabaseError extends Error {
  status?: number;
  upstream?: string;
  stage: 'login' | 'query' | 'sql';
  constructor(message: string, stage: 'login' | 'query' | 'sql', status?: number, upstream?: string) {
    super(message);
    this.name = 'MetabaseError';
    this.stage = stage;
    this.status = status;
    this.upstream = upstream;
  }
}

async function login(): Promise<string> {
  const url = `${baseUrl()}/api/session`;
  const username = env('METABASE_USERNAME');
  console.log(`[metabase] session login → POST ${url} (user=${username})`);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: env('METABASE_PASSWORD') }),
      cache: 'no-store',
    });
  } catch (e) {
    console.error(`[metabase] login fetch threw: ${e instanceof Error ? e.message : String(e)}`);
    throw new MetabaseError(
      `Network error reaching Metabase at ${url}: ${e instanceof Error ? e.message : String(e)}`,
      'login',
    );
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`[metabase] login failed status=${res.status} body=${body.slice(0, 500)}`);
    const hint = res.status === 401
      ? ' — HTTP 401 usually means the account uses SSO (Google/SAML/Okta). Set METABASE_API_KEY instead.'
      : '';
    throw new MetabaseError(
      `Metabase login failed (HTTP ${res.status}) at ${url}${hint}`,
      'login',
      res.status,
      body.slice(0, 500),
    );
  }
  const json = await res.json();
  if (!json?.id) {
    console.error(`[metabase] login: no session id in response: ${JSON.stringify(json).slice(0, 200)}`);
    throw new MetabaseError('Metabase login: no session id in response', 'login', res.status);
  }
  console.log(`[metabase] login OK (token ${json.id.slice(0, 6)}…)`);
  return json.id;
}

async function getSessionToken(): Promise<string> {
  if (session && Date.now() - session.fetchedAt < SESSION_TTL_MS) {
    console.log('[metabase] using cached session token');
    return session.token;
  }
  const token = await login();
  session = { token, fetchedAt: Date.now() };
  return token;
}

// Returns the headers needed to authenticate one request, picking auth mode
// based on which env vars are set. API key path skips the login round-trip.
async function authHeaders(): Promise<Record<string, string>> {
  if (process.env.METABASE_API_KEY) {
    return { 'X-API-KEY': process.env.METABASE_API_KEY };
  }
  return { 'X-Metabase-Session': await getSessionToken() };
}

export interface MetabaseDatasetResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
}

export async function metabaseQuery(sql: string, params: unknown[] = []): Promise<MetabaseDatasetResult> {
  const databaseIdRaw = env('METABASE_DATABASE_ID');
  const databaseId = parseInt(databaseIdRaw, 10);
  if (!databaseId) {
    throw new MetabaseError(
      `METABASE_DATABASE_ID must be a number (got "${databaseIdRaw}")`,
      'query',
    );
  }

  const url = `${baseUrl()}/api/dataset`;
  const sqlPreview = sql.replace(/\s+/g, ' ').trim().slice(0, 120);
  console.log(`[metabase] query (${getAuthMode()}) → POST ${url} (db=${databaseId}, sql="${sqlPreview}…")`);

  async function run() {
    const headers = await authHeaders();
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        database: databaseId,
        type: 'native',
        native: { query: sql, 'template-tags': {} },
        parameters: params,
      }),
      cache: 'no-store',
    });
  }

  const started = Date.now();
  let res: Response;
  try {
    res = await run();
  } catch (e) {
    // If the error is already a MetabaseError (e.g. login 401), rethrow it
    // unchanged — wrapping it would hide the real cause.
    if (e instanceof MetabaseError) throw e;
    console.error(`[metabase] query fetch threw: ${e instanceof Error ? e.message : String(e)}`);
    throw new MetabaseError(
      `Network error reaching Metabase at ${url}: ${e instanceof Error ? e.message : String(e)}`,
      'query',
    );
  }

  // Only session tokens can go stale; API keys don't expire on the request level.
  if ((res.status === 401 || res.status === 403) && getAuthMode() === 'session') {
    console.log(`[metabase] query got ${res.status}, retrying with fresh session token`);
    session = null;
    res = await run();
  }

  if (!res.ok) {
    const body = await res.text();
    console.error(`[metabase] query failed status=${res.status} body=${body.slice(0, 500)}`);
    throw new MetabaseError(
      `Metabase query failed (HTTP ${res.status})`,
      'query',
      res.status,
      body.slice(0, 500),
    );
  }

  const json = await res.json();
  if (json?.error) {
    const errStr = typeof json.error === 'string' ? json.error : JSON.stringify(json.error);
    console.error(`[metabase] SQL error: ${errStr.slice(0, 500)}`);
    throw new MetabaseError(`Metabase SQL error: ${errStr.slice(0, 500)}`, 'sql', undefined, errStr);
  }
  const cols = (json?.data?.cols ?? []).map((c: { name: string }) => c.name);
  const rows = json?.data?.rows ?? [];
  console.log(`[metabase] query OK in ${Date.now() - started}ms — ${rows.length} rows, ${cols.length} cols`);
  return { columns: cols, rows, rowCount: rows.length };
}

export async function metabaseQueryRows<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { columns, rows } = await metabaseQuery(sql, params);
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((c, i) => { obj[c] = row[i]; });
    return obj as T;
  });
}
