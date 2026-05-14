import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';

function dateRange(from, to) {
    const f = from ? `${from}T00:00:00.000Z` : new Date(Date.now() - 30 * 86400000).toISOString();
    const t = to   ? `${to}T23:59:59.999Z`   : new Date().toISOString();
    return { f, t };
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { from = '', to = '' } = req.query;
    const { f, t } = dateRange(from, to);

    const supabase = getSupabase();

    // ── Escopo: análise de candidaturas ────────────────────────────
    if (req.query.scope === 'vagas') {
        const fromStr = req.query.from || '';
        const toStr   = req.query.to   || '';
        const f = fromStr ? `${fromStr}T00:00:00.000Z` : null;
        const t = toStr   ? `${toStr}T23:59:59.999Z`   : null;
        const bucket = ['day','week','month','year'].includes(req.query.bucket) ? req.query.bucket : 'week';

        const rpcArgs = { from_ts: f, to_ts: t };
        let totalQ = supabase.from('job_applications')
            .select('id', { count: 'exact', head: true })
            .not('archived', 'eq', true);
        if (f) totalQ = totalQ.gte('created_at', f);
        if (t) totalQ = totalQ.lte('created_at', t);

        const [totalRes, byResultRes, byModalidadeRes, byTipoRes, seriesRes, byStageRes] = await Promise.all([
            totalQ,
            supabase.rpc('vagas_by_result',           rpcArgs),
            supabase.rpc('vagas_by_modalidade',        rpcArgs),
            supabase.rpc('vagas_by_tipo',              rpcArgs),
            supabase.rpc('vagas_series', { ...rpcArgs, bucket_size: bucket }),
            supabase.rpc('vagas_stages_distribution',  rpcArgs),
        ]);

        res.setHeader('Cache-Control', 'private, max-age=60');
        return res.status(200).json({
            total:         totalRes.count       ?? 0,
            by_result:     byResultRes.data     ?? [],
            by_modalidade: byModalidadeRes.data ?? [],
            by_tipo:       byTipoRes.data       ?? [],
            series:        seriesRes.data       ?? [],
            by_stage:      byStageRes.data      ?? [],
        });
    }

    // ── Queries paralelas ──────────────────────────────────────────
    const [
        pageviewsRes,
        uniqueRes,
        engagedRes,
        cvClickRes,
        contactRes,
        caseRes,
        emailRes,
        downloadsRes,
        seriesRes,
        topPagesRes,
        referrersRes,
        utmRes,
        devicesRes,
        countriesRes,
        recurringRes,
    ] = await Promise.all([
        // Total pageviews
        supabase.from('site_events')
            .select('id', { count: 'exact', head: true })
            .eq('event', 'pageview')
            .gte('occurred_at', f).lte('occurred_at', t),

        // Visitantes únicos (distinct visitor_id_hash) — contagem via rpc
        supabase.rpc('analytics_unique_visitors', { from_ts: f, to_ts: t }),

        // Engaged
        supabase.from('site_events')
            .select('id', { count: 'exact', head: true })
            .eq('event', 'engaged')
            .gte('occurred_at', f).lte('occurred_at', t),

        // CV download clicks
        supabase.from('site_events')
            .select('id', { count: 'exact', head: true })
            .eq('event', 'cv_download_click')
            .gte('occurred_at', f).lte('occurred_at', t),

        // Contact clicks
        supabase.from('site_events')
            .select('id', { count: 'exact', head: true })
            .eq('event', 'contact_click')
            .gte('occurred_at', f).lte('occurred_at', t),

        // Case opens
        supabase.from('site_events')
            .select('id', { count: 'exact', head: true })
            .eq('event', 'case_open')
            .gte('occurred_at', f).lte('occurred_at', t),

        // Email requests
        supabase.from('site_events')
            .select('id', { count: 'exact', head: true })
            .eq('event', 'email_request')
            .gte('occurred_at', f).lte('occurred_at', t),

        // Downloads reais (download_logs, excluindo entradas admin)
        supabase.from('download_logs')
            .select('id', { count: 'exact', head: true })
            .not('ip_address', 'like', 'admin-%')
            .gte('downloaded_at', f).lte('downloaded_at', t),

        // Série temporal — pageviews por dia
        supabase.rpc('analytics_series', { from_ts: f, to_ts: t }),

        // Top páginas
        supabase.rpc('analytics_top_pages', { from_ts: f, to_ts: t }),

        // Top referrers
        supabase.rpc('analytics_top_referrers', { from_ts: f, to_ts: t }),

        // UTM sources
        supabase.rpc('analytics_utm_sources', { from_ts: f, to_ts: t }),

        // Dispositivos
        supabase.rpc('analytics_devices', { from_ts: f, to_ts: t }),

        // Países
        supabase.rpc('analytics_countries', { from_ts: f, to_ts: t }),

        // Visitantes recorrentes
        supabase.rpc('analytics_recurring_visitors', { from_ts: f, to_ts: t }),
    ]);

    const pageviews       = pageviewsRes.count ?? 0;
    const unique_visitors = uniqueRes.data?.[0]?.count ?? 0;
    const engaged         = engagedRes.count ?? 0;
    const cv_clicks       = cvClickRes.count ?? 0;
    const cv_downloads    = downloadsRes.count ?? 0;

    const kpis = {
        pageviews,
        unique_visitors: Number(unique_visitors),
        engaged_rate: pageviews > 0 ? Math.round((engaged / pageviews) * 1000) / 10 : 0,
        cv_download_clicks: cv_clicks,
        email_requests: emailRes.count ?? 0,
        contact_clicks: contactRes.count ?? 0,
        case_opens: caseRes.count ?? 0,
        cv_downloads,
        conversion_rate: pageviews > 0 ? Math.round((cv_downloads / pageviews) * 1000) / 10 : 0,
        recurring_visitors: Number(recurringRes.data?.[0]?.count ?? 0),
    };

    return res.status(200).json({
        kpis,
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
