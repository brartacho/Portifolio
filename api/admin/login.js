import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cors } from '../_lib/auth.js';

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Senha obrigatória' });

    const hash = process.env.ADMIN_PASSWORD_HASH;
    if (!hash) return res.status(500).json({ error: 'Configuração de autenticação ausente' });

    const valid = await bcrypt.compare(password, hash);
    if (!valid) return res.status(401).json({ error: 'Senha incorreta' });

    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' });
    return res.status(200).json({ token });
}
