import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID obrigatório' });

    const supabase = getSupabase();
    const { error } = await supabase
        .from('download_tokens')
        .update({ revoked: true })
        .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
}
