import { createHash } from 'crypto';
import { getSupabase } from './_lib/supabase.js';

const ALLOWED_EVENTS = new Set([
    'pageview', 'cv_download_click', 'email_request',
    'contact_click', 'case_open', 'engaged',
]);

const BOT_RE = /bot|crawl|spider|preview|slack|telegram|whatsapp|facebook|twitter|linkedinbot|google-structured|bytespider|headless|puppet|playwright|cypress/i;

// Rate-limit em memória — máx 60 eventos/minuto por visitor_id_hash
const rateLimitMap = new Map();
const RL_WINDOW_MS = 60_000;
const RL_MAX = 60;

function checkRateLimit(hash) {
    const now = Date.now();
    const entry = rateLimitMap.get(hash);
    if (!entry || now - entry.start > RL_WINDOW_MS) {
        rateLimitMap.set(hash, { start: now, count: 1 });
        return true;
    }
    if (entry.count >= RL_MAX) return false;
    entry.count++;
    return true;
}

function parseDevice(ua) {
    if (!ua) return { device: 'unknown', browser: 'unknown', os: 'unknown' };
    const device =
        /Mobile|Android.*Mobile|iPhone|Windows Phone/i.test(ua) ? 'mobile' :
        /iPad|Tablet|Android(?!.*Mobile)/i.test(ua) ? 'tablet' : 'desktop';

    const browser =
        /Edg\//i.test(ua) ? 'Edge' :
        /OPR\//i.test(ua) ? 'Opera' :
        /Firefox\//i.test(ua) ? 'Firefox' :
        /SamsungBrowser\//i.test(ua) ? 'Samsung' :
        /Chrome\//i.test(ua) ? 'Chrome' :
        /Safari\//i.test(ua) ? 'Safari' : 'Other';

    const os =
        /Windows NT/i.test(ua) ? 'Windows' :
        /Mac OS X/i.test(ua) ? 'macOS' :
        /Android/i.test(ua) ? 'Android' :
        /iPhone|iPad/i.test(ua) ? 'iOS' :
        /Linux/i.test(ua) ? 'Linux' : 'Other';

    return { device, browser, os };
}

function parseReferrerHost(referrer) {
    if (!referrer) return null;
    try {
        const { hostname } = new URL(referrer);
        return hostname.replace(/^www\./, '') || null;
    } catch {
        return null;
    }
}

export default async function handler(req, res) {
    // GET — keep-alive / health check (cron job, servidor para servidor)
    if (req.method === 'GET') {
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret) {
            const auth = req.headers['authorization'];
            if (auth !== `Bearer ${cronSecret}`) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
        }
        const supabase = getSupabase();
        const cutoff365 = new Date(Date.now() - 365 * 86400000).toISOString();
        const cutoff730 = new Date(Date.now() - 730 * 86400000).toISOString();
        const [pingRes, cleanEventsRes, cleanLogsRes] = await Promise.allSettled([
            supabase.from('site_events').select('id', { count: 'exact', head: true })
                .gte('occurred_at', new Date(Date.now() - 86400000).toISOString()),
            supabase.from('site_events').delete({ count: 'exact' }).lt('occurred_at', cutoff365),
            supabase.from('download_logs').delete({ count: 'exact' }).lt('downloaded_at', cutoff730),
        ]);
        return res.status(200).json({
            ok: true,
            ts: new Date().toISOString(),
            events_24h:     pingRes.status       === 'fulfilled' ? (pingRes.value.count       ?? 0) : null,
            cleaned_events: cleanEventsRes.status === 'fulfilled' ? (cleanEventsRes.value.count ?? 0) : null,
            cleaned_logs:   cleanLogsRes.status   === 'fulfilled' ? (cleanLogsRes.value.count   ?? 0) : null,
        });
    }

    // POST — tracking de eventos (público, browser)
    res.setHeader('Access-Control-Allow-Origin', 'https://artacho.dev');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).end();

    const ua = req.headers['user-agent'] || '';
    if (!ua || BOT_RE.test(ua)) return res.status(204).end();

    const body = req.body || {};
    const { event, path, referrer, utm_source, utm_medium, utm_campaign, meta } = body;

    if (!ALLOWED_EVENTS.has(event)) return res.status(400).end();

    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    const country = req.headers['x-vercel-ip-country'] || null;

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const salt = (process.env.ANALYTICS_SALT || 'dev-salt') + today;
    const visitor_id_hash = createHash('sha256').update(ip + ua + salt).digest('hex');

    if (!checkRateLimit(visitor_id_hash)) return res.status(429).end();

    const { device, browser, os } = parseDevice(ua);
    const referrer_host = parseReferrerHost(referrer);

    try {
        const supabase = getSupabase();
        await supabase.from('site_events').insert({
            event,
            path: path ? String(path).slice(0, 500) : null,
            visitor_id_hash,
            referrer_host,
            utm_source:   utm_source   ? String(utm_source).slice(0, 200)   : null,
            utm_medium:   utm_medium   ? String(utm_medium).slice(0, 200)   : null,
            utm_campaign: utm_campaign ? String(utm_campaign).slice(0, 200) : null,
            device, browser, os, country,
            meta: meta && typeof meta === 'object' ? meta : null,
        });
    } catch {
        // Falha silenciosa — tracking nunca quebra o site
    }

    return res.status(204).end();
}
