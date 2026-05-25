// Thin wrapper around Metabase's REST API.
// Auth: POST /api/session -> session token; cached for 13 days.
// Query: POST /api/dataset with native SQL (h2/postgres/mysql all use the same endpoint).
//
// Env required:
//   METABASE_BASE_URL      e.g. https://metabase.bhomes.com
//   METABASE_USERNAME
//   METABASE_PASSWORD
//   METABASE_DATABASE_ID   numeric DB id in Metabase (visible in Admin > Databases URL)

interface SessionCache {
  token: string;
  fetchedAt: number;
}

const SESSION_TTL_MS = 13 * 24 * 60 * 60 * 1000; // Metabase tokens live ~14 days; refresh 1 day early.
let session: SessionCache | null = null;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function login(): Promise<string> {
  const res = await fetch(`${env('METABASE_BASE_URL')}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: env('METABASE_USERNAME'),
      password: env('METABASE_PASSWORD'),
    }),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Metabase login failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  if (!json?.id) throw new Error('Metabase login: no session id in response');
  return json.id;
}

async function getToken(): Promise<string> {
  if (session && Date.now() - session.fetchedAt < SESSION_TTL_MS) return session.token;
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
  const databaseId = parseInt(env('METABASE_DATABASE_ID'), 10);
  if (!databaseId) throw new Error('METABASE_DATABASE_ID must be a number');

  async function run(token: string) {
    return fetch(`${env('METABASE_BASE_URL')}/api/dataset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Metabase-Session': token,
      },
      body: JSON.stringify({
        database: databaseId,
        type: 'native',
        native: { query: sql, 'template-tags': {} },
        parameters: params,
      }),
      cache: 'no-store',
    });
  }

  let token = await getToken();
  let res = await run(token);
  if (res.status === 401 || res.status === 403) {
    // Stale token -> force re-login once.
    session = null;
    token = await getToken();
    res = await run(token);
  }
  if (!res.ok) {
    throw new Error(`Metabase dataset error (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  const cols = (json?.data?.cols ?? []).map((c: { name: string }) => c.name);
  const rows = json?.data?.rows ?? [];
  if (json?.error) throw new Error(`Metabase SQL error: ${json.error}`);
  return { columns: cols, rows, rowCount: rows.length };
}

// Convenience: returns array of plain objects keyed by column name.
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
