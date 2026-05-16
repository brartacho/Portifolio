export function parseCookies(req) {
    const raw = req.headers.cookie || '';
    if (!raw) return {};
    return Object.fromEntries(
        raw.split(';').map(part => {
            const [k, ...v] = part.trim().split('=');
            return [k, decodeURIComponent(v.join('='))];
        })
    );
}

// maxAge em segundos. Passar 0 para apagar o cookie (logout).
export function serializeSessionCookie(value, maxAge = 3600) {
    return [
        `admin_session=${encodeURIComponent(value)}`,
        `Max-Age=${maxAge}`,
        'Path=/',
        'HttpOnly',
        'Secure',
        'SameSite=Strict',
    ].join('; ');
}
