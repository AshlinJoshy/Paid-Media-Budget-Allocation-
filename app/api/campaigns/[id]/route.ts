import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const ALLOWED = ['entity', 'name'];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const update: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) update[key] = body[key];
  }
  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 });

  update.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabase.from('marketing_campaigns').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
