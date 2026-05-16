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
 * Por padrão (`autoIncrement: true`) cada chamada conta como tentativa, o que
 * funciona pra ações administrativas (envio de email, etc). Pra login,
 * `autoIncrement: false` permite peek sem consumir slot — o handler chama
 * `recordRateLimitHit()` só nas tentativas falhas, evitando que logins
 * bem-sucedidos contem contra o usuário legítimo.
 *
 * Retorna { allowed, remaining, retryAfterSec }
 */
export async function checkRateLimit({ req, scope, max, windowMs, autoIncrement = true }) {
    const ip = clientIp(req);
    const key = `${scope}:${ip}`;
    let supabase;
    try {
        supabase = getSupabase();
    } catch {
        return { allowed: true, remaining: max, retryAfterSec: 0 };
    }

    const { data: rl } = await supabase
        .from('rate_limits')
        .select('attempts, window_start')
        .eq('ip_address', key)
        .single();

    const now = Date.now();

    if (!rl) {
        if (autoIncrement) {
            await supabase.from('rate_limits').insert({
                ip_address: key,
                attempts: 1,
                window_start: new Date(now).toISOString(),
            });
        }
        return { allowed: true, remaining: autoIncrement ? max - 1 : max, retryAfterSec: 0 };
    }

    const windowAge = now - new Date(rl.window_start).getTime();
    if (windowAge >= windowMs) {
        if (autoIncrement) {
            await supabase.from('rate_limits').update({
                attempts: 1,
                window_start: new Date(now).toISOString(),
            }).eq('ip_address', key);
        }
        return { allowed: true, remaining: autoIncrement ? max - 1 : max, retryAfterSec: 0 };
    }

    if (rl.attempts >= max) {
        return {
            allowed: false,
            remaining: 0,
            retryAfterSec: Math.ceil((windowMs - windowAge) / 1000),
        };
    }

    if (autoIncrement) {
        await supabase.from('rate_limits').update({ attempts: rl.attempts + 1 }).eq('ip_address', key);
    }
    return { allowed: true, remaining: max - rl.attempts - (autoIncrement ? 1 : 0), retryAfterSec: 0 };
}

/**
 * Registra uma tentativa falha — usado pelo handler quando peek (autoIncrement:false)
 * já liberou o request mas depois detectou falha. Mantém o counter consistente.
 */
export async function recordRateLimitHit({ req, scope, windowMs }) {
    const ip = clientIp(req);
    const key = `${scope}:${ip}`;
    let supabase;
    try {
        supabase = getSupabase();
    } catch { return; }

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
        return;
    }
    const windowAge = now - new Date(rl.window_start).getTime();
    if (windowAge >= windowMs) {
        await supabase.from('rate_limits').update({
            attempts: 1,
            window_start: new Date(now).toISOString(),
        }).eq('ip_address', key);
        return;
    }
    await supabase.from('rate_limits').update({ attempts: rl.attempts + 1 }).eq('ip_address', key);
}

/**
 * Defense-in-depth pro login: duas janelas em paralelo.
 *  - burst   : 5 falhas / 15min   (bloqueia ataques de força bruta rápidos)
 *  - daily   : 20 falhas / 24h    (bloqueia repeat offenders lentos)
 * Faz peek nas duas (não consome slot) — o handler chama `recordLoginFailure`
 * só quando a auth falha de fato.
 *
 * Retorna { allowed, retryAfterSec, scope } — scope identifica qual janela bloqueou.
 */
export async function checkLoginRateLimit(req) {
    const burst = await checkRateLimit({ req, scope: 'login',     max: 5,  windowMs: 15 * 60 * 1000,        autoIncrement: false });
    const daily = await checkRateLimit({ req, scope: 'login-day', max: 20, windowMs: 24 * 60 * 60 * 1000,   autoIncrement: false });
    if (!burst.allowed || !daily.allowed) {
        const blocking = !burst.allowed ? burst : daily;
        const scope = !burst.allowed ? 'login' : 'login-day';
        return { allowed: false, retryAfterSec: blocking.retryAfterSec, scope };
    }
    return { allowed: true, retryAfterSec: 0, scope: null };
}

export async function recordLoginFailure(req) {
    await Promise.all([
        recordRateLimitHit({ req, scope: 'login',     windowMs: 15 * 60 * 1000 }),
        recordRateLimitHit({ req, scope: 'login-day', windowMs: 24 * 60 * 60 * 1000 }),
    ]);
}
