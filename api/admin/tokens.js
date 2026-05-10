import { randomBytes, createHash } from 'crypto';
import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;

    const supabase = getSupabase();

    if (req.method === 'GET') {
        const { data, error } = await supabase
            .from('download_tokens')
            .select('id, label, expires_at, max_uses, use_count, revoked, created_at, cv_versions(name)')
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });

        // Compute status for each token
        const now = new Date();
        const enriched = data.map(t => ({
            ...t,
            status: t.revoked ? 'revogado'
                : new Date(t.expires_at) < now ? 'expirado'
                : (t.max_uses !== null && t.use_count >= t.max_uses) ? 'esgotado'
                : 'ativo',
        }));

        return res.status(200).json(enriched);
    }

    if (req.method === 'POST') {
        const { cv_version_id, label, expires_in_hours, expires_at_date, max_uses } = req.body || {};

        if (!cv_version_id) return res.status(400).json({ error: 'cv_version_id obrigatório' });
        if (!expires_in_hours && !expires_at_date) {
            return res.status(400).json({ error: 'Informe expires_in_hours ou expires_at_date' });
        }

        let expiresAt;
        if (expires_at_date) {
            expiresAt = new Date(expires_at_date);
        } else {
            expiresAt = new Date(Date.now() + Number(expires_in_hours) * 3600 * 1000);
        }

        if (isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
            return res.status(400).json({ error: 'Data de expiração inválida ou no passado' });
        }

        // Hex token: URL-safe sem caracteres que confundem markdown do WhatsApp/Telegram (`_`, `-`)
        const rawToken = randomBytes(24).toString('hex');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');

        const { data, error } = await supabase
            .from('download_tokens')
            .insert({
                token_hash: tokenHash,
                cv_version_id,
                label: label || null,
                expires_at: expiresAt.toISOString(),
                max_uses: max_uses || null,
                use_count: 0,
                revoked: false,
            })
            .select('id, label, expires_at, max_uses')
            .single();

        if (error) return res.status(500).json({ error: error.message });

        // Share URL: SEMPRE público (recrutador clica no celular dele).
        // Em dev, NEXT_PUBLIC_BASE_URL aponta pra localhost (usado em links de reset),
        // mas o link compartilhado precisa ser o domínio público.
        const baseUrl = process.env.PUBLIC_SHARE_URL
            || process.env.NEXT_PUBLIC_BASE_URL
            || 'https://bruno-artacho.vercel.app';
        const shareUrl = `${baseUrl}/cv?t=${rawToken}`;

        return res.status(201).json({
            ...data,
            token: rawToken,
            shareUrl,
        });
    }

    if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'ID obrigatório (query string)' });

        const { error } = await supabase.from('download_tokens').delete().eq('id', id);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ ok: true });
    }

    if (req.method === 'PATCH') {
        // Soft revoke (deixa o registro pra histórico)
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'ID obrigatório (query string)' });

        const { error } = await supabase
            .from('download_tokens')
            .update({ revoked: true })
            .eq('id', id);

        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
