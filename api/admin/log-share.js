import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { DEFAULT_STAGES } from '../_lib/stages.js';

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

    const { cv_version_id, cv_name_snapshot, cv_id_snapshot, ip_address, user_agent, token_id,
            empresa, vaga, notas, contato, linkedin_empresa, link_vaga,
            modalidade, tipo_contratacao } = req.body || {};

    if (!cv_version_id || !ip_address || !ALLOWED_IP.has(ip_address)) {
        return res.status(400).json({ error: 'cv_version_id e ip_address válidos são obrigatórios' });
    }

    const s = v => v ? String(v).replace(/[\r\n\t]/g, '').trim() : null;
    const cleanEmpresa  = s(empresa)?.slice(0, 200)          || null;
    const cleanVaga     = s(vaga)?.slice(0, 200)             || null;
    const cleanContato  = s(contato)?.slice(0, 300)          || null;
    const cleanLinkedin = s(linkedin_empresa)?.slice(0, 300) || null;
    const cleanLinkVaga = s(link_vaga)?.slice(0, 500)        || null;
    const cleanNotas    = s(notas)?.slice(0, 500)            || null;

    const supabase = getSupabase();
    const { error } = await supabase.from('download_logs').insert({
        cv_version_id,
        cv_name_snapshot: cv_name_snapshot || null,
        cv_id_snapshot:   cv_id_snapshot   || null,
        ip_address,
        user_agent: s(user_agent)?.slice(0, 500) || null,
        token_id:   token_id || null,
        empresa:    cleanEmpresa,
        vaga:       cleanVaga,
        notas:      cleanNotas,
        contato:    cleanContato,
    });

    if (error) return res.status(500).json({ error: error.message });

    const recName = s(user_agent)?.match(/^Send to ([^<(]+?)(?:\s*<|\s+via|\s*$)/)?.[1]?.trim() || null;
    supabase.from('job_applications').insert({
        empresa:          cleanEmpresa  || 'N/A',
        vaga:             cleanVaga,
        linkedin_empresa: cleanLinkedin,
        link_vaga:        cleanLinkVaga,
        observacoes:      cleanNotas,
        gestor_nome:      recName || null,
        data_envio:       new Date().toISOString(),
        modalidade:       s(modalidade)?.slice(0, 20)       || null,
        tipo_contratacao: s(tipo_contratacao)?.slice(0, 20) || null,
        source:           'cv_send',
        stages:           DEFAULT_STAGES,
    }).then(() => {}, () => {});

    return res.status(200).json({ ok: true });
}
