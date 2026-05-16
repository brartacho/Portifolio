export async function notifyDownload({ label, cvName, ip, useCount, maxUses, expiresAt }) {
    const time = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const usesText = maxUses ? `${useCount} de ${maxUses}` : `${useCount} (ilimitado)`;
    const expiresText = new Date(expiresAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const message = [
        '🔔 *CV baixado!*',
        `📋 Token: ${label || '(sem label)'}`,
        `📄 Currículo: ${cvName}`,
        `🕐 ${time}`,
        `🌐 IP: ${ip}`,
        `📊 Usos: ${usesText}`,
        `⏱ Expira: ${expiresText}`,
    ].join('\n');

    await Promise.allSettled([
        sendTelegram(message),
        sendEmail({ label, cvName, time, ip, usesText }),
    ]);
}

async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown',
        }),
    });
}

// ─── Alertas de segurança (fire-and-forget) ─────────────────────────────────
// Notifica eventos suspeitos no admin via Telegram. Não bloqueia o response;
// se Telegram estiver fora ou env não configurada, falha silenciosamente.
//
// Eventos suportados:
//   - 'rate_limit_blocked' : 5+ falhas de login do mesmo IP em 15min
//   - 'login_new_ip'       : login bem-sucedido de IP nunca visto antes
//   - 'bot_detected'       : guard de UA/honeypot/fillTime disparou

function escapeMd(s) {
    if (!s) return '';
    return String(s).replace(/[*_`[\]()]/g, c => '\\' + c);
}

export async function notifySecurityEvent({ kind, ip, ua, country, details }) {
    try {
        const time = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const uaShort = (ua || '').slice(0, 80);
        const geo = country ? ` (${country})` : '';

        let title, body;
        switch (kind) {
            case 'rate_limit_blocked':
                title = '🚨 *Login bloqueado por rate limit*';
                body = `5+ falhas em 15min do mesmo IP. Possível ataque.`;
                break;
            case 'login_new_ip':
                title = '⚠️ *Login admin de IP novo*';
                body = `Foi você? Se não, revogue a sessão imediatamente.`;
                break;
            case 'bot_detected':
                title = '🤖 *Bot detectado na tela de login*';
                body = `UA/honeypot/timing acusou automação.`;
                break;
            case 'session_country_change':
                title = '🌍 *Sessão encerrada — mudança de país*';
                body = `Sessão revogada automaticamente. Se foi você viajando, faça login novamente.`;
                break;
            case 'session_revoked':
                title = '🔒 *Sessão revogada manualmente*';
                body = details || 'Revogação solicitada pelo painel admin.';
                break;
            default:
                title = '🔔 *Evento de segurança*';
                body = details || '(sem detalhes)';
        }

        const msg = [
            title,
            body,
            `🌐 IP: \`${escapeMd(ip || 'unknown')}\`${escapeMd(geo)}`,
            `🧭 UA: \`${escapeMd(uaShort)}\``,
            `🕐 ${escapeMd(time)}`,
            details && kind !== 'rate_limit_blocked' && kind !== 'login_new_ip' && kind !== 'bot_detected'
                ? `📋 ${escapeMd(details)}` : null,
        ].filter(Boolean).join('\n');

        await sendTelegram(msg);
    } catch { /* swallow — alerta nunca bloqueia auth */ }
}

async function sendEmail({ label, cvName, time, ip, usesText }) {
    const apiKey = process.env.RESEND_API_KEY;
    const toEmail = process.env.NOTIFY_EMAIL;
    if (!apiKey || !toEmail) return;

    await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            from: 'CV Alert <onboarding@resend.dev>',
            to: [toEmail],
            subject: `CV baixado — ${label || 'sem label'}`,
            html: `
                <h2>CV baixado!</h2>
                <table>
                    <tr><td><strong>Token</strong></td><td>${label || '(sem label)'}</td></tr>
                    <tr><td><strong>Currículo</strong></td><td>${cvName}</td></tr>
                    <tr><td><strong>Horário</strong></td><td>${time}</td></tr>
                    <tr><td><strong>IP</strong></td><td>${ip}</td></tr>
                    <tr><td><strong>Usos</strong></td><td>${usesText}</td></tr>
                </table>
            `,
        }),
    });
}
