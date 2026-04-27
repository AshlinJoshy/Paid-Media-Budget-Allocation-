import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getPlatformFromSource } from '@/types';

const ALLOWED = [
  'type', 'source', 'platform', 'start_month', 'start_date', 'status',
  'campaign_status', 'budget_allocation', 'budget_spent', 'leads',
  'supermetrics_campaign_id', 'paid_campaign_name',
];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const update: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) update[key] = body[key];
  }
  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 });

  // Auto-derive platform when source changes
  if (body.source && !body.platform) {
    update.platform = getPlatformFromSource(body.source);
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('paid_assignments')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const alloc = Number(data.budget_allocation);
  const spent = Number(data.budget_spent);
  const leads = Number(data.leads);
  return NextResponse.json({
    ...data,
    remaining: alloc - spent,
    cpl: leads > 0 ? Math.round((spent / leads) * 100) / 100 : 0,
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabase.from('paid_assignments').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
