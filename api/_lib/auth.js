import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { parseCookies } from './cookies.js';
import { getSupabase } from './supabase.js';
import { notifySecurityEvent } from './notify.js';

function computeDfp(req) {
    const ua = req.headers['user-agent'] || '';
    const lang = req.headers['accept-language'] || '';
    return createHash('sha256').update(`${ua}|${lang}`).digest('hex');
}

export async function requireAdmin(req, res) {
    const cookies = parseCookies(req);
    const cookieToken = cookies['admin_session'] || null;
    const authHeader = req.headers['authorization'] || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const token = cookieToken || bearerToken;
    const fromCookie = Boolean(cookieToken);

    if (!token) {
        res.status(401).json({ error: 'Unauthorized' });
        return false;
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        res.status(401).json({ error: 'Token inválido ou expirado' });
        return false;
    }

    // Bearer (service tokens/testes) → só valida assinatura, sem JTI/dfp
    if (!fromCookie || !decoded.jti) return true;

    let supabase;
    try { supabase = getSupabase(); } catch {
        res.status(503).json({ error: 'Serviço indisponível' });
        return false;
    }

    const { data: session } = await supabase
        .from('admin_sessions')
        .select('jti, device_fingerprint, country_code, revoked_at')
        .eq('jti', decoded.jti)
        .maybeSingle();

    if (!session || session.revoked_at) {
        res.status(401).json({ error: 'Sessão inválida ou revogada' });
        return false;
    }

    // Device fingerprint — rejeita se mudar (outro browser/device)
    if (decoded.dfp && decoded.dfp !== computeDfp(req)) {
        res.status(401).json({ error: 'Sessão inválida (dispositivo diferente)' });
        return false;
    }

    // Detecção de mudança de país (cf-ipcountry header do Cloudflare)
    const currentCountry = req.headers['cf-ipcountry'] || null;
    if (session.country_code && currentCountry && session.country_code !== currentCountry) {
        notifySecurityEvent({
            kind: 'session_country_change',
            ip: req.headers['x-forwarded-for'] || 'unknown',
            ua: req.headers['user-agent'],
            country: currentCountry,
            details: `criada em ${session.country_code}, request de ${currentCountry}`,
        });
        await supabase.from('admin_sessions').update({
            revoked_at: new Date().toISOString(),
            revoke_reason: `country_change:${session.country_code}→${currentCountry}`,
        }).eq('jti', decoded.jti);
        res.status(401).json({ error: 'Sessão encerrada por mudança de localização. Faça login novamente.' });
        return false;
    }

    // Atualiza last_seen_at — fire-and-forget
    supabase.from('admin_sessions')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('jti', decoded.jti)
        .then(() => {}).catch(() => {});

    return true;
}

// Origens permitidas a chamar a API admin. Mantém artacho.dev + www + previews
// Vercel do próprio projeto (deploys preview têm sufixo *.vercel.app). Em DEV
// local, libera localhost/127.0.0.1 em qualquer porta. Qualquer outra origem
// (inclusive bots LLM externos) não recebe o header ACAO e o browser bloqueia.
const ALLOWED_ORIGINS = [
    'https://artacho.dev',
    'https://www.artacho.dev',
];

function isAllowedOrigin(origin) {
    if (!origin) return false;
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    // Previews Vercel do projeto: brartacho-*.vercel.app ou portfolio-*.vercel.app
    if (/^https:\/\/(brartacho|portfolio)[a-z0-9-]*\.vercel\.app$/i.test(origin)) return true;
    // DEV local
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
    return false;
}

export function cors(req, res) {
    const origin = req?.headers?.origin;
    if (isAllowedOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
