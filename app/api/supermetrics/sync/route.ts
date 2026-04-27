import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { smFetchCampaigns, parseCampaignRow } from '@/lib/supermetrics';
import { DS_TO_PLATFORM } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  const db = getDb();

  const apiKeyRow = db.prepare(`SELECT value FROM settings WHERE key = 'supermetrics_api_key'`).get() as { value: string } | undefined;
  if (!apiKeyRow?.value) {
    return NextResponse.json({ error: 'No API key configured.' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const dateRange = body.date_range ?? 'this_month';

  const selectedAccounts = db.prepare(`
    SELECT * FROM supermetrics_accounts WHERE is_selected = 1
  `).all() as { ds_id: string; account_id: string }[];

  if (selectedAccounts.length === 0) {
    return NextResponse.json({ error: 'No accounts selected. Please select accounts in Settings.' }, { status: 400 });
  }

  // Group by ds_id
  const byDs: Record<string, string[]> = {};
  for (const acc of selectedAccounts) {
    if (!byDs[acc.ds_id]) byDs[acc.ds_id] = [];
    byDs[acc.ds_id].push(acc.account_id);
  }

  const upsertCampaign = db.prepare(`
    INSERT INTO cached_campaigns (id, ds_id, account_id, campaign_id, campaign_name, status, platform, spend, leads, conversions, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(ds_id, account_id, campaign_id) DO UPDATE SET
      campaign_name = excluded.campaign_name,
      status = excluded.status,
      spend = excluded.spend,
      leads = excluded.leads,
      conversions = excluded.conversions,
      last_updated = datetime('now')
  `);

  const errors: string[] = [];
  let totalCampaigns = 0;

  for (const [dsId, accountIds] of Object.entries(byDs)) {
    for (const accountId of accountIds) {
      try {
        const rows = await smFetchCampaigns(apiKeyRow.value, dsId, [accountId], dateRange);
        const platform = DS_TO_PLATFORM[dsId] ?? 'unknown';
        for (const row of rows) {
          const parsed = parseCampaignRow(row, dsId);
          if (!parsed.campaign_id) continue;
          upsertCampaign.run(
            uuidv4(), dsId, accountId,
            parsed.campaign_id, parsed.campaign_name,
            parsed.status, platform,
            parsed.spend, parsed.leads, parsed.conversions
          );
          totalCampaigns++;
        }
      } catch (err) {
        errors.push(`${dsId}/${accountId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // After syncing, update budget_spent and leads on any assignments that have a linked supermetrics_campaign_id
  const assignments = db.prepare(`
    SELECT id, supermetrics_campaign_id, platform FROM paid_assignments
    WHERE supermetrics_campaign_id IS NOT NULL AND supermetrics_campaign_id != ''
  `).all() as { id: string; supermetrics_campaign_id: string; platform: string }[];

  const updateAssignment = db.prepare(`
    UPDATE paid_assignments
    SET budget_spent = ?, leads = ?, campaign_status = ?, last_synced = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `);

  for (const assignment of assignments) {
    const cached = db.prepare(`
      SELECT * FROM cached_campaigns WHERE campaign_id = ? LIMIT 1
    `).get(assignment.supermetrics_campaign_id) as { spend: number; leads: number; status: string } | undefined;

    if (cached) {
      updateAssignment.run(cached.spend, cached.leads, cached.status, assignment.id);
    }
  }

  return NextResponse.json({
    success: true,
    campaigns_synced: totalCampaigns,
    assignments_updated: assignments.length,
    errors: errors.length ? errors : undefined,
  });
}
