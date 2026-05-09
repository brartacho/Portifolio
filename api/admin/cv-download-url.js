import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase, BUCKET } from '../_lib/supabase.js';

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID obrigatório' });

    const supabase = getSupabase();

    const { data: cv, error: cvErr } = await supabase
        .from('cv_versions')
        .select('file_path, file_name')
        .eq('id', id)
        .single();

    if (cvErr || !cv) return res.status(404).json({ error: 'Versão de CV não encontrada' });

    // URL assinada com 60s de validade — só pra trigger do download local imediato
    const { data: signed, error: signErr } = await supabase
        .storage
        .from(BUCKET())
        .createSignedUrl(cv.file_path, 60, { download: cv.file_name });

    if (signErr || !signed) return res.status(500).json({ error: signErr?.message || 'Falha ao gerar URL' });

    return res.status(200).json({
        signedUrl: signed.signedUrl,
        file_name: cv.file_name,
    });
}
