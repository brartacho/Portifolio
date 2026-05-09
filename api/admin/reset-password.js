import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { cors } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';

const MIN_LEN = 8;

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { token, password } = req.body || {};
    if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Token obrigatório.' });
    }
    if (!password || typeof password !== 'string' || password.length < MIN_LEN) {
        return res.status(400).json({ error: `A senha precisa ter pelo menos ${MIN_LEN} caracteres.` });
    }

    const supabase = getSupabase();
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const { data: reset, error: lookupErr } = await supabase
        .from('password_resets')
        .select('id, expires_at, used')
        .eq('token_hash', tokenHash)
        .single();

    if (lookupErr || !reset) {
        return res.status(404).json({ error: 'Link inválido ou já utilizado.' });
    }
    if (reset.used) {
        return res.status(410).json({ error: 'Este link já foi usado.' });
    }
    if (new Date(reset.expires_at) < new Date()) {
        return res.status(410).json({ error: 'Este link expirou. Solicite um novo.' });
    }

    const newHash = await bcrypt.hash(password, 12);

    // Upsert into admin_credentials (single row strategy)
    const { data: existing } = await supabase
        .from('admin_credentials')
        .select('id')
        .limit(1)
        .single();

    if (existing) {
        await supabase
            .from('admin_credentials')
            .update({ password_hash: newHash, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
    } else {
        await supabase
            .from('admin_credentials')
            .insert({ password_hash: newHash });
    }

    // Mark token used + clean up other unused tokens for safety
    await supabase.from('password_resets').update({ used: true }).eq('id', reset.id);
    await supabase.from('password_resets').delete().eq('used', false).lt('expires_at', new Date().toISOString());

    return res.status(200).json({ message: 'Senha atualizada com sucesso. Faça login com a nova senha.' });
}
