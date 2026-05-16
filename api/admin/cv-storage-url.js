import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase, BUCKET } from '../_lib/supabase.js';
import { normalizeFileName } from '../_lib/filename.js';
import { DEFAULT_STAGES } from '../_lib/stages.js';

export default async function handler(req, res) {
    cors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;

    const supabase = getSupabase();

    // POST → gera URL assinada de upload
    if (req.method === 'POST') {
        const { fileName } = req.body || {};
        if (!fileName) return res.status(400).json({ error: 'fileName obrigatório' });

        const safe = normalizeFileName(fileName);
        const filePath = `cv/${Date.now()}_${safe}`;

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

    // GET → gera URL assinada de download
    if (req.method === 'GET') {
        const { id, recipient, channel, empresa, vaga, linkedin_empresa, link_vaga, observacoes, modalidade, tipo_contratacao, contato } = req.query;
        if (!id) return res.status(400).json({ error: 'ID obrigatório' });

        const { data: cv, error: cvErr } = await supabase
            .from('cv_versions')
            .select('name, file_path, file_name')
            .eq('id', id)
            .single();

        if (cvErr || !cv) return res.status(404).json({ error: 'Versão de CV não encontrada' });

        const safeFileName = normalizeFileName(cv.file_name);

        if (recipient && channel) {
            const cleanRecipient = String(recipient).replace(/[\r\n\t]/g, '').trim().slice(0, 200);
            const cleanChannel = String(channel).replace(/[^a-z-]/gi, '').toLowerCase().slice(0, 50);
            if (cleanRecipient && cleanChannel) {
                const s = v => v ? String(v).replace(/[\r\n\t]/g, '').trim() : null;
                const cleanEmpresa  = s(empresa)?.slice(0, 200)          || null;
                const cleanVaga     = s(vaga)?.slice(0, 200)             || null;
                const cleanLinkedin = s(linkedin_empresa)?.slice(0, 300) || null;
                const cleanLinkVaga = s(link_vaga)?.slice(0, 500)        || null;
                const cleanObs      = s(observacoes)?.slice(0, 500)      || null;
                const cleanContato  = s(contato)?.replace(/\D/g, '').slice(0, 20) || null;
                await supabase.from('download_logs').insert({
                    cv_version_id: id,
                    cv_name_snapshot: cv.name,
                    cv_id_snapshot: id,
                    ip_address: `admin-send-${cleanChannel}`,
                    is_admin: true,
                    user_agent: `Send to ${cleanRecipient} via ${cleanChannel} (manual attach)`,
                    empresa: cleanEmpresa,
                    vaga:    cleanVaga,
                    contato: cleanContato,
                }).then(() => {}, () => {});
                supabase.from('job_applications').insert({
                    empresa:          cleanEmpresa  || 'N/A',
                    vaga:             cleanVaga,
                    linkedin_empresa: cleanLinkedin,
                    link_vaga:        cleanLinkVaga,
                    observacoes:      cleanObs,
                    gestor_nome:      cleanRecipient || null,
                    data_envio:       new Date().toISOString(),
                    modalidade:       s(modalidade)?.slice(0, 20)       || null,
                    tipo_contratacao: s(tipo_contratacao)?.slice(0, 20) || null,
                    cv_version_id:    id,
                    gestor_phone:     cleanContato || null,
                    source:           'cv_send',
                    stages:           DEFAULT_STAGES,
                }).then(() => {}, () => {});
            }
        }

        const signOptions = req.query.preview === '1'
            ? {}  // inline — permite pré-visualização no iframe
            : { download: safeFileName };

        const { data: signed, error: signErr } = await supabase
            .storage
            .from(BUCKET())
            .createSignedUrl(cv.file_path, 60, signOptions);

        if (signErr || !signed) return res.status(500).json({ error: signErr?.message || 'Falha ao gerar URL' });

        return res.status(200).json({
            signedUrl: signed.signedUrl,
            file_name: safeFileName,
        });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
