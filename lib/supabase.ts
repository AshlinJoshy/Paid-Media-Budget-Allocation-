import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_ANON_KEY!;

if (!url || !key) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
}

// Single shared client for server-side API routes
export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});
