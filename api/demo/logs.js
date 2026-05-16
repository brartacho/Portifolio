import { getSessionId, getSupabaseDemo, cors, clean, hashIP } from './_lib/session.js';
import { checkRateLimit, clientIp } from '../_lib/rate-limit.js';

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    const session_id = getSessionId(req);
    if (!session_id) return res.status(400).json({ error: 'session_id obrigatório' });

    const supabase = getSupabaseDemo();

    if (req.method === 'GET') {
        const tipo  = req.query.tipo || '';
        const search = req.query.search || '';
        const page  = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
        const offset = (page - 1) * limit;

        let query = supabase
            .from('demo_download_logs')
            .select('*, cv_versions:demo_cv_versions(name), download_tokens:demo_download_tokens(label)', { count: 'exact' })
            .eq('session_id', session_id)
            .order('downloaded_at', { ascending: false });

        if (tipo === 'download')         query = query.not('ip_address', 'like', 'admin-%');
        else if (tipo === 'email')        query = query.eq('ip_address', 'admin-send-email');
        else if (tipo === 'whatsapp')     query = query.like('ip_address', 'admin-send-whatsapp%');
        else if (tipo === 'whatsapp-link')   query = query.eq('ip_address', 'admin-send-whatsapp-link');
        else if (tipo === 'whatsapp-attach') query = query.eq('ip_address', 'admin-send-whatsapp');

        if (search) {
            const s = search.replace(/[%_\\]/g, c => `\\${c}`);
            query = query.or(`cv_name_snapshot.ilike.%${s}%,empresa.ilike.%${s}%,vaga.ilike.%${s}%,user_agent.ilike.%${s}%`);
        }

        query = query.range(offset, offset + limit - 1);

        const { data, count } = await query;
        return res.json({
            data: data ?? [],
            total: count ?? 0,
            page, limit,
            pages: Math.ceil((count ?? 0) / limit),
        });
    }

    if (req.method === 'POST') {
        const rl = await checkRateLimit({ req, scope: 'demo-mut', max: 60, windowMs: 60_000 });
        if (!rl.allowed) {
            res.setHeader('Retry-After', rl.retryAfterSec);
            return res.status(429).json({ error: 'Muitas requisições. Aguarde.' });
        }
        const { data: quotaErr } = await supabase.rpc('demo_check_quota', {
            p_session_id: session_id,
            p_table: 'demo_download_logs',
        });
        if (quotaErr) return res.status(429).json({ error: quotaErr });

        const body = req.body || {};
        // LGPD: se ip_address for IP real (não prefixo admin-*), hasheia
        let ip = clean(body.ip_address, 100);
        if (ip && !ip.startsWith('admin-') && !ip.startsWith('ip:')) {
            ip = hashIP(ip);
        }
        if (!ip) ip = hashIP(clientIp(req));

        const { data, error } = await supabase
            .from('demo_download_logs')
            .insert({
                session_id,
                cv_version_id: body.cv_version_id || null,
                cv_name_snapshot: clean(body.cv_name_snapshot, 200),
                cv_id_snapshot: body.cv_id_snapshot || null,
                token_id: body.token_id || null,
                ip_address: ip,
                user_agent: clean(body.user_agent, 500),
                empresa: clean(body.empresa, 200),
                vaga: clean(body.vaga, 200),
                notas: clean(body.notas, 500),
                contato: clean(body.contato, 200),
            })
            .select('*, cv_versions:demo_cv_versions(name), download_tokens:demo_download_tokens(label)')
            .single();
        if (error) return res.status(500).json({ error: error.message });
        return res.status(201).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
