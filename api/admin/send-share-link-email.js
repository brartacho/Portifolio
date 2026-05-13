import { requireAdmin, cors } from '../_lib/auth.js';
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
                <a href="mailto:br.artacho@gmail.com" style="color:#0891b2;text-decoration:none">br.artacho@gmail.com</a>
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
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const rl = await checkRateLimit({ req, scope: 'send-share-email', max: 20, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) {
        res.setHeader('Retry-After', rl.retryAfterSec);
        return res.status(429).json({ error: `Limite atingido. Aguarde ${Math.ceil(rl.retryAfterSec / 60)} min.` });
    }

    const { share_url, recipient_email, expiry } = req.body || {};

    const email = (typeof recipient_email === 'string' ? recipient_email : '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'E-mail do destinatário inválido.' });
    if (!share_url || typeof share_url !== 'string') return res.status(400).json({ error: 'share_url obrigatório.' });

    const fromEmail = process.env.NOTIFY_EMAIL || 'br.artacho@gmail.com';
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
            return res.status(403).json({
                error: 'Resend em modo teste — só envia para o e-mail do dono da conta.',
            });
        }
        return res.status(500).json({ error: e.message || 'Falha no envio.' });
    }

    return res.status(200).json({ message: `Link enviado para ${email}.` });
}
