import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_ANON_KEY!;

if (!url || !key) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

/** Retrieve Supermetrics API key and guarantee it is clean ASCII before use. */
export async function getSmApiKey(): Promise<string | null> {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'supermetrics_api_key')
    .single();

  if (!data?.value) return null;

  // Strip every non-printable and non-ASCII character (covers en-dash, smart
  // quotes, zero-width spaces, etc. that sneak in from copy-paste sources).
  return data.value.replace(/[^\x20-\x7E]/g, '').trim();
}
