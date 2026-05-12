import { randomBytes, createHash } from 'crypto';
import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';

const ALLOWED_SORT = new Set(['label', 'expires_at', 'use_count', 'created_at']);
const MAX_LIMIT = 100;

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;

    const supabase = getSupabase();

    if (req.method === 'GET') {
        const {
            search = '',
            status = '',
            sort   = 'expires_at',
            dir    = 'asc',
            page   = '1',
            limit: limitParam = '25',
        } = req.query;

        const pageNum  = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(MAX_LIMIT, Math.max(1, parseInt(limitParam) || 25));
        const offset   = (pageNum - 1) * limitNum;
        const ascending = dir === 'asc';
        const sortCol  = ALLOWED_SORT.has(sort) ? sort : 'expires_at';

        const now = new Date().toISOString();

        let query = supabase
            .from('download_tokens')
            .select('id, label, expires_at, max_uses, use_count, revoked, created_at, cv_versions(name)', { count: 'exact' });

        // Search: label or cv name (cv name requires a sub-query workaround)
        if (search) {
            const s = search.replace(/[%_\\]/g, c => `\\${c}`);
            // Find cv_version ids whose name matches
            const { data: matchedCVs } = await supabase
                .from('cv_versions')
                .select('id')
                .ilike('name', `%${s}%`);
            const cvIds = matchedCVs?.map(c => c.id) || [];
            let orConds = `label.ilike.%${s}%`;
            if (cvIds.length) orConds += `,cv_version_id.in.(${cvIds.join(',')})`;
            query = query.or(orConds);
        }

        // Status filter — DB-level where possible
        if (status === 'revogado') {
            query = query.eq('revoked', true);
        } else if (status === 'expirado') {
            query = query.eq('revoked', false).lt('expires_at', now);
        } else if (status === 'ativo' || status === 'esgotado') {
            // Pre-filter: not revoked, not expired — then compute exact status below
            query = query.eq('revoked', false).gte('expires_at', now);
        }

        query = query.order(sortCol, { ascending }).range(offset, offset + limitNum - 1);

        const { data, error, count } = await query;
        if (error) return res.status(500).json({ error: error.message });

        // Enrich with computed status
        const enriched = (data ?? []).map(t => ({
            ...t,
            status: t.revoked ? 'revogado'
                : new Date(t.expires_at) < new Date() ? 'expirado'
                : (t.max_uses !== null && t.use_count >= t.max_uses) ? 'esgotado'
                : 'ativo',
        }));

        // Post-filter for ativo/esgotado (DB pre-filter already narrows the set)
        const filtered = (status === 'ativo' || status === 'esgotado')
            ? enriched.filter(t => t.status === status)
            : enriched;

        return res.status(200).json({
            data:  filtered,
            total: count ?? 0,
            page:  pageNum,
            limit: limitNum,
            pages: Math.ceil((count ?? 0) / limitNum),
        });
    }

    if (req.method === 'POST') {
        const { cv_version_id, label, expires_in_hours, expires_at_date, max_uses, empresa, vaga, notas, contato } = req.body || {};

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

        const rawToken = randomBytes(24).toString('hex');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');

        const { data, error } = await supabase
            .from('download_tokens')
            .insert({
                token_hash: tokenHash,
                cv_version_id,
                label:   label   || null,
                empresa: empresa ? String(empresa).trim().slice(0, 200) : null,
                vaga:    vaga    ? String(vaga).trim().slice(0, 200)    : null,
                notas:   notas   ? String(notas).trim().slice(0, 500)   : null,
                contato: contato ? String(contato).trim().slice(0, 300) : null,
                expires_at: expiresAt.toISOString(),
                max_uses: max_uses || null,
                use_count: 0,
                revoked: false,
            })
            .select('id, label, expires_at, max_uses')
            .single();

        if (error) return res.status(500).json({ error: error.message });

        const baseUrl = process.env.PUBLIC_SHARE_URL
            || process.env.NEXT_PUBLIC_BASE_URL
            || 'https://artacho.dev';
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
