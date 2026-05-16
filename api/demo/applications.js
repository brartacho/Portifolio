import { getSessionId, getSupabaseDemo, cors, clean } from './_lib/session.js';
import { checkRateLimit } from '../_lib/rate-limit.js';

const VALID_MODALIDADE = new Set(['Presencial', 'Híbrida', 'Remota']);
const VALID_TIPO       = new Set(['CLT', 'PJ', 'Freelancer']);
const VALID_RESULTS    = new Set(['em_processo', 'aprovado', 'recusado']);

function sanitize(body) {
    const out = {};
    if ('empresa'          in body) out.empresa          = clean(body.empresa,          200) || 'N/A';
    if ('vaga'             in body) out.vaga             = clean(body.vaga,             200);
    if ('linkedin_empresa' in body) out.linkedin_empresa = clean(body.linkedin_empresa, 300);
    if ('link_vaga'        in body) out.link_vaga        = clean(body.link_vaga,        500);
    if ('observacoes'      in body) out.observacoes      = clean(body.observacoes,      500);
    if ('gestor_nome'      in body) out.gestor_nome      = clean(body.gestor_nome,      100);
    if ('gestor_email'     in body) out.gestor_email     = clean(body.gestor_email,     120);
    if ('gestor_phone'     in body) out.gestor_phone     = clean(body.gestor_phone,     30);
    if ('modalidade'       in body) out.modalidade       = VALID_MODALIDADE.has(body.modalidade) ? body.modalidade : null;
    if ('tipo_contratacao' in body) out.tipo_contratacao = VALID_TIPO.has(body.tipo_contratacao) ? body.tipo_contratacao : null;
    if ('cv_version_id'    in body) out.cv_version_id    = body.cv_version_id || null;
    if ('result'           in body) out.result           = VALID_RESULTS.has(body.result) ? body.result : null;
    if ('archived'         in body) out.archived         = !!body.archived;
    if ('stages'           in body) out.stages           = Array.isArray(body.stages) ? body.stages.slice(0, 20) : null;
    if ('data_envio'       in body) out.data_envio       = body.data_envio || null;
    return out;
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    const session_id = getSessionId(req);
    if (!session_id) return res.status(400).json({ error: 'session_id obrigatório' });

    // Rate limit por IP (mutações)
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        const rlIp = await checkRateLimit({ req, scope: 'demo-mut', max: 60, windowMs: 60_000 });
        if (!rlIp.allowed) {
            res.setHeader('Retry-After', rlIp.retryAfterSec);
            return res.status(429).json({ error: 'Muitas requisições. Aguarde.' });
        }
    }

    const supabase = getSupabaseDemo();

    if (req.method === 'GET') {
        if (req.query.id) {
            const { data, error } = await supabase
                .from('demo_job_applications')
                .select('*, cv_versions:demo_cv_versions(id, name, file_name)')
                .eq('id', req.query.id)
                .eq('session_id', session_id)
                .single();
            if (error || !data) return res.status(404).json({ error: 'Não encontrado' });
            return res.json(data);
        }
        const { data } = await supabase
            .from('demo_job_applications')
            .select('*, cv_versions:demo_cv_versions(id, name, file_name)')
            .eq('session_id', session_id)
            .order('updated_at', { ascending: false })
            .limit(50);
        return res.json(data ?? []);
    }

    if (req.method === 'POST') {
        const { data: quotaErr } = await supabase.rpc('demo_check_quota', {
            p_session_id: session_id,
            p_table: 'demo_job_applications',
        });
        if (quotaErr) return res.status(429).json({ error: quotaErr });

        const patch = sanitize(req.body || {});
        patch.session_id = session_id;
        patch.stages = patch.stages || [];
        patch.data_envio = patch.data_envio || new Date().toISOString();

        const { data, error } = await supabase
            .from('demo_job_applications')
            .insert(patch)
            .select('*, cv_versions:demo_cv_versions(id, name, file_name)')
            .single();
        if (error) return res.status(500).json({ error: error.message });
        return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
        if (!req.query.id) return res.status(400).json({ error: 'id obrigatório' });
        const patch = sanitize(req.body || {});
        const { data, error } = await supabase
            .from('demo_job_applications')
            .update(patch)
            .eq('id', req.query.id)
            .eq('session_id', session_id)
            .select('*, cv_versions:demo_cv_versions(id, name, file_name)')
            .single();
        if (error || !data) return res.status(404).json({ error: 'Não encontrado' });
        return res.json(data);
    }

    if (req.method === 'DELETE') {
        if (!req.query.id) return res.status(400).json({ error: 'id obrigatório' });
        await supabase
            .from('demo_job_applications')
            .delete()
            .eq('id', req.query.id)
            .eq('session_id', session_id);
        return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
