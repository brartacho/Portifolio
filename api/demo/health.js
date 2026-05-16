import { getSupabaseDemo } from './_lib/session.js';

const WARN_THRESHOLD      = 30000;
const EMERGENCY_THRESHOLD = 50000;
const PANIC_THRESHOLD     = 80000;

/**
 * Circuit breaker: a cada 10 min, checa total de rows em demo_*.
 * - > 30k → warn (log)
 * - > 50k → emergency_cleanup (deleta tudo > 1h)
 * - > 80k → full_wipe (zera tudo)
 */
export default async function handler(req, res) {
    const auth = req.headers['authorization'];
    if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = getSupabaseDemo();
    const { data: total, error } = await supabase.rpc('demo_total_rows');
    if (error) {
        console.error('[demo:health] failed:', error.message);
        return res.status(500).json({ error: error.message });
    }

    let action = 'ok';
    let deleted = 0;

    if (total > PANIC_THRESHOLD) {
        const { data: d } = await supabase.rpc('demo_full_wipe');
        deleted = d ?? 0;
        action = 'full_wipe';
        console.error(`[demo:health] PANIC — total=${total}, wiped ${deleted} rows`);
    } else if (total > EMERGENCY_THRESHOLD) {
        const { data: d } = await supabase.rpc('demo_emergency_cleanup');
        deleted = d ?? 0;
        action = 'emergency';
        console.error(`[demo:health] EMERGENCY — total=${total}, cleaned ${deleted} rows > 1h`);
    } else if (total > WARN_THRESHOLD) {
        action = 'warn';
        console.warn(`[demo:health] WARN — total=${total} rows (limite emergência: ${EMERGENCY_THRESHOLD})`);
    }

    return res.status(200).json({ ok: true, total, action, deleted, ts: new Date().toISOString() });
}
