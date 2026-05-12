import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase, BUCKET } from '../_lib/supabase.js';
import { normalizeFileName } from '../_lib/filename.js';

const ALLOWED_SORT = new Set(['name', 'created_at', 'active', 'file_name']);
const MAX_LIMIT = 100;

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;

    const supabase = getSupabase();

    if (req.method === 'GET') {
        const {
            search = '',
            status = '',
            sort   = 'created_at',
            dir    = 'desc',
            page   = '1',
            limit: limitParam = '25',
        } = req.query;

        const pageNum  = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(MAX_LIMIT, Math.max(1, parseInt(limitParam) || 25));
        const offset   = (pageNum - 1) * limitNum;
        const ascending = dir === 'asc';
        const sortCol  = ALLOWED_SORT.has(sort) ? sort : 'created_at';

        let query = supabase.from('cv_versions').select('*', { count: 'exact' });

        if (search) {
            const s = search.replace(/[%_\\]/g, c => `\\${c}`);
            query = query.or(`name.ilike.%${s}%,description.ilike.%${s}%,file_name.ilike.%${s}%`);
        }
        if (status === 'ativo')   query = query.eq('active', true);
        if (status === 'inativo') query = query.eq('active', false);

        query = query.order(sortCol, { ascending }).range(offset, offset + limitNum - 1);

        const { data, error, count } = await query;
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({
            data:  data ?? [],
            total: count ?? 0,
            page:  pageNum,
            limit: limitNum,
            pages: Math.ceil((count ?? 0) / limitNum),
        });
    }

    if (req.method === 'POST') {
        const { name, description, file_path, file_name } = req.body || {};
        if (!name || !file_path || !file_name) {
            return res.status(400).json({ error: 'Campos obrigatórios: name, file_path, file_name' });
        }

        const trimmedName = name.trim();
        const { data: dup } = await supabase
            .from('cv_versions')
            .select('id')
            .ilike('name', trimmedName)
            .maybeSingle();
        if (dup) return res.status(409).json({ error: `Já existe um currículo com o nome "${trimmedName}". Use um nome diferente.` });

        const cleanFileName = normalizeFileName(file_name);

        const { data, error } = await supabase
            .from('cv_versions')
            .insert({ name: trimmedName, description, file_path, file_name: cleanFileName, active: true })
            .select()
            .single();

        if (error) return res.status(500).json({ error: error.message });
        return res.status(201).json(data);
    }

    if (req.method === 'PATCH') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'ID obrigatório (query string)' });

        const { name, description, active } = req.body || {};
        const patch = {};
        if (typeof name === 'string') {
            const trimmed = name.trim();
            if (!trimmed) return res.status(400).json({ error: 'Nome não pode ser vazio' });
            const { data: dup } = await supabase
                .from('cv_versions')
                .select('id')
                .ilike('name', trimmed)
                .neq('id', id)
                .maybeSingle();
            if (dup) return res.status(409).json({ error: `Já existe um currículo com o nome "${trimmed}". Use um nome diferente.` });
            patch.name = trimmed;
        }
        if (typeof description === 'string') patch.description = description.trim() || null;
        if (typeof active === 'boolean') patch.active = active;
        if (Object.keys(patch).length === 0) {
            return res.status(400).json({ error: 'Nenhum campo válido para atualizar (name, description ou active)' });
        }

        const { data, error } = await supabase
            .from('cv_versions')
            .update(patch)
            .eq('id', id)
            .select()
            .single();

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'Versão não encontrada' });
        return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'ID obrigatório (query string)' });

        const { data: cv } = await supabase
            .from('cv_versions')
            .select('file_path')
            .eq('id', id)
            .single();

        if (!cv) return res.status(404).json({ error: 'Versão não encontrada' });

        await supabase.storage.from(BUCKET()).remove([cv.file_path]);

        const { error } = await supabase.from('cv_versions').delete().eq('id', id);
        if (error) return res.status(500).json({ error: error.message });

        return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
