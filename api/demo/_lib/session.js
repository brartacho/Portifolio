import { createHash } from 'crypto';
import { getSupabase } from '../../_lib/supabase.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Extrai e valida session_id do header X-Demo-Session ou query ?session= */
export function getSessionId(req) {
    const sid = req.headers['x-demo-session'] || req.query?.session;
    if (!sid || typeof sid !== 'string') return null;
    if (!UUID_RE.test(sid)) return null;
    return sid.toLowerCase();
}

/** Cliente Supabase para o ambiente demo (mesma instância de produção) */
export { getSupabase as getSupabaseDemo };

/**
 * LGPD: hash anônimo de IP com salt diário rotativo.
 * Mesma estratégia já usada em produção (visitor_id_hash em site_events).
 * Irreversível. Permite identificar visitantes recorrentes no mesmo dia.
 */
export function hashIP(ip) {
    if (!ip) return null;
    const dailyKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const salt = (process.env.ANALYTICS_SALT || 'dev-salt') + dailyKey;
    return 'ip:' + createHash('sha256').update(String(ip) + salt).digest('hex').slice(0, 8);
}

/** CORS aberto para o domínio público */
export function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', 'https://artacho.dev');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Demo-Session');
}

/**
 * Validação Cloudflare Turnstile no backend.
 * Se TURNSTILE_SECRET não estiver setado (dev local), faz bypass.
 */
export async function verifyTurnstile(token, ip) {
    if (!process.env.TURNSTILE_SECRET) return true;
    if (!token) return false;
    try {
        const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                secret: process.env.TURNSTILE_SECRET,
                response: token,
                remoteip: ip || '',
            }),
        });
        const json = await r.json();
        return json.success === true;
    } catch {
        return false;
    }
}

/** Sanitização básica de strings (remove control chars + invisíveis/bidi, limita tamanho) */
const CONTROL_CHARS   = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');
// Zero-width, overrides/embeddings/isolates bidi, word joiner e BOM — usados para
// ocultar/ofuscar conteúdo (ex.: payloads de injeção, spoofing).
const INVISIBLE_CHARS = new RegExp('[\\u200B-\\u200D\\u202A-\\u202E\\u2060\\u2066-\\u2069\\uFEFF]', 'g');
export function clean(str, max = 500) {
    if (typeof str !== 'string') return null;
    return str.replace(CONTROL_CHARS, '').replace(INVISIBLE_CHARS, '').trim().slice(0, max) || null;
}
