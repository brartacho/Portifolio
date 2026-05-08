import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;

    const supabase = getSupabase();

    if (req.method === 'GET') {
        const { data, error } = await supabase
            .from('cv_versions')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json(data);
    }

    if (req.method === 'POST') {
        const { name, description, file_path, file_name } = req.body || {};
        if (!name || !file_path || !file_name) {
            return res.status(400).json({ error: 'Campos obrigatórios: name, file_path, file_name' });
        }

        const { data, error } = await supabase
            .from('cv_versions')
            .insert({ name, description, file_path, file_name, active: true })
            .select()
            .single();

        if (error) return res.status(500).json({ error: error.message });
        return res.status(201).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
