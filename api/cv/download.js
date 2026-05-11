import { createHash } from 'crypto';
import { getSupabase, BUCKET } from '../_lib/supabase.js';
import { notifyDownload } from '../_lib/notify.js';
import { normalizeFileName } from '../_lib/filename.js';

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Allow', 'GET');
        return res.status(204).end();
    }
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { t: rawToken } = req.query;
    if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 10) {
        return res.status(400).json({ error: 'Token inválido' });
    }

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    let supabase;
    try {
        supabase = getSupabase();
    } catch {
        return res.status(503).json({ error: 'Serviço temporariamente indisponível.' });
    }

    // Rate limit check
    const { data: rl } = await supabase
        .from('rate_limits')
        .select('attempts, window_start')
        .eq('ip_address', ip)
        .single();

    if (rl) {
        const windowAge = Date.now() - new Date(rl.window_start).getTime();
        if (windowAge < RATE_LIMIT_WINDOW_MS && rl.attempts >= RATE_LIMIT_MAX) {
            return res.status(429).json({ error: 'Muitas tentativas. Tente novamente mais tarde.' });
        }
        if (windowAge >= RATE_LIMIT_WINDOW_MS) {
            // Reset window
            await supabase.from('rate_limits').update({ attempts: 1, window_start: new Date().toISOString() }).eq('ip_address', ip);
        } else {
            await supabase.from('rate_limits').update({ attempts: rl.attempts + 1 }).eq('ip_address', ip);
        }
    } else {
        await supabase.from('rate_limits').insert({ ip_address: ip, attempts: 1, window_start: new Date().toISOString() });
    }

    // Hash the token
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    // Look up token
    const { data: token, error: tokenErr } = await supabase
        .from('download_tokens')
        .select('id, cv_version_id, label, expires_at, max_uses, use_count, revoked, cv_versions(name, file_path, file_name)')
        .eq('token_hash', tokenHash)
        .single();

    if (tokenErr || !token) {
        return res.status(404).json({ error: 'Link inválido ou não encontrado.' });
    }
    if (token.revoked) {
        return res.status(410).json({ error: 'Este link foi revogado.' });
    }
    if (new Date(token.expires_at) < new Date()) {
        return res.status(410).json({ error: 'Este link expirou.' });
    }
    if (token.max_uses !== null && token.use_count >= token.max_uses) {
        return res.status(410).json({ error: 'Este link já atingiu o número máximo de usos.' });
    }

    const cv = token.cv_versions;
    if (!cv) {
        return res.status(500).json({ error: 'Currículo não encontrado.' });
    }

    // Atomic increment — prevents race conditions
    const { error: updateErr } = await supabase
        .from('download_tokens')
        .update({ use_count: token.use_count + 1 })
        .eq('id', token.id)
        .lte('use_count', token.max_uses !== null ? token.max_uses - 1 : 999999);

    if (updateErr) {
        return res.status(410).json({ error: 'Este link já atingiu o número máximo de usos.' });
    }

    // Log the download — snapshots preservam nome e ID mesmo após exclusão do CV
    await supabase.from('download_logs').insert({
        token_id: token.id,
        cv_version_id: token.cv_version_id,
        cv_name_snapshot: cv.name,
        cv_id_snapshot: token.cv_version_id,
        ip_address: ip,
        user_agent: req.headers['user-agent'] || '',
    });

    // Fetch PDF from private Supabase Storage
    const { data: fileData, error: fileErr } = await supabase
        .storage
        .from(BUCKET())
        .download(cv.file_path);

    if (fileErr || !fileData) {
        return res.status(500).json({ error: 'Erro ao buscar o arquivo.' });
    }

    // Fire-and-forget notification
    notifyDownload({
        label: token.label,
        cvName: cv.name,
        ip,
        useCount: token.use_count + 1,
        maxUses: token.max_uses,
        expiresAt: token.expires_at,
    }).catch(() => {});

    // Stream the PDF to the client — never expose storage URL
    const buffer = Buffer.from(await fileData.arrayBuffer());

    // Aplica normalize defensivamente (cobre entradas antigas no DB sem normalize)
    const safeFileName = normalizeFileName(cv.file_name);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(buffer);
}
