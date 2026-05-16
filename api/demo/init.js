import { getSessionId, getSupabaseDemo, cors, verifyTurnstile } from './_lib/session.js';
import { checkRateLimit, clientIp } from '../_lib/rate-limit.js';

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const session_id = getSessionId(req);
    if (!session_id) return res.status(400).json({ error: 'session_id inválido' });

    // Honeypot: campo invisível no form. Bot que preenche tudo = preenche também.
    if (req.body?.website) return res.status(403).json({ error: 'forbidden' });

    // Rate limit: max 3 inits/IP/hora
    const rl = await checkRateLimit({ req, scope: 'demo-init', max: 3, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) {
        res.setHeader('Retry-After', rl.retryAfterSec);
        return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos antes de iniciar nova sessão demo.' });
    }

    // CAPTCHA Cloudflare Turnstile
    const ip = clientIp(req);
    const ok = await verifyTurnstile(req.body?.cf_token, ip);
    if (!ok) return res.status(403).json({ error: 'Verificação anti-bot falhou. Recarregue a página e tente novamente.' });

    // Seed (idempotente)
    const supabase = getSupabaseDemo();
    const { error } = await supabase.rpc('demo_seed', { p_session_id: session_id });
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true, session_id });
}
