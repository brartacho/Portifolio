import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { extname, join, resolve } from 'path';
import { pathToFileURL } from 'url';

const ROOT = resolve(process.cwd());
const PORT = Number(process.env.PORT) || 3001;

function loadDotenv(file) {
    if (!existsSync(file)) return;
    const text = readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (!m) continue;
        let val = m[2];
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
            val = val.slice(1, -1);
        }
        if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
}
loadDotenv(join(ROOT, '.env.local'));

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.mjs':  'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.ico':  'image/x-icon',
    '.pdf':  'application/pdf',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.ttf':  'font/ttf',
    '.txt':  'text/plain; charset=utf-8',
};

function readBody(req) {
    return new Promise((resolveBody, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw) return resolveBody({});
            try {
                if ((req.headers['content-type'] || '').includes('application/json')) {
                    resolveBody(JSON.parse(raw));
                } else {
                    resolveBody(raw);
                }
            } catch { resolveBody(raw); }
        });
        req.on('error', reject);
    });
}

async function serveStatic(req, res, urlPath) {
    let filePath = decodeURIComponent(urlPath.split('?')[0]);
    if (filePath === '/') filePath = '/index.html';
    if (filePath === '/cv') filePath = '/cv.html';
    if (filePath === '/admin' || filePath === '/admin/') filePath = '/admin/index.html';

    const full = join(ROOT, filePath);
    if (!full.startsWith(ROOT)) {
        res.statusCode = 403;
        return res.end('Forbidden');
    }
    try {
        const s = await stat(full);
        if (s.isDirectory()) {
            const indexPath = join(full, 'index.html');
            if (existsSync(indexPath)) {
                const data = await readFile(indexPath);
                res.setHeader('Content-Type', MIME['.html']);
                return res.end(data);
            }
        }
        const data = await readFile(full);
        const type = MIME[extname(full).toLowerCase()] || 'application/octet-stream';
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.end(data);
    } catch {
        res.statusCode = 404;
        res.end('Not Found');
    }
}

async function handleApi(req, res, urlPath) {
    const cleanPath = urlPath.split('?')[0].replace(/^\/api\//, '');
    const handlerPath = join(ROOT, 'api', cleanPath + '.js');
    if (!existsSync(handlerPath)) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'API route not found' }));
    }
    try {
        const mod = await import(pathToFileURL(handlerPath).href + `?t=${Date.now()}`);
        const handler = mod.default;
        const body = await readBody(req);
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const query = Object.fromEntries(url.searchParams);

        const reqShim = Object.assign(req, { body, query });
        const resShim = Object.assign(res, {
            status(code) { res.statusCode = code; return resShim; },
            json(obj) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify(obj));
                return resShim;
            },
            send(data) { res.end(data); return resShim; },
        });
        await handler(reqShim, resShim);
    } catch (e) {
        console.error('[api error]', cleanPath, e);
        if (!res.writableEnded) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message }));
        }
    }
}

createServer(async (req, res) => {
    const url = req.url || '/';
    if (url.startsWith('/api/')) return handleApi(req, res, url);
    return serveStatic(req, res, url);
}).listen(PORT, () => {
    console.log(`\n  Portfolio dev server: http://localhost:${PORT}`);
    console.log(`  Admin:                http://localhost:${PORT}/admin`);
    console.log(`  CV page:              http://localhost:${PORT}/cv`);
    console.log(`  Supabase URL:         ${process.env.SUPABASE_URL || '(not set)'}\n`);
});
