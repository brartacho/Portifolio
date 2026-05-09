import { randomBytes, createHash } from 'crypto';
import { cors } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { sendEmail } from '../_lib/email.js';
import { checkRateLimit } from '../_lib/rate-limit.js';

const RESET_WINDOW_MS = 60 * 60 * 1000; // 1h

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Limite agressivo: 3 envios por IP por hora — evita spammar o Gmail
    const rl = await checkRateLimit({ req, scope: 'forgot', max: 3, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) {
        res.setHeader('Retry-After', rl.retryAfterSec);
        return res.status(429).json({ error: `Muitas solicitações. Aguarde ${Math.ceil(rl.retryAfterSec / 60)} minuto(s) antes de tentar de novo.` });
    }

    const toEmail = process.env.NOTIFY_EMAIL;
    if (!toEmail) {
        return res.status(500).json({ error: 'NOTIFY_EMAIL não configurado no servidor.' });
    }

    const supabase = getSupabase();

    // Generate one-shot token
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + RESET_WINDOW_MS);

    const { error: insertErr } = await supabase
        .from('password_resets')
        .insert({ token_hash: tokenHash, expires_at: expiresAt.toISOString() });

    if (insertErr) {
        return res.status(500).json({ error: `Falha ao criar token: ${insertErr.message}` });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';
    const resetUrl = `${baseUrl}/admin/reset.html?t=${rawToken}`;
    const expiresStr = expiresAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    try {
        await sendEmail({
            to: toEmail,
            subject: 'Recuperação de acesso — ARTACHO.dev',
            text: `Olá Bruno,\n\nVocê solicitou recuperar o acesso ao painel administrativo.\n\nLink (válido até ${expiresStr}):\n${resetUrl}\n\nSe não foi você, ignore este email.\n\n— ARTACHO.dev`,
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
                    <h2 style="color: #0f172a; margin-bottom: 8px;">Recuperação de acesso</h2>
                    <p style="color: #475569; line-height: 1.55;">Olá Bruno, você solicitou recuperar o acesso ao painel administrativo do ARTACHO.dev.</p>
                    <p style="margin: 24px 0;">
                        <a href="${resetUrl}" style="display: inline-block; background: #22d3ee; color: #0a0a0f; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600;">Redefinir senha</a>
                    </p>
                    <p style="color: #64748b; font-size: 13px; line-height: 1.5;">Ou copie e cole este link no navegador:<br><code style="word-break: break-all; color: #475569;">${resetUrl}</code></p>
                    <p style="color: #64748b; font-size: 13px;">Link válido até <strong>${expiresStr}</strong>. Use uma vez só.</p>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;">
                    <p style="color: #94a3b8; font-size: 12px;">Se não foi você quem pediu, ignore este email — o token expira sozinho em 1h.</p>
                </div>
            `,
        });
    } catch (e) {
        if (e.code === 'EMAIL_NOT_CONFIGURED') {
            return res.status(503).json({
                error: 'Envio de email desabilitado. Configure RESEND_API_KEY no servidor (https://resend.com).',
            });
        }
        return res.status(500).json({ error: e.message });
    }

    return res.status(200).json({
        message: `Link de recuperação enviado para ${maskEmail(toEmail)}. Verifique sua caixa de entrada (e spam) nos próximos minutos.`,
    });
}

function maskEmail(email) {
    const [user, domain] = email.split('@');
    if (!domain) return email;
    const masked = user.length <= 2 ? user[0] + '*' : user[0] + '*'.repeat(Math.min(user.length - 2, 4)) + user.slice(-1);
    return `${masked}@${domain}`;
}
