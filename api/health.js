import { getSupabase } from './_lib/supabase.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'GET') return res.status(405).end();

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
        supabase
            .from('site_events')
            .select('id', { count: 'exact', head: true })
            .gte('occurred_at', new Date(Date.now() - 86400000).toISOString()),

        supabase
            .from('site_events')
            .delete({ count: 'exact' })
            .lt('occurred_at', cutoff365),

        supabase
            .from('download_logs')
            .delete({ count: 'exact' })
            .lt('downloaded_at', cutoff730),
    ]);

    return res.status(200).json({
        ok: true,
        ts: new Date().toISOString(),
        events_24h:     pingRes.status       === 'fulfilled' ? (pingRes.value.count       ?? 0) : null,
        cleaned_events: cleanEventsRes.status === 'fulfilled' ? (cleanEventsRes.value.count ?? 0) : null,
        cleaned_logs:   cleanLogsRes.status   === 'fulfilled' ? (cleanLogsRes.value.count   ?? 0) : null,
    });
}
