import { cors } from './_lib/session.js';

/**
 * Devolve config pública da demo (Turnstile sitekey).
 * Sem session_id obrigatório — esta é a primeira request, antes do login.
 */
export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).end();

    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json({
        turnstile_sitekey: process.env.TURNSTILE_SITE_KEY || null,
    });
}
