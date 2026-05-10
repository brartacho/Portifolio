import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';

const ALLOWED_IP = new Set([
    'admin-send-whatsapp-link',
    'admin-send-whatsapp',
    'admin-send-email',
]);

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { cv_version_id, cv_name_snapshot, cv_id_snapshot, ip_address, user_agent, token_id } = req.body || {};

    if (!cv_version_id || !ip_address || !ALLOWED_IP.has(ip_address)) {
        return res.status(400).json({ error: 'cv_version_id e ip_address válidos são obrigatórios' });
    }

    const supabase = getSupabase();
    const { error } = await supabase.from('download_logs').insert({
        cv_version_id,
        cv_name_snapshot: cv_name_snapshot || null,
        cv_id_snapshot:   cv_id_snapshot   || null,
        ip_address,
        user_agent: user_agent ? String(user_agent).replace(/[\r\n\t]/g, '').trim().slice(0, 500) : null,
        token_id: token_id || null,
    });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
}
