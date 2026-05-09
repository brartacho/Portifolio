/**
 * @param {Object} opts
 * @param {string} opts.to                             email destinatário
 * @param {string} opts.subject                        assunto
 * @param {string} [opts.html]                         corpo HTML
 * @param {string} [opts.text]                         corpo plain text
 * @param {Array<{filename:string,content:string,contentType?:string}>} [opts.attachments]
 *        anexos com content em base64
 * @param {string} [opts.replyTo]                      email pra Reply-To (útil em sends pra terceiros)
 */
export async function sendEmail({ to, subject, html, text, attachments, replyTo }) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        const err = new Error('RESEND_API_KEY não configurado. Configure em .env.local ou nas variáveis do Vercel.');
        err.code = 'EMAIL_NOT_CONFIGURED';
        throw err;
    }

    const payload = {
        from: 'ARTACHO.dev <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
        text,
    };
    if (replyTo) payload.reply_to = replyTo;
    if (Array.isArray(attachments) && attachments.length) {
        payload.attachments = attachments.map(a => ({
            filename: a.filename,
            content: a.content,
            content_type: a.contentType || 'application/octet-stream',
        }));
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        const err = new Error(`Falha ao enviar email (${response.status}): ${body.slice(0, 400)}`);
        // Detecta erro de domínio não verificado (test mode)
        if (response.status === 403 && /testing|own email|verify/i.test(body)) {
            err.code = 'DOMAIN_NOT_VERIFIED';
        }
        throw err;
    }
    return response.json();
}
