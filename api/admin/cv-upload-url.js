import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase, BUCKET } from '../_lib/supabase.js';
import { normalizeFileName } from '../_lib/filename.js';

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { fileName } = req.query;
    if (!fileName) return res.status(400).json({ error: 'fileName obrigatório' });

    // Padroniza nome (sem acentos, sem espaços, só [a-zA-Z0-9._-])
    const safe = normalizeFileName(fileName);
    const filePath = `cv/${Date.now()}_${safe}`;

    const supabase = getSupabase();
    const { data, error } = await supabase.storage
        .from(BUCKET())
        .createSignedUploadUrl(filePath);

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({
        signedUrl: data.signedUrl,
        filePath,
        token: data.token,
    });
}
