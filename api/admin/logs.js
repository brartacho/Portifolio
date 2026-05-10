import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';

const ALLOWED_SORT = new Set([
    'downloaded_at', 'ip_address', 'cv_name_snapshot', 'user_agent',
    'cv', 'download_tokens.label',
]);
const MAX_LIMIT = 100;

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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
