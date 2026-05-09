import { getSupabase } from './supabase.js';

export function clientIp(req) {
    return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
        .toString()
        .split(',')[0]
        .trim();
}

/**
 * Token-bucket simples por (ip + scope), reaproveita a tabela `rate_limits`
 * (que tem PK em ip_address). Pra suportar múltiplos escopos, prefixamos o IP.
 *
 * Retorna { allowed, remaining, retryAfterSec }
 */
export async function checkRateLimit({ req, scope, max, windowMs }) {
    const ip = clientIp(req);
    const key = `${scope}:${ip}`;
    const supabase = getSupabase();

    const { data: rl } = await supabase
        .from('rate_limits')
        .select('attempts, window_start')
        .eq('ip_address', key)
        .single();

    const now = Date.now();

    if (!rl) {
        await supabase.from('rate_limits').insert({
            ip_address: key,
            attempts: 1,
            window_start: new Date(now).toISOString(),
        });
        return { allowed: true, remaining: max - 1, retryAfterSec: 0 };
    }

    const windowAge = now - new Date(rl.window_start).getTime();
    if (windowAge >= windowMs) {
        await supabase.from('rate_limits').update({
            attempts: 1,
            window_start: new Date(now).toISOString(),
        }).eq('ip_address', key);
        return { allowed: true, remaining: max - 1, retryAfterSec: 0 };
    }

    if (rl.attempts >= max) {
        return {
            allowed: false,
            remaining: 0,
            retryAfterSec: Math.ceil((windowMs - windowAge) / 1000),
        };
    }

    await supabase.from('rate_limits').update({ attempts: rl.attempts + 1 }).eq('ip_address', key);
    return { allowed: true, remaining: max - rl.attempts - 1, retryAfterSec: 0 };
}
