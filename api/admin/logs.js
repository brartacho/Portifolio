import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('download_logs')
        .select('id, downloaded_at, ip_address, user_agent, download_tokens(label), cv_versions(name)')
        .order('downloaded_at', { ascending: false })
        .limit(200);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
}
