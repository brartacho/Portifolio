import { getSessionId, getSupabaseDemo, cors, clean } from './_lib/session.js';
import { checkRateLimit } from '../_lib/rate-limit.js';
import { randomBytes } from 'crypto';

function genHash() {
    return randomBytes(6).toString('hex'); // 12 chars
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    const session_id = getSessionId(req);
    if (!session_id) return res.status(400).json({ error: 'session_id obrigatório' });

    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        const rl = await checkRateLimit({ req, scope: 'demo-mut', max: 60, windowMs: 60_000 });
        if (!rl.allowed) {
            res.setHeader('Retry-After', rl.retryAfterSec);
            return res.status(429).json({ error: 'Muitas requisições. Aguarde.' });
        }
    }

    const supabase = getSupabaseDemo();

    if (req.method === 'GET') {
        const { data } = await supabase
            .from('demo_download_tokens')
            .select('*, cv_versions:demo_cv_versions(id, name)')
            .eq('session_id', session_id)
            .order('created_at', { ascending: false })
            .limit(100);
        return res.json(data ?? []);
    }

    if (req.method === 'POST') {
        const { data: quotaErr } = await supabase.rpc('demo_check_quota', {
            p_session_id: session_id,
            p_table: 'demo_download_tokens',
        });
        if (quotaErr) return res.status(429).json({ error: quotaErr });

        const body = req.body || {};
        if (!body.cv_version_id) return res.status(400).json({ error: 'cv_version_id obrigatório' });

        const hours = Math.max(1, Math.min(720, parseInt(body.hours) || 24));
        const max_uses = body.max_uses === null || body.max_uses === '' ? null : Math.max(1, Math.min(100, parseInt(body.max_uses) || 5));

        const { data, error } = await supabase
            .from('demo_download_tokens')
            .insert({
                session_id,
                cv_version_id: body.cv_version_id,
                label: clean(body.label, 100) || 'Token sem label',
                hash: genHash(),
                expires_at: new Date(Date.now() + hours * 3600_000).toISOString(),
                max_uses,
                use_count: 0,
                revoked: false,
            })
            .select('*, cv_versions:demo_cv_versions(id, name)')
            .single();
        if (error) return res.status(500).json({ error: error.message });
        return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
        if (!req.query.id) return res.status(400).json({ error: 'id obrigatório' });
        const body = req.body || {};
        const patch = {};
        if ('revoked' in body) patch.revoked = !!body.revoked;
        if ('label'   in body) patch.label   = clean(body.label, 100);
        const { data, error } = await supabase
            .from('demo_download_tokens')
            .update(patch)
            .eq('id', req.query.id)
            .eq('session_id', session_id)
            .select('*, cv_versions:demo_cv_versions(id, name)')
            .single();
        if (error || !data) return res.status(404).json({ error: 'Não encontrado' });
        return res.json(data);
    }

    if (req.method === 'DELETE') {
        if (!req.query.id) return res.status(400).json({ error: 'id obrigatório' });
        await supabase
            .from('demo_download_tokens')
            .delete()
            .eq('id', req.query.id)
            .eq('session_id', session_id);
        return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
