import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase
    .from('dropdown_options')
    .select('field, value')
    .order('field')
    .order('value');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result: Record<string, string[]> = {};
  for (const row of data ?? []) {
    if (!result[row.field]) result[row.field] = [];
    result[row.field].push(row.value);
  }
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const { field, value } = await req.json();
  if (!field || !value) return NextResponse.json({ error: 'field and value required' }, { status: 400 });

  const { data, error } = await supabase
    .from('dropdown_options')
    .insert({ field, value })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Already exists' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: Request) {
  const { field, value } = await req.json();
  const { error } = await supabase
    .from('dropdown_options')
    .delete()
    .eq('field', field)
    .eq('value', value);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
