import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getPlatformFromSource } from '@/types';

export async function POST(req: Request) {
  const body = await req.json();
  const platform = body.platform || getPlatformFromSource(body.source ?? '');

  const { data, error } = await supabase
    .from('paid_assignments')
    .insert({
      marketing_campaign_id: body.marketing_campaign_id,
      supermetrics_campaign_id: body.supermetrics_campaign_id ?? null,
      paid_campaign_name: body.paid_campaign_name ?? '',
      type: body.type ?? '',
      source: body.source ?? '',
      platform,
      start_month: body.start_month ?? '',
      start_date: body.start_date ?? '',
      status: body.status ?? 'Live',
      campaign_status: body.campaign_status ?? '',
      budget_allocation: body.budget_allocation ?? 0,
      budget_spent: body.budget_spent ?? 0,
      leads: body.leads ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const alloc = Number(data.budget_allocation);
  const spent = Number(data.budget_spent);
  const leads = Number(data.leads);
  return NextResponse.json(
    {
      ...data,
      remaining: alloc - spent,
      cpl: leads > 0 ? Math.round((spent / leads) * 100) / 100 : 0,
    },
    { status: 201 }
  );
}
