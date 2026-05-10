import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase, BUCKET } from '../_lib/supabase.js';
import { sendEmail } from '../_lib/email.js';
import { checkRateLimit } from '../_lib/rate-limit.js';

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const NAME_MAX = 100;
const MSG_MAX = 1500;

const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function clean(str) {
    if (typeof str !== 'string') return '';
    return str.replace(CONTROL_CHARS, '').trim();
}

// Assinatura visual injetada abaixo do corpo do email enviado pra recrutadores.
// Layout business-card premium: foto circular (mesma do hero do portfolio) +
// nome/cargo separado por barra cyan vertical + 4 contatos com SVG icons inline.
// SVG icons (Lucide-style) renderizam em Gmail/Apple Mail/iOS; em Outlook desktop
// degradam graciosamente (somem mas o texto + foto + layout continuam).
const EMAIL_SIGNATURE_HTML = `
<table cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
    <tr>
        <td style="padding:6px 20px 6px 0;vertical-align:top">
            <img src="https://github.com/brartacho.png" alt="Bruno Artacho" width="72" height="72" style="display:block;border-radius:50%;border:2px solid #22d3ee;width:72px;height:72px;object-fit:cover">
        </td>
        <td style="padding:6px 20px 6px 0;vertical-align:top;border-right:3px solid #22d3ee">
            <div style="font-weight:800;font-size:18px;color:#0f172a;letter-spacing:-0.4px;line-height:1.15">Bruno Artacho</div>
            <div style="color:#64748b;font-size:11px;margin-top:5px;font-weight:600;letter-spacing:1px;text-transform:uppercase">QA Analyst · Test Automation</div>
            <div style="color:#94a3b8;font-size:11px;margin-top:8px;font-weight:500">Playwright · Postman · Cursor + MCP</div>
        </td>
        <td style="padding:6px 0 6px 20px;vertical-align:top;font-size:13px;line-height:1.7;color:#475569">
            <div style="margin-bottom:2px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:8px"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <a href="https://artacho.dev" style="color:#0891b2;text-decoration:none;font-weight:500">artacho.dev</a>
            </div>
            <div style="margin-bottom:2px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:8px"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                <a href="mailto:br.artacho@gmail.com" style="color:#0891b2;text-decoration:none">br.artacho@gmail.com</a>
            </div>
            <div style="margin-bottom:2px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:8px"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                <a href="https://wa.me/5544984366533" style="color:#0891b2;text-decoration:none">+55 44 98436-6533</a>
            </div>
            <div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:8px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
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

    // Rate limit: max 20 envios/h por IP (admin é só 1 pessoa, isso é folga grande)
    const rl = await checkRateLimit({ req, scope: 'send-cv-email', max: 20, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) {
        res.setHeader('Retry-After', rl.retryAfterSec);
        return res.status(429).json({ error: `Limite atingido. Aguarde ${Math.ceil(rl.retryAfterSec / 60)} min.` });
    }

    const { cv_version_id, recipient_name, recipient_email, message } = req.body || {};

    const name = clean(recipient_name);
    const email = clean(recipient_email).toLowerCase();
    const msg = clean(message);

    if (!cv_version_id) return res.status(400).json({ error: 'cv_version_id obrigatório.' });
    if (name.length < 2 || name.length > NAME_MAX) return res.status(400).json({ error: `Nome inválido (2-${NAME_MAX} chars).` });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email do destinatário inválido.' });
    if (msg.length > MSG_MAX) return res.status(400).json({ error: `Mensagem muito longa (máx ${MSG_MAX} chars).` });
    if (/[\r\n]/.test(email) || /[\r\n]/.test(name)) return res.status(400).json({ error: 'Caracteres inválidos.' });

    const supabase = getSupabase();

    const { data: cv, error: cvErr } = await supabase
        .from('cv_versions')
        .select('id, name, file_path, file_name')
        .eq('id', cv_version_id)
        .single();

    if (cvErr || !cv) return res.status(404).json({ error: 'Versão de CV não encontrada.' });

    const { data: fileData, error: fileErr } = await supabase
        .storage
        .from(BUCKET())
        .download(cv.file_path);

    if (fileErr || !fileData) return res.status(500).json({ error: 'Erro ao buscar arquivo do storage.' });

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const base64 = buffer.toString('base64');

    const fromEmail = process.env.NOTIFY_EMAIL || 'br.artacho@gmail.com';
    const defaultMsg = `Olá ${name},\n\nConforme nossa conversa, segue meu currículo em anexo.\nEstou à disposição para conversarmos sobre a oportunidade.\n\nAtenciosamente,\nBruno Artacho`;
    const finalMsg = msg || defaultMsg;
    const finalHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; padding: 20px; color: #0f172a; line-height: 1.6;">
        ${escHtml(finalMsg).replace(/\n/g, '<br>')}
        ${EMAIL_SIGNATURE_HTML}
    </div>`;

    try {
        await sendEmail({
            to: email,
            replyTo: fromEmail,
            subject: `Currículo Bruno Artacho — ${cv.name}`,
            text: finalMsg,
            html: finalHtml,
            attachments: [{
                filename: cv.file_name,
                content: base64,
                contentType: 'application/pdf',
            }],
        });
    } catch (e) {
        if (e.code === 'EMAIL_NOT_CONFIGURED') {
            return res.status(503).json({ error: 'RESEND_API_KEY não configurado.' });
        }
        if (e.code === 'DOMAIN_NOT_VERIFIED') {
            return res.status(403).json({
                error: 'Resend em modo teste — só envia para o email do dono da conta. Verifique um domínio em https://resend.com/domains para enviar a destinatários externos.',
            });
        }
        return res.status(500).json({ error: e.message || 'Falha no envio.' });
    }

    // Log de envio (reaproveita download_logs com token_id null pra distinguir de download real)
    await supabase.from('download_logs').insert({
        cv_version_id: cv.id,
        ip_address: 'admin-send-email',
        user_agent: `Send to ${name} <${email}>`,
    }).then(() => {}, () => {});

    return res.status(200).json({
        message: `Currículo enviado para ${email}.`,
        cv_name: cv.name,
        recipient: { name, email },
    });
}
