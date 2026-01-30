"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = void 0;
exports.verifySupabaseToken = verifySupabaseToken;
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
// Service role client for backend operations (bypasses RLS)
// Only created if credentials are available
exports.supabaseAdmin = null;
if (supabaseUrl && supabaseServiceRoleKey) {
    exports.supabaseAdmin = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
    console.log('Supabase admin client initialized');
}
else {
    console.warn('Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured - Supabase features disabled');
}
// Verify a Supabase access token and return user info
async function verifySupabaseToken(accessToken) {
    if (!exports.supabaseAdmin) {
        console.warn('Supabase not configured - cannot verify token');
        return null;
    }
    try {
        const { data: { user }, error } = await exports.supabaseAdmin.auth.getUser(accessToken);
        if (error || !user) {
            return null;
        }
        return {
            userId: user.id,
            email: user.email || '',
            role: user.user_metadata?.user_type || 'Clinician'
        };
    }
    catch {
        return null;
    }
}
