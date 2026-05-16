import { getSessionId, cors } from './_lib/session.js';

/**
 * Analytics da demo: dados estáticos fake.
 * Não consulta site_events de produção. Cada sessão demo vê os mesmos números.
 * Período aceito: 1, 7, 30, 90, 365 dias (apenas afeta o multiplicador visual).
 */
export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const session_id = getSessionId(req);
    if (!session_id) return res.status(400).json({ error: 'session_id obrigatório' });

    const period = Math.max(1, Math.min(365, parseInt(req.query.period) || 7));

    // Base de 7 dias; escala proporcionalmente para outros períodos
    const baseKpis = { pageviews: 247, unique: 12, engaged: 86, cv_clicks: 18, downloads: 11, recurring: 8 };
    const scale = period / 7;

    const kpis = {
        pageviews:          Math.round(baseKpis.pageviews * scale),
        unique_visitors:    Math.round(baseKpis.unique * scale),
        engaged_rate:       Math.round((baseKpis.engaged / baseKpis.pageviews) * 1000) / 10,
        cv_download_clicks: Math.round(baseKpis.cv_clicks * scale),
        email_requests:     Math.round(2 * scale),
        contact_clicks:     Math.round(9 * scale),
        case_opens:         Math.round(15 * scale),
        cv_downloads:       Math.round(baseKpis.downloads * scale),
        conversion_rate:    Math.round((baseKpis.downloads / baseKpis.pageviews) * 1000) / 10,
        recurring_visitors: Math.round(baseKpis.recurring * scale),
    };

    // Série temporal: N pontos (N = period)
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const series = [];
    const seedValues = [34, 51, 28, 67, 43, 89, 57, 41, 62, 38, 71, 49, 55, 83];
    for (let i = period - 1; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000);
        const pv = seedValues[(period - 1 - i) % seedValues.length];
        series.push({
            bucket: d.toISOString().slice(0, 10),
            pageviews: pv,
            unique_visitors: Math.max(1, Math.round(pv * 0.18)),
        });
    }

    return res.json({
        kpis,
        series,
        top_pages: [
            { path: '/',          count: Math.round(120 * scale) },
            { path: '/cv',        count: Math.round(45 * scale) },
            { path: '/case/qa',   count: Math.round(28 * scale) },
            { path: '/privacidade', count: Math.round(6 * scale) },
        ],
        top_referrers: [
            { host: 'linkedin.com', count: Math.round(68 * scale) },
            { host: 'github.com',   count: Math.round(34 * scale) },
            { host: 'google.com',   count: Math.round(22 * scale) },
            { host: '(direto)',     count: Math.round(123 * scale) },
        ],
        utm_sources: [
            { source: 'linkedin',  count: Math.round(45 * scale) },
            { source: 'github',    count: Math.round(18 * scale) },
            { source: 'email',     count: Math.round(7 * scale) },
        ],
        devices: [
            { name: 'desktop', count: Math.round(178 * scale) },
            { name: 'mobile',  count: Math.round(59 * scale) },
            { name: 'tablet',  count: Math.round(10 * scale) },
        ],
        countries: [
            { name: 'BR', count: Math.round(231 * scale) },
            { name: 'PT', count: Math.round(8 * scale) },
            { name: 'US', count: Math.round(8 * scale) },
        ],
        latest_visits: [
            { occurred_at: new Date(Date.now() - 5  * 60 * 1000).toISOString(), browser: 'Chrome',  device: 'desktop', country: 'BR', host: 'linkedin.com',  visitor_id_hash: 'a3f2b8c1', is_admin: false },
            { occurred_at: new Date(Date.now() - 22 * 60 * 1000).toISOString(), browser: 'Safari',  device: 'mobile',  country: 'BR', host: 'github.com',    visitor_id_hash: 'e5f6g7h8', is_admin: false },
            { occurred_at: new Date(Date.now() - 1  * 60 * 60 * 1000).toISOString(), browser: 'Edge',    device: 'desktop', country: 'BR', host: '(direto)',    visitor_id_hash: 'i9j0k1l2', is_admin: false },
            { occurred_at: new Date(Date.now() - 3  * 60 * 60 * 1000).toISOString(), browser: 'Firefox', device: 'desktop', country: 'PT', host: 'google.com',   visitor_id_hash: 'm3n4o5p6', is_admin: false },
        ],
        latest_cv_clicks: [
            { occurred_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), browser: 'Chrome',  device: 'desktop', country: 'BR', visitor_id_hash: 'a3f2b8c1', is_admin: false },
            { occurred_at: new Date(Date.now() - 4  * 60 * 60 * 1000).toISOString(), browser: 'Safari',  device: 'mobile',  country: 'BR', visitor_id_hash: 'e5f6g7h8', is_admin: false },
        ],
        funnel: {
            pageview:    kpis.pageviews,
            engaged:     baseKpis.engaged * scale | 0,
            cv_click:    kpis.cv_download_clicks,
            cv_download: kpis.cv_downloads,
        },
        period_days: period,
    });
}
