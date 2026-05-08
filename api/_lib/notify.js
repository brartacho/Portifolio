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
