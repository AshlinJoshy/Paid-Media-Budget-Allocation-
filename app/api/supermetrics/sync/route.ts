import { NextResponse } from 'next/server';
import { supabase, getSmApiKey } from '@/lib/supabase';
import { smFetchCampaigns, parseCampaignRow } from '@/lib/supermetrics';
import { DS_TO_PLATFORM } from '@/types';

export async function POST(req: Request) {
  const apiKey = await getSmApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: 'No API key configured.' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const dateRange = body.date_range ?? 'this_month';

  const { data: selectedAccounts } = await supabase
    .from('supermetrics_accounts')
    .select('ds_id, account_id')
    .eq('is_selected', true);

  if (!selectedAccounts?.length) {
    return NextResponse.json(
      { error: 'No accounts selected. Please select accounts in Settings.' },
      { status: 400 }
    );
  }

  // Group by ds_id
  const byDs: Record<string, string[]> = {};
  for (const acc of selectedAccounts) {
    if (!byDs[acc.ds_id]) byDs[acc.ds_id] = [];
    byDs[acc.ds_id].push(acc.account_id);
  }

  const errors: string[] = [];
  let totalCampaigns = 0;

  for (const [dsId, accountIds] of Object.entries(byDs)) {
    for (const accountId of accountIds) {
      try {
        const rows = await smFetchCampaigns(apiKey, dsId, [accountId], dateRange);
        const platform = DS_TO_PLATFORM[dsId] ?? 'unknown';

        for (const row of rows) {
          const parsed = parseCampaignRow(row, dsId);
          if (!parsed.campaign_id) continue;

          await supabase.from('cached_campaigns').upsert(
            {
              ds_id: dsId,
              account_id: accountId,
              campaign_id: parsed.campaign_id,
              campaign_name: parsed.campaign_name,
              status: parsed.status,
              platform,
              spend: parsed.spend,
              leads: parsed.leads,
              conversions: parsed.conversions,
              last_updated: new Date().toISOString(),
            },
            { onConflict: 'ds_id,account_id,campaign_id' }
          );
          totalCampaigns++;
        }
      } catch (err) {
        errors.push(`${dsId}/${accountId}: ${err instanceof Error ? err.message : String(err)}`);
      }
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
      .select('spend, leads, status')
      .eq('campaign_id', assignment.supermetrics_campaign_id)
      .single();

    if (cached) {
      await supabase
        .from('paid_assignments')
        .update({
          budget_spent: cached.spend,
          leads: cached.leads,
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
  });
}
