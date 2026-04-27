import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

function withComputed(a: Record<string, unknown>) {
  const alloc = Number(a.budget_allocation ?? 0);
  const spent = Number(a.budget_spent ?? 0);
  const leads = Number(a.leads ?? 0);
  return {
    ...a,
    remaining: alloc - spent,
    cpl: leads > 0 ? Math.round((spent / leads) * 100) / 100 : 0,
  };
}

export async function GET() {
  const { data: campaigns, error: ce } = await supabase
    .from('marketing_campaigns')
    .select('*')
    .order('created_at', { ascending: true });
  if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });

  const { data: assignments, error: ae } = await supabase
    .from('paid_assignments')
    .select('*')
    .order('created_at', { ascending: true });
  if (ae) return NextResponse.json({ error: ae.message }, { status: 500 });

  const result = (campaigns ?? []).map((c) => ({
    ...c,
    assignments: (assignments ?? [])
      .filter((a) => a.marketing_campaign_id === c.id)
      .map(withComputed),
  }));

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .insert({ entity: body.entity ?? '', name: body.name ?? '' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, assignments: [] }, { status: 201 });
}
