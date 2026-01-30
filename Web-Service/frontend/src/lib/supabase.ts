import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://mtodevikkgraisalolkq.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable__kHMeep-FZH1wwFRiiqtiA_NOh5f5wZ';

// Create Supabase client
// Note: Database types are available in src/types/supabase.types.ts for reference
// Using untyped client for flexibility with PostgREST queries
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Re-export for convenience
export default supabase;
