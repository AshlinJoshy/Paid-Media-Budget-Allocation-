-- Add metrics columns to paid_assignments and cached_campaigns.
-- qualified_leads is populated by the daily Engage workflow (matched via UTMs).
-- impressions / clicks are populated by the Supermetrics sync.

alter table paid_assignments
  add column if not exists impressions integer default 0,
  add column if not exists clicks integer default 0,
  add column if not exists qualified_leads integer default 0;

alter table cached_campaigns
  add column if not exists impressions integer default 0,
  add column if not exists clicks integer default 0;

-- Seed the new "type" dropdown field and "off" status option used for color cues.
insert into dropdown_options (field, value) values
  ('type', 'Lead Gen'),
  ('type', 'Awareness'),
  ('type', 'Traffic'),
  ('type', 'Conversions'),
  ('type', 'Engagement'),
  ('type', 'Retargeting'),
  ('status', 'Off')
on conflict (field, value) do nothing;
