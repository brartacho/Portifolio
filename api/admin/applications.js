import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { DEFAULT_STAGES } from '../_lib/stages.js';

function dateRange(from, to) {
    const f = from ? `${from}T00:00:00.000Z` : new Date(Date.now() - 30 * 86400000).toISOString();
    const t = to   ? `${to}T23:59:59.999Z`   : new Date().toISOString();
    return { f, t };
}

const TEXT_MAX = { empresa: 200, vaga: 200, linkedin_empresa: 300, link_vaga: 500, observacoes: 500, gestor_nome: 100, gestor_email: 120, modalidade: 20, tipo_contratacao: 20 };

const VALID_MODALIDADE       = new Set(['Presencial', 'Híbrida', 'Remota']);
const VALID_TIPO_CONTRATACAO = new Set(['CLT', 'PJ', 'Freelancer']);

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

    // Analytics — roteado de /api/admin/analytics via rewrite
    if (req.query.__h === 'analytics') {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

        if (req.query.scope === 'vagas') {
            const fromStr = req.query.from || '';
            const toStr   = req.query.to   || '';
            const f = fromStr ? `${fromStr}T00:00:00.000Z` : null;
            const t = toStr   ? `${toStr}T23:59:59.999Z`   : null;
            const mode   = ['timeline','dow','wom','dom','moy'].includes(req.query.mode)   ? req.query.mode   : 'dow';
            const bucket = ['day','week','month','year'].includes(req.query.bucket)         ? req.query.bucket : 'week';

            const rpcArgs = { from_ts: f, to_ts: t };
            let totalQ = supabase.from('job_applications')
                .select('id', { count: 'exact', head: true })
                .not('archived', 'eq', true);
            if (f) totalQ = totalQ.gte('created_at', f);
            if (t) totalQ = totalQ.lte('created_at', t);

            const chartPromise = mode === 'timeline'
                ? supabase.rpc('vagas_series',       { ...rpcArgs, bucket_size: bucket })
                : supabase.rpc('vagas_distribution', { ...rpcArgs, mode });

            const [totalRes, byResultRes, byModalidadeRes, byTipoRes, chartRes, byStageRes] = await Promise.all([
                totalQ,
                supabase.rpc('vagas_by_result',           rpcArgs),
                supabase.rpc('vagas_by_modalidade',        rpcArgs),
                supabase.rpc('vagas_by_tipo',              rpcArgs),
                chartPromise,
                supabase.rpc('vagas_stages_distribution',  rpcArgs),
            ]);

            res.setHeader('Cache-Control', 'private, max-age=60');
            return res.status(200).json({
                total:         totalRes.count       ?? 0,
                by_result:     byResultRes.data     ?? [],
                by_modalidade: byModalidadeRes.data ?? [],
                by_tipo:       byTipoRes.data       ?? [],
                chart: {
                    mode,
                    bucket: mode === 'timeline' ? bucket : null,
                    points: chartRes.data ?? [],
                },
                by_stage:      byStageRes.data      ?? [],
            });
        }

        const { from = '', to = '' } = req.query;
        const { f, t } = dateRange(from, to);

        const [pageviewsRes, uniqueRes, engagedRes, cvClickRes, contactRes, caseRes,
               emailRes, downloadsRes, seriesRes, topPagesRes, referrersRes,
               utmRes, devicesRes, countriesRes, recurringRes] = await Promise.all([
            supabase.from('site_events').select('id', { count: 'exact', head: true }).eq('event', 'pageview').gte('occurred_at', f).lte('occurred_at', t),
            supabase.rpc('analytics_unique_visitors', { from_ts: f, to_ts: t }),
            supabase.from('site_events').select('id', { count: 'exact', head: true }).eq('event', 'engaged').gte('occurred_at', f).lte('occurred_at', t),
            supabase.from('site_events').select('id', { count: 'exact', head: true }).eq('event', 'cv_download_click').gte('occurred_at', f).lte('occurred_at', t),
            supabase.from('site_events').select('id', { count: 'exact', head: true }).eq('event', 'contact_click').gte('occurred_at', f).lte('occurred_at', t),
            supabase.from('site_events').select('id', { count: 'exact', head: true }).eq('event', 'case_open').gte('occurred_at', f).lte('occurred_at', t),
            supabase.from('site_events').select('id', { count: 'exact', head: true }).eq('event', 'email_request').gte('occurred_at', f).lte('occurred_at', t),
            supabase.from('download_logs').select('id', { count: 'exact', head: true }).not('ip_address', 'like', 'admin-%').gte('downloaded_at', f).lte('downloaded_at', t),
            supabase.rpc('analytics_series',            { from_ts: f, to_ts: t }),
            supabase.rpc('analytics_top_pages',         { from_ts: f, to_ts: t }),
            supabase.rpc('analytics_top_referrers',     { from_ts: f, to_ts: t }),
            supabase.rpc('analytics_utm_sources',       { from_ts: f, to_ts: t }),
            supabase.rpc('analytics_devices',           { from_ts: f, to_ts: t }),
            supabase.rpc('analytics_countries',         { from_ts: f, to_ts: t }),
            supabase.rpc('analytics_recurring_visitors',{ from_ts: f, to_ts: t }),
        ]);

        const pageviews       = pageviewsRes.count ?? 0;
        const unique_visitors = uniqueRes.data?.[0]?.count ?? 0;
        const engaged         = engagedRes.count ?? 0;
        const cv_clicks       = cvClickRes.count ?? 0;
        const cv_downloads    = downloadsRes.count ?? 0;

        return res.status(200).json({
            kpis: {
                pageviews,
                unique_visitors:    Number(unique_visitors),
                engaged_rate:       pageviews > 0 ? Math.round((engaged / pageviews) * 1000) / 10 : 0,
                cv_download_clicks: cv_clicks,
                email_requests:     emailRes.count ?? 0,
                contact_clicks:     contactRes.count ?? 0,
                case_opens:         caseRes.count ?? 0,
                cv_downloads,
                conversion_rate:    pageviews > 0 ? Math.round((cv_downloads / pageviews) * 1000) / 10 : 0,
                recurring_visitors: Number(recurringRes.data?.[0]?.count ?? 0),
            },
            series:        seriesRes.data    ?? [],
            top_pages:     topPagesRes.data  ?? [],
            top_referrers: referrersRes.data ?? [],
            utm_sources:   utmRes.data       ?? [],
            devices:       devicesRes.data   ?? [],
            countries:     countriesRes.data ?? [],
            funnel: {
                pageview:    pageviews,
                engaged,
                cv_click:    cv_clicks,
                cv_download: cv_downloads,
            },
        });
    }

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
        const { empresa, vaga, linkedin_empresa, link_vaga, observacoes, gestor_nome, gestor_email, data_envio, modalidade, tipo_contratacao } = req.body || {};

        const emp = clean(empresa, TEXT_MAX.empresa);
        if (!emp) return res.status(400).json({ error: 'empresa obrigatório' });

        if (data_envio && isNaN(new Date(data_envio).getTime())) {
            return res.status(400).json({ error: 'data_envio inválido' });
        }

        if (modalidade && !VALID_MODALIDADE.has(modalidade)) {
            return res.status(400).json({ error: `modalidade inválida (${modalidade})` });
        }
        if (tipo_contratacao && !VALID_TIPO_CONTRATACAO.has(tipo_contratacao)) {
            return res.status(400).json({ error: `tipo_contratacao inválido (${tipo_contratacao})` });
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
                modalidade:       modalidade || null,
                tipo_contratacao: tipo_contratacao || null,
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

        const { empresa, vaga, linkedin_empresa, link_vaga, observacoes, gestor_nome, gestor_email, data_envio, modalidade, tipo_contratacao, archived, stages, result } = req.body || {};

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
        if (modalidade !== undefined) {
            if (modalidade !== null && modalidade !== '' && !VALID_MODALIDADE.has(modalidade)) {
                return res.status(400).json({ error: `modalidade inválida (${modalidade})` });
            }
            patch.modalidade = modalidade || null;
        }
        if (tipo_contratacao !== undefined) {
            if (tipo_contratacao !== null && tipo_contratacao !== '' && !VALID_TIPO_CONTRATACAO.has(tipo_contratacao)) {
                return res.status(400).json({ error: `tipo_contratacao inválido (${tipo_contratacao})` });
            }
            patch.tipo_contratacao = tipo_contratacao || null;
        }
        if (archived !== undefined) {
            if (typeof archived !== 'boolean') {
                return res.status(400).json({ error: 'archived deve ser boolean' });
            }
            patch.archived = archived;
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
