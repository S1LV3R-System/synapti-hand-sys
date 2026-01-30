import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Service role client for backend operations (bypasses RLS)
// Only created if credentials are available
export let supabaseAdmin: SupabaseClient | null = null;

if (supabaseUrl && supabaseServiceRoleKey) {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  console.log('Supabase admin client initialized');
} else {
  console.warn('Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured - Supabase features disabled');
}

// Verify a Supabase access token and return user info
export async function verifySupabaseToken(accessToken: string): Promise<{
  userId: string;
  email: string;
  role: string;
} | null> {
  if (!supabaseAdmin) {
    console.warn('Supabase not configured - cannot verify token');
    return null;
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);

    if (error || !user) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email || '',
      role: user.user_metadata?.user_type || 'Clinician'
    };
  } catch {
    return null;
  }
}
