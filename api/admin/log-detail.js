import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id obrigatório' });

    const supabase = getSupabase();

    const { data: log, error: logErr } = await supabase
        .from('download_logs')
        .select(`
            id, downloaded_at, ip_address, user_agent,
            cv_name_snapshot, cv_id_snapshot, token_id,
            empresa, vaga, notas, contato,
            download_tokens(id, label, empresa, vaga, notas, contato, expires_at, max_uses, use_count, revoked, created_at),
            cv_versions(id, name, description, file_name)
        `)
        .eq('id', id)
        .single();

    if (logErr || !log) return res.status(404).json({ error: 'Log não encontrado' });

    // Para envios via link (token_id existe): busca os acessos reais do recrutador
    let accesses = [];
    if (log.token_id) {
        const { data: acc } = await supabase
            .from('download_logs')
            .select('id, downloaded_at, ip_address, user_agent')
            .eq('token_id', log.token_id)
            .not('ip_address', 'like', 'admin-%')
            .order('downloaded_at', { ascending: true });
        accesses = acc || [];
    }

    return res.status(200).json({ log, accesses });
}
