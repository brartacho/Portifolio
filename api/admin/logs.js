import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { DEFAULT_STAGES } from '../_lib/stages.js';

const SHARE_ALLOWED_IP = new Set([
    'admin-send-whatsapp-link',
    'admin-send-whatsapp',
    'admin-send-email',
]);

const ALLOWED_SORT = new Set([
    'downloaded_at', 'ip_address', 'cv_name_snapshot', 'user_agent',
    'cv', 'download_tokens.label',
]);
const MAX_LIMIT = 100;

export default async function handler(req, res) {
    cors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;
    // Log-share — roteado de /api/admin/log-share via rewrite
    if (req.query.__h === 'share') {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

        const { cv_version_id, cv_name_snapshot, cv_id_snapshot, ip_address, user_agent, token_id,
                empresa, vaga, notas, contato, linkedin_empresa, link_vaga,
                modalidade, tipo_contratacao } = req.body || {};

        if (!cv_version_id || !ip_address || !SHARE_ALLOWED_IP.has(ip_address)) {
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
            cv_version_id:    cv_version_id,
            gestor_phone:     cleanContato || null,
            source:           'cv_send',
            stages:           DEFAULT_STAGES,
        }).then(() => {}, () => {});

        return res.status(200).json({ ok: true });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Detalhe de um log específico (absorve log-detail.js)
    if (req.query.id) {
        const { id } = req.query;
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

    const {
        search = '',
        tipo   = '',
        from   = '',
        to     = '',
        sort   = 'downloaded_at',
        dir    = 'desc',
        page   = '1',
        limit: limitParam = '50',
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(MAX_LIMIT, Math.max(1, parseInt(limitParam) || 50));
    const offset   = (pageNum - 1) * limitNum;
    const ascending = dir === 'asc';
    const sortCol  = ALLOWED_SORT.has(sort) ? sort : 'downloaded_at';

    const supabase = getSupabase();

    let query = supabase
        .from('download_logs')
        .select(
            'id, downloaded_at, ip_address, user_agent, cv_name_snapshot, cv_id_snapshot, download_tokens(label), cv_versions(name)',
            { count: 'exact' }
        );

    // ── SEARCH ────────────────────────────────────────────
    if (search) {
        // Escapa caracteres especiais do LIKE
        const s = search.replace(/[%_\\]/g, c => `\\${c}`);

        // Tokens cujo label bate com a busca
        const { data: matchedTokens } = await supabase
            .from('download_tokens')
            .select('id')
            .ilike('label', `%${s}%`);
        const tokenIds = matchedTokens?.map(t => t.id) || [];

        let orConds = `cv_name_snapshot.ilike.%${s}%,ip_address.ilike.%${s}%,user_agent.ilike.%${s}%`;
        if (tokenIds.length) orConds += `,token_id.in.(${tokenIds.join(',')})`;
        query = query.or(orConds);
    }

    // ── TIPO ──────────────────────────────────────────────
    if (tipo === 'download') {
        query = query.not('ip_address', 'like', 'admin-%');
    } else if (tipo === 'email') {
        query = query.eq('ip_address', 'admin-send-email');
    } else if (tipo === 'whatsapp') {
        // Todos os envios WhatsApp (link + arquivo)
        query = query.like('ip_address', 'admin-send-whatsapp%');
    } else if (tipo === 'whatsapp-link') {
        query = query.eq('ip_address', 'admin-send-whatsapp-link');
    } else if (tipo === 'whatsapp-attach') {
        query = query.eq('ip_address', 'admin-send-whatsapp');
    }

    // ── PERÍODO ───────────────────────────────────────────
    if (from) query = query.gte('downloaded_at', `${from}T00:00:00.000Z`);
    if (to)   query = query.lte('downloaded_at', `${to}T23:59:59.999Z`);

    // ── ORDENAÇÃO ─────────────────────────────────────────
    if (sortCol === 'cv') {
        query = query.order('cv_name_snapshot', { ascending });
    } else if (sortCol === 'download_tokens.label') {
        query = query.order('label', { foreignTable: 'download_tokens', ascending });
    } else {
        query = query.order(sortCol, { ascending });
    }

    // ── PAGINAÇÃO ─────────────────────────────────────────
    query = query.range(offset, offset + limitNum - 1);

    const { data, error, count } = await query;

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({
        data:  data ?? [],
        total: count ?? 0,
        page:  pageNum,
        limit: limitNum,
        pages: Math.ceil((count ?? 0) / limitNum),
    });
}
