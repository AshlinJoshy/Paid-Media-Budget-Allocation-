import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q')?.toLowerCase() ?? '';
  const dsId = searchParams.get('ds_id') ?? '';

  let builder = supabase
    .from('cached_campaigns')
    .select('*')
    .order('platform')
    .order('campaign_name');

  if (query) builder = builder.ilike('campaign_name', `%${query}%`);
  if (dsId) builder = builder.eq('ds_id', dsId);

  const { data, error } = await builder;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
