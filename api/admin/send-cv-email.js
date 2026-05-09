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
    const defaultMsg = `Olá ${name},\n\nConforme combinado, segue meu currículo em anexo.\nDisponível para conversarmos.\n\nAtt,\nBruno Artacho\nartacho.dev`;
    const finalMsg = msg || defaultMsg;
    const finalHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; padding: 16px; color: #0f172a; line-height: 1.6;">
        ${escHtml(finalMsg).replace(/\n/g, '<br>')}
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
