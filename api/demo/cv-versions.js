import { getSessionId, getSupabaseDemo, cors, clean } from './_lib/session.js';
import { checkRateLimit } from '../_lib/rate-limit.js';

function safeFileName(name) {
    return String(name || 'cv-demo.pdf')
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .slice(0, 100);
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
            .from('demo_cv_versions')
            .select('*')
            .eq('session_id', session_id)
            .order('created_at', { ascending: false })
            .limit(100);
        return res.json(data ?? []);
    }

    if (req.method === 'POST') {
        const { data: quotaErr } = await supabase.rpc('demo_check_quota', {
            p_session_id: session_id,
            p_table: 'demo_cv_versions',
        });
        if (quotaErr) return res.status(429).json({ error: quotaErr });

        const body = req.body || {};
        const { data, error } = await supabase
            .from('demo_cv_versions')
            .insert({
                session_id,
                name: clean(body.name, 100) || 'CV sem nome',
                description: clean(body.description, 200),
                file_name: safeFileName(body.file_name || `cv-demo-${Date.now()}.pdf`),
                active: true,
            })
            .select('*')
            .single();
        if (error) return res.status(500).json({ error: error.message });
        return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
        if (!req.query.id) return res.status(400).json({ error: 'id obrigatório' });
        const body = req.body || {};
        const patch = {};
        if ('name'        in body) patch.name        = clean(body.name, 100);
        if ('description' in body) patch.description = clean(body.description, 200);
        if ('active'      in body) patch.active      = !!body.active;
        const { data, error } = await supabase
            .from('demo_cv_versions')
            .update(patch)
            .eq('id', req.query.id)
            .eq('session_id', session_id)
            .select('*')
            .single();
        if (error || !data) return res.status(404).json({ error: 'Não encontrado' });
        return res.json(data);
    }

    if (req.method === 'DELETE') {
        if (!req.query.id) return res.status(400).json({ error: 'id obrigatório' });
        await supabase
            .from('demo_cv_versions')
            .delete()
            .eq('id', req.query.id)
            .eq('session_id', session_id);
        return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
