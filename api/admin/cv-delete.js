import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase, BUCKET } from '../_lib/supabase.js';

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;
    if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID obrigatório' });

    const supabase = getSupabase();

    // Get file path before deleting
    const { data: cv } = await supabase
        .from('cv_versions')
        .select('file_path')
        .eq('id', id)
        .single();

    if (!cv) return res.status(404).json({ error: 'Versão não encontrada' });

    // Remove from storage
    await supabase.storage.from(BUCKET()).remove([cv.file_path]);

    // Remove from DB (cascade removes associated tokens)
    const { error } = await supabase.from('cv_versions').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true });
}
