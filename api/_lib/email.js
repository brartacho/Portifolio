export async function sendEmail({ to, subject, html, text }) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        const err = new Error('RESEND_API_KEY não configurado. Configure em .env.local ou nas variáveis do Vercel.');
        err.code = 'EMAIL_NOT_CONFIGURED';
        throw err;
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            from: 'ARTACHO.dev <onboarding@resend.dev>',
            to: [to],
            subject,
            html,
            text,
        }),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Falha ao enviar email (${response.status}): ${body.slice(0, 300)}`);
    }
    return response.json();
}
