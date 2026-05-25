// Thin wrapper around Metabase's REST API with verbose logging.
// All [metabase] prefixed logs appear in Vercel → Deployments → Functions tab.
//
// Env required:
//   METABASE_BASE_URL      e.g. https://metabase.bhomes.com (scheme optional)
//   METABASE_USERNAME
//   METABASE_PASSWORD
//   METABASE_DATABASE_ID   numeric DB id in Metabase (visible in Admin > Databases URL)

interface SessionCache {
  token: string;
  fetchedAt: number;
}

const SESSION_TTL_MS = 13 * 24 * 60 * 60 * 1000;
let session: SessionCache | null = null;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function baseUrl(): string {
  let raw = env('METABASE_BASE_URL').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  return raw;
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
  console.log(`[metabase] login → POST ${url} (user=${username})`);
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
    throw new MetabaseError(
      `Metabase login failed (HTTP ${res.status}) at ${url}`,
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

async function getToken(): Promise<string> {
  if (session && Date.now() - session.fetchedAt < SESSION_TTL_MS) {
    console.log('[metabase] using cached session token');
    return session.token;
  }
  const token = await login();
  session = { token, fetchedAt: Date.now() };
  return token;
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
  console.log(`[metabase] query → POST ${url} (db=${databaseId}, sql="${sqlPreview}…")`);

  async function run(token: string) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Metabase-Session': token },
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
  let token = await getToken();
  let res: Response;
  try {
    res = await run(token);
  } catch (e) {
    console.error(`[metabase] query fetch threw: ${e instanceof Error ? e.message : String(e)}`);
    throw new MetabaseError(
      `Network error reaching Metabase at ${url}: ${e instanceof Error ? e.message : String(e)}`,
      'query',
    );
  }

  if (res.status === 401 || res.status === 403) {
    console.log(`[metabase] query got ${res.status}, retrying with fresh token`);
    session = null;
    token = await getToken();
    res = await run(token);
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
