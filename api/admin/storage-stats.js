import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase, BUCKET } from '../_lib/supabase.js';

// Limite default do plano Free do Supabase (1 GB de storage).
// Sobrescreve via env STORAGE_LIMIT_BYTES (ex: 107374182400 pra Pro = 100GB).
const DEFAULT_LIMIT_BYTES = 1024 * 1024 * 1024;
const ALERT_THRESHOLD = 0.80;

function projectRef() {
    // Extrai ref de SUPABASE_URL: https://<ref>.supabase.co
    try {
        const url = new URL(process.env.SUPABASE_URL);
        return url.hostname.split('.')[0];
    } catch {
        return null;
    }
}

async function listAllObjects(supabase, bucket, prefix = '', acc = []) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: 1000,
        sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`Erro ao listar storage: ${error.message}`);

    for (const item of data || []) {
        // Pasta (não tem id) → recurse
        if (!item.id) {
            const subPath = prefix ? `${prefix}/${item.name}` : item.name;
            await listAllObjects(supabase, bucket, subPath, acc);
        } else {
            acc.push({
                name: item.name,
                size: item.metadata?.size || 0,
                created_at: item.created_at,
            });
        }
    }
    return acc;
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const supabase = getSupabase();
    const bucket = BUCKET();

    try {
        const objects = await listAllObjects(supabase, bucket);
        const usedBytes = objects.reduce((s, o) => s + o.size, 0);
        const limitBytes = Number(process.env.STORAGE_LIMIT_BYTES) || DEFAULT_LIMIT_BYTES;
        const usedPercent = limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0;
        const ref = projectRef();

        return res.status(200).json({
            bucket,
            files_count: objects.length,
            used_bytes: usedBytes,
            limit_bytes: limitBytes,
            used_percent: Number(usedPercent.toFixed(2)),
            alert_threshold_percent: ALERT_THRESHOLD * 100,
            should_alert: usedPercent >= ALERT_THRESHOLD * 100,
            dashboard_url: ref
                ? `https://supabase.com/dashboard/project/${ref}/storage/buckets/${bucket}`
                : null,
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
