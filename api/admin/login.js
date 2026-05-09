import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cors } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { checkRateLimit } from '../_lib/rate-limit.js';

const GENERIC_AUTH_ERROR = 'Usuário ou senha incorretos.';

function normalizeUsername(input) {
    if (typeof input !== 'string') return { email: '', phoneDigits: '' };
    const trimmed = input.trim();
    return {
        email: trimmed.toLowerCase(),
        phoneDigits: trimmed.replace(/\D/g, ''),
    };
}

function isUsernameValid(input) {
    if (!input) return false;
    const { email, phoneDigits } = normalizeUsername(input);
    const adminEmail = (process.env.ADMIN_EMAIL || process.env.NOTIFY_EMAIL || '').toLowerCase().trim();
    const adminPhone = (process.env.ADMIN_PHONE || '').replace(/\D/g, '');

    if (adminEmail && email && email === adminEmail) return true;
    if (adminPhone && phoneDigits && phoneDigits.length >= 10 && phoneDigits === adminPhone) return true;
    return false;
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const rl = await checkRateLimit({ req, scope: 'login', max: 5, windowMs: 15 * 60 * 1000 });
    if (!rl.allowed) {
        res.setHeader('Retry-After', rl.retryAfterSec);
        return res.status(429).json({ error: `Muitas tentativas. Aguarde ${Math.ceil(rl.retryAfterSec / 60)} minuto(s).` });
    }

    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Usuário e senha obrigatórios.' });

    // Validação do usuário (email ou telefone). Erro genérico pra não revelar
    // qual dos dois está errado (mitiga enumeração de credenciais).
    const userOk = isUsernameValid(username);

    // Prefer DB-backed credentials (set via password reset). Fallback to env hash.
    let hash = null;
    try {
        const supabase = getSupabase();
        const { data } = await supabase
            .from('admin_credentials')
            .select('password_hash')
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();
        if (data && data.password_hash) hash = data.password_hash;
    } catch {
        // Supabase indisponível ou tabela não existe — segue para env fallback
    }
    if (!hash) hash = process.env.ADMIN_PASSWORD_HASH;
    if (!hash) return res.status(500).json({ error: 'Configuração de autenticação ausente.' });

    // Sempre faz bcrypt.compare (mesmo se username inválido) pra evitar
    // timing attack que diferencia usuário válido vs inválido.
    const passOk = await bcrypt.compare(password, hash);

    if (!userOk || !passOk) return res.status(401).json({ error: GENERIC_AUTH_ERROR });

    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' });
    return res.status(200).json({ token });
}
