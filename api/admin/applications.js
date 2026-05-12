import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { DEFAULT_STAGES } from '../_lib/stages.js';

const TEXT_MAX = { empresa: 200, vaga: 200, linkedin_empresa: 300, link_vaga: 500, observacoes: 500, gestor_nome: 100, gestor_email: 120 };

const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');

const VALID_STATUSES = new Set(['pending', 'running', 'done', 'rejected']);
const VALID_RESULTS  = new Set(['em_processo', 'aprovado', 'recusado']);

function clean(str, max) {
    if (typeof str !== 'string') return null;
    return str.replace(CONTROL_CHARS, '').trim().slice(0, max) || null;
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;

    const supabase = getSupabase();

    // GET — lista candidaturas ou detalhe individual (?id=)
    if (req.method === 'GET') {
        if (req.query.id) {
            const { data, error } = await supabase
                .from('job_applications')
                .select('*')
                .eq('id', req.query.id)
                .single();
            if (error || !data) return res.status(404).json({ error: 'Candidatura não encontrada' });
            return res.status(200).json(data);
        }

        const { data, error } = await supabase
            .from('job_applications')
            .select('*')
            .order('data_envio', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json(data ?? []);
    }

    // POST — cria candidatura manual
    if (req.method === 'POST') {
        const { empresa, vaga, linkedin_empresa, link_vaga, observacoes, gestor_nome, gestor_email, data_envio } = req.body || {};

        const emp = clean(empresa, TEXT_MAX.empresa);
        if (!emp) return res.status(400).json({ error: 'empresa obrigatório' });

        if (data_envio && isNaN(new Date(data_envio).getTime())) {
            return res.status(400).json({ error: 'data_envio inválido' });
        }

        const { data, error } = await supabase
            .from('job_applications')
            .insert({
                empresa:          emp,
                vaga:             clean(vaga, TEXT_MAX.vaga),
                linkedin_empresa: clean(linkedin_empresa, TEXT_MAX.linkedin_empresa),
                link_vaga:        clean(link_vaga, TEXT_MAX.link_vaga),
                observacoes:      clean(observacoes, TEXT_MAX.observacoes),
                gestor_nome:      clean(gestor_nome, TEXT_MAX.gestor_nome),
                gestor_email:     clean(gestor_email, TEXT_MAX.gestor_email),
                data_envio:       data_envio || null,
                source:           'manual',
                stages:           DEFAULT_STAGES,
            })
            .select()
            .single();

        if (error) return res.status(500).json({ error: error.message });
        return res.status(201).json(data);
    }

    // PUT — atualiza candidatura (?id=)
    if (req.method === 'PUT') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id obrigatório' });

        const { empresa, vaga, linkedin_empresa, link_vaga, observacoes, gestor_nome, gestor_email, data_envio, stages, result } = req.body || {};

        const patch = {};
        if (empresa !== undefined) {
            const val = clean(empresa, TEXT_MAX.empresa);
            if (val === null) return res.status(400).json({ error: 'empresa não pode ser vazio' });
            patch.empresa = val;
        }
        if (vaga             !== undefined) patch.vaga             = clean(vaga, TEXT_MAX.vaga);
        if (linkedin_empresa !== undefined) patch.linkedin_empresa = clean(linkedin_empresa, TEXT_MAX.linkedin_empresa);
        if (link_vaga        !== undefined) patch.link_vaga        = clean(link_vaga, TEXT_MAX.link_vaga);
        if (observacoes      !== undefined) patch.observacoes      = clean(observacoes, TEXT_MAX.observacoes);
        if (gestor_nome      !== undefined) patch.gestor_nome      = clean(gestor_nome, TEXT_MAX.gestor_nome);
        if (gestor_email     !== undefined) patch.gestor_email     = clean(gestor_email, TEXT_MAX.gestor_email);
        if (data_envio !== undefined) {
            if (data_envio !== null && data_envio !== '' && isNaN(new Date(data_envio).getTime())) {
                return res.status(400).json({ error: 'data_envio inválido' });
            }
            patch.data_envio = data_envio || null;
        }
        if (stages !== undefined) {
            if (!Array.isArray(stages)) {
                return res.status(400).json({ error: 'stages deve ser array' });
            }
            for (const s of stages) {
                if (typeof s.name !== 'string' || !s.name.trim()) {
                    return res.status(400).json({ error: 'stages: name (string) é obrigatório' });
                }
                if (s.status !== undefined && !VALID_STATUSES.has(s.status)) {
                    return res.status(400).json({ error: `stages: status inválido (${s.status})` });
                }
            }
            const runningCount = stages.filter(s => s.status === 'running' && s.active !== false).length;
            if (runningCount > 1) return res.status(400).json({ error: 'Apenas uma etapa pode estar executando' });
            patch.stages = stages;
        }
        if (result !== undefined) {
            if (!VALID_RESULTS.has(result)) {
                return res.status(400).json({ error: `result inválido (${result})` });
            }
            patch.result = result;
        }

        if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

        const { data, error } = await supabase
            .from('job_applications')
            .update(patch)
            .eq('id', id)
            .select()
            .single();

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'Candidatura não encontrada' });
        return res.status(200).json(data);
    }

    // DELETE — deleta candidatura (?id=)
    if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id obrigatório' });

        const { data, error } = await supabase
            .from('job_applications')
            .delete()
            .eq('id', id)
            .select()
            .single();

        if (error) return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message });
        return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
