import { createClient } from '@supabase/supabase-js';

let _client = null;

export function getSupabase() {
    if (!_client) {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_KEY;
        if (!url || !key) throw new Error('Supabase env vars not set');
        _client = createClient(url, key, {
            auth: { persistSession: false }
        });
    }
    return _client;
}

export const BUCKET = () => process.env.SUPABASE_BUCKET || 'curriculos';
