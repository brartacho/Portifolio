import jwt from 'jsonwebtoken';

export function requireAdmin(req, res) {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        res.status(401).json({ error: 'Unauthorized' });
        return false;
    }
    try {
        jwt.verify(token, process.env.JWT_SECRET);
        return true;
    } catch {
        res.status(401).json({ error: 'Token inválido ou expirado' });
        return false;
    }
}

// Origens permitidas a chamar a API admin. Mantém artacho.dev + www + previews
// Vercel do próprio projeto (deploys preview têm sufixo *.vercel.app). Em DEV
// local, libera localhost/127.0.0.1 em qualquer porta. Qualquer outra origem
// (inclusive bots LLM externos) não recebe o header ACAO e o browser bloqueia.
const ALLOWED_ORIGINS = [
    'https://artacho.dev',
    'https://www.artacho.dev',
];

function isAllowedOrigin(origin) {
    if (!origin) return false;
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    // Previews Vercel do projeto: brartacho-*.vercel.app ou portfolio-*.vercel.app
    if (/^https:\/\/(brartacho|portfolio)[a-z0-9-]*\.vercel\.app$/i.test(origin)) return true;
    // DEV local
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
    return false;
}

export function cors(req, res) {
    const origin = req?.headers?.origin;
    if (isAllowedOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
