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

export function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
