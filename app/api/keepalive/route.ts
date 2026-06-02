import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Daily keep-alive. Supabase free tier pauses projects after ~7 days of
// inactivity, which knocks the app offline until manually restored. A trivial
// SELECT resets that idle timer. Triggered by Vercel cron (see vercel.json).

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { error } = await supabase.from('settings').select('key').limit(1);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
