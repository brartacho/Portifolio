import { randomBytes, createHash } from 'crypto';
import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { sendEmail } from '../_lib/email.js';
import { checkRateLimit } from '../_lib/rate-limit.js';

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const EMAIL_SIGNATURE_HTML = `
<table cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
    <tr>
        <td style="padding:6px 20px 6px 0;vertical-align:top">
            <img src="https://github.com/brartacho.png" alt="Bruno Artacho" width="72" height="72" style="display:block;border-radius:50%;border:2px solid #22d3ee;width:72px;height:72px;object-fit:cover">
        </td>
        <td style="padding:6px 20px 6px 0;vertical-align:top;border-right:3px solid #22d3ee">
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-weight:700;font-size:21px;color:#0f172a;letter-spacing:-0.3px;line-height:1.1">Bruno Artacho</div>
            <div style="color:#64748b;font-size:10px;margin-top:8px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase">QA Analyst · Test Automation</div>
            <div style="color:#94a3b8;font-size:11px;margin-top:10px;font-weight:500;font-style:italic">Playwright · Postman · Cursor + MCP</div>
        </td>
        <td style="padding:6px 0 6px 20px;vertical-align:top;font-size:13px;line-height:1.7;color:#475569">
            <div style="margin-bottom:2px">
                <a href="mailto:bruno@artacho.dev" style="color:#0891b2;text-decoration:none">bruno@artacho.dev</a>
            </div>
            <div style="margin-bottom:2px">
                <a href="https://wa.me/5544984366533" style="color:#0891b2;text-decoration:none">+55 44 98436-6533</a>
            </div>
            <div>
                <span>Maringá, PR · Brasil</span>
            </div>
        </td>
    </tr>
    <tr>
        <td colspan="3" style="padding-top:18px">
            <div style="border-top:1px solid #e2e8f0;padding-top:12px;font-family:'Courier New',monospace;font-size:10px;color:#94a3b8;letter-spacing:1.5px">
                <span style="color:#22d3ee">//</span> ARTACHO.dev
            </div>
        </td>
    </tr>
</table>`;

export default async function handler(req, res) {
    cors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!await requireAdmin(req, res)) return;

    const supabase = getSupabase();

    if (req.method === 'POST' && req.query.action === 'send-email') {
        const rl = await checkRateLimit({ req, scope: 'send-share-email', max: 20, windowMs: 60 * 60 * 1000 });
        if (!rl.allowed) {
            res.setHeader('Retry-After', rl.retryAfterSec);
            return res.status(429).json({ error: `Limite atingido. Aguarde ${Math.ceil(rl.retryAfterSec / 60)} min.` });
        }

        const { share_url, recipient_email, expiry } = req.body || {};
        const email = (typeof recipient_email === 'string' ? recipient_email : '').trim().toLowerCase();
        if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'E-mail do destinatário inválido.' });
        if (!share_url || typeof share_url !== 'string') return res.status(400).json({ error: 'share_url obrigatório.' });

        const fromEmail = process.env.NOTIFY_EMAIL || 'bruno@artacho.dev';
        const expiryLine = expiry
            ? `<p style="margin:0 0 16px;color:#475569">Disponível até ${escHtml(String(expiry))}.</p>`
            : '';

        const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;padding:20px;color:#0f172a;line-height:1.6">
            <p style="margin:0 0 16px">Olá!</p>
            <p style="margin:0 0 8px">Segue o link para meu currículo:</p>
            <p style="margin:0 0 16px"><a href="${escHtml(share_url)}" style="color:#0891b2">${escHtml(share_url)}</a></p>
            ${expiryLine}
            ${EMAIL_SIGNATURE_HTML}
        </div>`;

        try {
            await sendEmail({
                to: email,
                replyTo: fromEmail,
                subject: 'Currículo Bruno Artacho — QA',
                html,
            });
        } catch (e) {
            if (e.code === 'EMAIL_NOT_CONFIGURED') {
                return res.status(503).json({ error: 'RESEND_API_KEY não configurado.' });
            }
            if (e.code === 'DOMAIN_NOT_VERIFIED') {
                return res.status(403).json({ error: 'Resend em modo teste — só envia para o e-mail do dono da conta.' });
            }
            return res.status(500).json({ error: e.message || 'Falha no envio.' });
        }

        return res.status(200).json({ message: `Link enviado para ${email}.` });
    }

    if (req.method === 'GET') {
        const { data, error } = await supabase
            .from('download_tokens')
            .select('id, label, expires_at, max_uses, use_count, revoked, created_at, cv_versions(name)')
            .order('expires_at', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });

        const enriched = (data ?? []).map(t => ({
            ...t,
            status: t.revoked ? 'revogado'
                : new Date(t.expires_at) < new Date() ? 'expirado'
                : (t.max_uses !== null && t.use_count >= t.max_uses) ? 'esgotado'
                : 'ativo',
        }));

        return res.status(200).json(enriched);
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
