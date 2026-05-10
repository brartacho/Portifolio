import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase, BUCKET } from '../_lib/supabase.js';
import { normalizeFileName } from '../_lib/filename.js';

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { id, recipient, channel } = req.query;
    if (!id) return res.status(400).json({ error: 'ID obrigatório' });

    const supabase = getSupabase();

    const { data: cv, error: cvErr } = await supabase
        .from('cv_versions')
        .select('file_path, file_name')
        .eq('id', id)
        .single();

    if (cvErr || !cv) return res.status(404).json({ error: 'Versão de CV não encontrada' });

    // Aplica normalize defensivo (cobre entradas antigas com acentos)
    const safeFileName = normalizeFileName(cv.file_name);

    // Log opcional — só quando vem do fluxo de envio (recipient + channel presentes).
    // Atalho de download direto da lista (Bruno baixando pra si) não passa esses params.
    if (recipient && channel) {
        const cleanRecipient = String(recipient).replace(/[\r\n\t]/g, '').trim().slice(0, 200);
        const cleanChannel = String(channel).replace(/[^a-z-]/gi, '').toLowerCase().slice(0, 50);
        if (cleanRecipient && cleanChannel) {
            await supabase.from('download_logs').insert({
                cv_version_id: id,
                ip_address: `admin-send-${cleanChannel}`,
                user_agent: `Send to ${cleanRecipient} via ${cleanChannel} (manual attach)`,
            }).then(() => {}, () => {});  // silent — log não pode quebrar o envio
        }
    }

    // URL assinada com 60s de validade — { download: name } força download
    // com o nome normalizado em vez de "objeto.pdf" ou afins
    const { data: signed, error: signErr } = await supabase
        .storage
        .from(BUCKET())
        .createSignedUrl(cv.file_path, 60, { download: safeFileName });

    if (signErr || !signed) return res.status(500).json({ error: signErr?.message || 'Falha ao gerar URL' });

    return res.status(200).json({
        signedUrl: signed.signedUrl,
        file_name: safeFileName,
    });
}
