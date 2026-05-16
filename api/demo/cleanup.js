import { getSupabaseDemo } from './_lib/session.js';

/**
 * Cron diário (3h BRT): deleta tudo > 24h em todas as tabelas demo_*.
 * Garante que dados de sessões antigas não acumulem.
 */
export default async function handler(req, res) {
    const auth = req.headers['authorization'];
    if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = getSupabaseDemo();
    const { data, error } = await supabase.rpc('demo_cleanup_expired');
    if (error) {
        console.error('[demo:cleanup] failed:', error.message);
        return res.status(500).json({ error: error.message });
    }
    console.log(`[demo:cleanup] deleted ${data} rows`);
    return res.status(200).json({ ok: true, deleted: data, ts: new Date().toISOString() });
}
