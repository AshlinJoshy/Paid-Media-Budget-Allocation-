import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'budget.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS paid_assignments (
      id TEXT PRIMARY KEY,
      marketing_campaign_id TEXT NOT NULL
        REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
      supermetrics_campaign_id TEXT,
      paid_campaign_name TEXT DEFAULT '',
      type TEXT DEFAULT '',
      source TEXT DEFAULT '',
      platform TEXT DEFAULT '',
      start_month TEXT DEFAULT '',
      start_date TEXT DEFAULT '',
      status TEXT DEFAULT 'Live',
      campaign_status TEXT DEFAULT '',
      budget_allocation REAL DEFAULT 0,
      budget_spent REAL DEFAULT 0,
      leads INTEGER DEFAULT 0,
      last_synced TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dropdown_options (
      id TEXT PRIMARY KEY,
      field TEXT NOT NULL,
      value TEXT NOT NULL,
      UNIQUE(field, value)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS supermetrics_accounts (
      id TEXT PRIMARY KEY,
      ds_id TEXT NOT NULL,
      ds_name TEXT NOT NULL,
      account_id TEXT NOT NULL,
      account_name TEXT NOT NULL,
      is_selected INTEGER DEFAULT 0,
      UNIQUE(ds_id, account_id)
    );

    CREATE TABLE IF NOT EXISTS cached_campaigns (
      id TEXT PRIMARY KEY,
      ds_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      campaign_name TEXT NOT NULL,
      status TEXT DEFAULT 'ENABLED',
      platform TEXT NOT NULL,
      spend REAL DEFAULT 0,
      leads INTEGER DEFAULT 0,
      conversions INTEGER DEFAULT 0,
      last_updated TEXT DEFAULT (datetime('now')),
      UNIQUE(ds_id, account_id, campaign_id)
    );
  `);

  const ins = db.prepare(`
    INSERT OR IGNORE INTO dropdown_options (id, field, value)
    VALUES (lower(hex(randomblob(16))), ?, ?)
  `);

  const defaults: [string, string][] = [
    ['entity', 'OFF-Ex'], ['entity', 'OFF-In'], ['entity', 'ON'],
    ['status', 'Live'], ['status', 'Paused'], ['status', 'Completed'], ['status', 'Planned'],
    ['source', 'Meta'], ['source', 'Google Search'], ['source', 'Google Display'],
    ['source', 'Google PMax'], ['source', 'LinkedIn'], ['source', 'TikTok'], ['source', 'Snapchat'],
    ['start_month', 'January'], ['start_month', 'February'], ['start_month', 'March'],
    ['start_month', 'April'], ['start_month', 'May'], ['start_month', 'June'],
    ['start_month', 'July'], ['start_month', 'August'], ['start_month', 'September'],
    ['start_month', 'October'], ['start_month', 'November'], ['start_month', 'December'],
  ];

  for (const [field, value] of defaults) ins.run(field, value);
}
