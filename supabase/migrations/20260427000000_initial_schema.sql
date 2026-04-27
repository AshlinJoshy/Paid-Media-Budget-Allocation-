-- Paid Media Budget Tracker — initial schema
-- Run this in your Supabase SQL Editor or via: supabase db push

create table if not exists marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  entity text not null default '',
  name text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists paid_assignments (
  id uuid primary key default gen_random_uuid(),
  marketing_campaign_id uuid not null references marketing_campaigns(id) on delete cascade,
  supermetrics_campaign_id text,
  paid_campaign_name text default '',
  type text default '',
  source text default '',
  platform text default '',
  start_month text default '',
  start_date text default '',
  status text default 'Live',
  campaign_status text default '',
  budget_allocation numeric default 0,
  budget_spent numeric default 0,
  leads integer default 0,
  last_synced timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists dropdown_options (
  id uuid primary key default gen_random_uuid(),
  field text not null,
  value text not null,
  unique (field, value)
);

create table if not exists settings (
  key text primary key,
  value text not null default ''
);

create table if not exists supermetrics_accounts (
  id uuid primary key default gen_random_uuid(),
  ds_id text not null,
  ds_name text not null,
  account_id text not null,
  account_name text not null,
  is_selected boolean default false,
  unique (ds_id, account_id)
);

create table if not exists cached_campaigns (
  id uuid primary key default gen_random_uuid(),
  ds_id text not null,
  account_id text not null,
  campaign_id text not null,
  campaign_name text not null,
  status text default 'ENABLED',
  platform text not null,
  spend numeric default 0,
  leads integer default 0,
  conversions integer default 0,
  last_updated timestamptz default now(),
  unique (ds_id, account_id, campaign_id)
);

-- Disable RLS for now (enable + add policies when you add auth)
alter table marketing_campaigns disable row level security;
alter table paid_assignments disable row level security;
alter table dropdown_options disable row level security;
alter table settings disable row level security;
alter table supermetrics_accounts disable row level security;
alter table cached_campaigns disable row level security;

-- Seed default dropdown options
insert into dropdown_options (field, value) values
  ('entity', 'OFF-Ex'),
  ('entity', 'OFF-In'),
  ('entity', 'ON'),
  ('status', 'Live'),
  ('status', 'Paused'),
  ('status', 'Completed'),
  ('status', 'Planned'),
  ('source', 'Meta'),
  ('source', 'Google Search'),
  ('source', 'Google Display'),
  ('source', 'Google PMax'),
  ('source', 'LinkedIn'),
  ('source', 'TikTok'),
  ('source', 'Snapchat'),
  ('start_month', 'January'),
  ('start_month', 'February'),
  ('start_month', 'March'),
  ('start_month', 'April'),
  ('start_month', 'May'),
  ('start_month', 'June'),
  ('start_month', 'July'),
  ('start_month', 'August'),
  ('start_month', 'September'),
  ('start_month', 'October'),
  ('start_month', 'November'),
  ('start_month', 'December')
on conflict (field, value) do nothing;
