import { sendEmail } from '../_lib/email.js';
import { checkRateLimit, clientIp } from '../_lib/rate-limit.js';

const LIMITS = {
    name:    { min: 2,  max: 100 },
    company: { min: 0,  max: 100 },
    email:   { min: 5,  max: 120 },
    message: { min: 10, max: 1000 },
};

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Construímos as regex via RegExp + escape strings para evitar problemas
// quando o arquivo é salvo (chars de controle literais quebram o parser).
//
// CONTROL_CHARS:    ASCII U+0000-U+0008, U+000B, U+000C, U+000E-U+001F, U+007F
//                   (mantém TAB U+0009, LF U+000A, CR U+000D)
// INVISIBLE_CHARS:  Zero-width (U+200B-U+200D), bidi/overrides (U+202A-U+202E),
//                   word joiner (U+2060), BOM (U+FEFF)
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');
const INVISIBLE_CHARS = new RegExp('[\\u200B-\\u200D\\u202A-\\u202E\\u2060\\uFEFF]', 'g');

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeText(str) {
    if (typeof str !== 'string') return '';
    return str.replace(CONTROL_CHARS, '').replace(INVISIBLE_CHARS, '').trim();
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Rate limit: 3 envios por hora por IP
    const rl = await checkRateLimit({ req, scope: 'cv-request', max: 3, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) {
        res.setHeader('Retry-After', rl.retryAfterSec);
        return res.status(429).json({ error: `Muitas solicitações. Aguarde ${Math.ceil(rl.retryAfterSec / 60)} minuto(s).` });
    }

    const body = req.body || {};

    // Honeypot: campo invisível pra bots — se preenchido, finge sucesso (não revela detecção)
    if (body.website) return res.status(200).json({ message: 'Solicitação recebida.' });

    const name    = sanitizeText(body.name);
    const company = sanitizeText(body.company);
    const email   = sanitizeText(body.email).toLowerCase();
    const message = sanitizeText(body.message);

    const errors = [];
    if (name.length < LIMITS.name.min || name.length > LIMITS.name.max) errors.push(`Nome inválido (${LIMITS.name.min}-${LIMITS.name.max} chars).`);
    if (company.length > LIMITS.company.max) errors.push(`Empresa muito longa (máx ${LIMITS.company.max}).`);
    if (email.length < LIMITS.email.min || email.length > LIMITS.email.max || !EMAIL_RE.test(email)) errors.push('Email inválido.');
    if (message.length < LIMITS.message.min || message.length > LIMITS.message.max) errors.push(`Mensagem inválida (${LIMITS.message.min}-${LIMITS.message.max} chars).`);
    if (/[\r\n]/.test(email) || /[\r\n]/.test(name) || /[\r\n]/.test(company)) errors.push('Caracteres inválidos.');

    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const ip = clientIp(req);
    const ua = (req.headers['user-agent'] || '').slice(0, 200);
    const ts = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // CTA: link pro admin com dados do recrutador pré-preenchidos.
    // Em prod, PUBLIC_SHARE_URL aponta pro domínio público; em dev cai pra localhost.
    const baseUrl = process.env.PUBLIC_SHARE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://bruno-artacho.vercel.app';
    const adminParams = new URLSearchParams({
        to_name: name,
        to_email: email,
        ...(company ? { to_company: company } : {}),
    }).toString();
    const adminReplyUrl = `${baseUrl}/admin?${adminParams}`;

    const text = [
        '═══ Nova solicitação de CV ═══',
        '',
        `Nome:    ${name}`,
        `Empresa: ${company || '—'}`,
        `Email:   ${email}`,
        '',
        'Mensagem:',
        message,
        '',
        '─────────────────────────────',
        `Responder no painel admin (já pré-preenchido):`,
        adminReplyUrl,
        '',
        `IP: ${ip}`,
        `UA: ${ua}`,
        `Quando: ${ts}`,
    ].join('\n');

    const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #0f172a; margin-bottom: 16px;">📩 Nova solicitação de CV</h2>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr><td style="padding: 6px 0; color: #64748b; width: 90px;">Nome</td><td style="padding: 6px 0; color: #0f172a;"><strong>${escHtml(name)}</strong></td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Empresa</td><td style="padding: 6px 0; color: #0f172a;">${escHtml(company || '—')}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Email</td><td style="padding: 6px 0;"><a href="mailto:${escHtml(email)}" style="color: #0891b2;">${escHtml(email)}</a></td></tr>
            </table>
            <h3 style="color: #0f172a; margin: 24px 0 8px; font-size: 14px;">Mensagem</h3>
            <div style="background: #f1f5f9; border-left: 3px solid #22d3ee; padding: 14px 16px; border-radius: 6px; color: #334155; font-size: 14px; line-height: 1.55; white-space: pre-wrap;">${escHtml(message)}</div>

            <div style="margin: 28px 0 8px; text-align: center;">
                <a href="${escHtml(adminReplyUrl)}" style="display: inline-block; background: #0f172a; color: #ffffff; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 14px;">
                    📨 Abrir no painel para responder
                </a>
            </div>
            <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 8px;">
                Já com o destinatário pré-preenchido — escolhe a versão e envia.
            </p>

            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;">
            <p style="color: #94a3b8; font-size: 12px; line-height: 1.5;">
                IP: <code>${escHtml(ip)}</code><br>
                User-Agent: <code>${escHtml(ua)}</code><br>
                ${escHtml(ts)}
            </p>
        </div>
    `;

    try {
        await sendEmail({
            to: process.env.NOTIFY_EMAIL,
            subject: `[CV] ${name}${company ? ' · ' + company : ''}`,
            text,
            html,
        });
    } catch (e) {
        if (e.code === 'EMAIL_NOT_CONFIGURED') {
            return res.status(503).json({ error: 'Envio de email indisponível no momento. Tente pelo WhatsApp.' });
        }
        return res.status(500).json({ error: 'Falha ao enviar. Tente novamente em alguns minutos.' });
    }

    return res.status(200).json({ message: 'Solicitação enviada! Vou te responder em poucas horas no email informado.' });
}
