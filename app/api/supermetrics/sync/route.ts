import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { smFetchCampaigns } from '@/lib/supermetrics';
import { DS_TO_PLATFORM } from '@/types';

export async function POST(req: Request) {
  const { data: keyRow } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'supermetrics_api_key')
    .single();

  if (!keyRow?.value) {
    return NextResponse.json({ error: 'No API key configured.' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const dateRange = body.date_range ?? 'this_month';

  const { data: selectedAccounts } = await supabase
    .from('supermetrics_accounts')
    .select('ds_id, ds_name, account_id, account_name')
    .eq('is_selected', true);

  if (!selectedAccounts?.length) {
    return NextResponse.json(
      { error: 'No accounts selected. Please select accounts in Settings.' },
      { status: 400 }
    );
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  let totalCampaigns = 0;

  // One request per account so a single failure doesn't poison the rest, and
  // so error messages can name the offending account directly.
  for (const acc of selectedAccounts) {
    const label = `${acc.ds_name} — "${acc.account_name}"`;
    try {
      const rows = await smFetchCampaigns(keyRow.value, acc.ds_id, [acc.account_id], dateRange);
      const platform = DS_TO_PLATFORM[acc.ds_id] ?? 'unknown';

      let skipped = 0;
      for (const row of rows) {
        if (!row.campaign_id) {
          skipped++;
          continue;
        }

        await supabase.from('cached_campaigns').upsert(
          {
            ds_id: acc.ds_id,
            account_id: acc.account_id,
            campaign_id: row.campaign_id,
            campaign_name: row.campaign_name,
            status: row.status,
            platform,
            spend: row.spend,
            leads: row.leads,
            conversions: row.conversions,
            impressions: row.impressions,
            clicks: row.clicks,
            last_updated: new Date().toISOString(),
          },
          { onConflict: 'ds_id,account_id,campaign_id' }
        );
        totalCampaigns++;
      }

      if (skipped > 0) {
        warnings.push(`${label}: skipped ${skipped} row(s) with missing campaign_id`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${label}: ${msg} — likely an expired OAuth connection or a missing tracked field. Re-link this account in Supermetrics → Settings → Data sources.`);
    }
  }

  // Update linked assignment rows with fresh metrics
  const { data: linkedAssignments } = await supabase
    .from('paid_assignments')
    .select('id, supermetrics_campaign_id')
    .not('supermetrics_campaign_id', 'is', null)
    .neq('supermetrics_campaign_id', '');

  let assignmentsUpdated = 0;
  for (const assignment of linkedAssignments ?? []) {
    const { data: cached } = await supabase
      .from('cached_campaigns')
      .select('spend, leads, status, impressions, clicks')
      .eq('campaign_id', assignment.supermetrics_campaign_id)
      .single();

    if (cached) {
      await supabase
        .from('paid_assignments')
        .update({
          budget_spent: cached.spend,
          leads: cached.leads,
          impressions: cached.impressions ?? 0,
          clicks: cached.clicks ?? 0,
          campaign_status: cached.status,
          last_synced: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', assignment.id);
      assignmentsUpdated++;
    }
  }

  return NextResponse.json({
    success: true,
    campaigns_synced: totalCampaigns,
    assignments_updated: assignmentsUpdated,
    errors: errors.length ? errors : undefined,
    warnings: warnings.length ? warnings : undefined,
  });
}
