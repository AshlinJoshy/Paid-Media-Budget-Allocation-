import { NextResponse } from 'next/server';
import { metabaseQueryRows, MetabaseError } from '@/lib/metabase';
import { buildBreakdownSql } from '@/lib/engage-sql';

// Ad-set / ad breakdown for a single campaign. Used by the expandable row in
// /budget — given a paid_campaign_name, returns one entry per unique (utm_term,
// utm_content) pair with lead counts and qualification.
//
// GET /api/engage/breakdown?campaign=BH-CMP-000565&since=2026-01-01
//
// Response: { adsets: [{ name, leads, qualified, ads: [{ name, leads, qualified }] }] }

interface BreakdownRow {
  adset: string;
  ad: string;
  leads: number;
  qualified: number;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const campaign = url.searchParams.get('campaign')?.trim();
  if (!campaign) {
    return NextResponse.json({ error: 'Missing ?campaign=...' }, { status: 400 });
  }

  const sinceParam = url.searchParams.get('since');
  const since = sinceParam && /^\d{4}-\d{2}-\d{2}$/.test(sinceParam)
    ? sinceParam
    : `${new Date().getUTCFullYear()}-01-01`;

  try {
    const rows = await metabaseQueryRows<BreakdownRow>(
      buildBreakdownSql(since, campaign),
    );

    // Group flat (adset, ad) rows into a nested adset → ads tree.
    const bucket = new Map<string, { leads: number; qualified: number; ads: Map<string, { leads: number; qualified: number }> }>();
    for (const r of rows) {
      const leads = Number(r.leads) || 0;
      const qualified = Number(r.qualified) || 0;
      if (!bucket.has(r.adset)) bucket.set(r.adset, { leads: 0, qualified: 0, ads: new Map() });
      const adset = bucket.get(r.adset)!;
      adset.leads += leads;
      adset.qualified += qualified;
      if (!adset.ads.has(r.ad)) adset.ads.set(r.ad, { leads: 0, qualified: 0 });
      const ad = adset.ads.get(r.ad)!;
      ad.leads += leads;
      ad.qualified += qualified;
    }

    const adsets = Array.from(bucket.entries())
      .map(([name, v]) => ({
        name,
        leads: v.leads,
        qualified: v.qualified,
        ads: Array.from(v.ads.entries())
          .map(([adName, av]) => ({ name: adName, leads: av.leads, qualified: av.qualified }))
          .sort((a, b) => b.leads - a.leads),
      }))
      .sort((a, b) => b.leads - a.leads);

    return NextResponse.json({ campaign, since, adsets });
  } catch (err) {
    if (err instanceof MetabaseError) {
      return NextResponse.json({
        error: err.message,
        stage: err.stage,
        upstream: err.upstream,
      }, { status: 502 });
    }
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
    }, { status: 502 });
  }
}
