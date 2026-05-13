// Suite de testes de segurança — executa contra produção (https://artacho.dev).
// Cobre: bypass de autenticação, injeção, validação de token, headers HTTP,
// restrição de métodos, enumeração de usuários e rate limiting.
//
// Rate limiting (força bruta): opt-in com SECURITY_BRUTE_FORCE_TEST=1.
// ATENÇÃO: rode esse flag apenas após limpar a tabela rate_limits no Supabase.

const { test, expect } = require('@playwright/test');

const BASE = process.env.BASE_URL || 'https://artacho.dev';
const RUN_BRUTE_FORCE = process.env.SECURITY_BRUTE_FORCE_TEST === '1';

// Endpoints admin que exigem JWT
const ADMIN_ENDPOINTS = [
    '/api/admin/cv-versions',
    '/api/admin/tokens',
    '/api/admin/logs',
    '/api/admin/applications',
    '/api/admin/storage-stats',
];

// Monta JWT com header+payload válidos mas assinatura forjada
function forgedJwt(payload = { role: 'admin' }) {
    const b64url = obj =>
        Buffer.from(JSON.stringify(obj))
            .toString('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
    const hdr = b64url({ alg: 'HS256', typ: 'JWT' });
    const pay = b64url({ ...payload, iat: Math.floor(Date.now() / 1000) });
    return `${hdr}.${pay}.assinatura_forjada_invalida`;
}

// ─── 1. Autenticação e autorização ──────────────────────────────────────────

test.describe('Auth bypass — endpoints admin', () => {
    for (const endpoint of ADMIN_ENDPOINTS) {
        test(`${endpoint} sem Authorization → 401`, async ({ request }) => {
            const res = await request.get(`${BASE}${endpoint}`);
            expect(res.status()).toBe(401);
            const body = await res.json();
            expect(body).toHaveProperty('error');
            // Sem stack trace ou detalhes internos
            expect(JSON.stringify(body)).not.toMatch(/at\s+\w+.*\.js:\d+:\d+/);
        });

        test(`${endpoint} com token malformado → 401`, async ({ request }) => {
            const res = await request.get(`${BASE}${endpoint}`, {
                headers: { Authorization: 'Bearer nao_e_um_jwt' },
            });
            expect(res.status()).toBe(401);
        });

        test(`${endpoint} com JWT forjado (secret errado) → 401`, async ({ request }) => {
            const res = await request.get(`${BASE}${endpoint}`, {
                headers: { Authorization: `Bearer ${forgedJwt()}` },
            });
            expect(res.status()).toBe(401);
        });

        test(`${endpoint} com Bearer vazio → 401`, async ({ request }) => {
            const res = await request.get(`${BASE}${endpoint}`, {
                headers: { Authorization: 'Bearer ' },
            });
            expect(res.status()).toBe(401);
        });
    }
});

// ─── 2. Segurança do login ───────────────────────────────────────────────────

test.describe('Login — validação de entrada', () => {
    test('campos ausentes → 400', async ({ request }) => {
        const res = await request.post(`${BASE}/api/admin/login`, { data: {} });
        expect(res.status()).toBe(400);
    });

    test('apenas username → 400', async ({ request }) => {
        const res = await request.post(`${BASE}/api/admin/login`, {
            data: { username: 'alguem@exemplo.com' },
        });
        expect(res.status()).toBe(400);
    });

    test('apenas password → 400', async ({ request }) => {
        const res = await request.post(`${BASE}/api/admin/login`, {
            data: { password: 'senhaqualquer' },
        });
        expect(res.status()).toBe(400);
    });

    test('credenciais inválidas → 401 com mensagem genérica (sem enumeração de usuário)', async ({ request }) => {
        const res = await request.post(`${BASE}/api/admin/login`, {
            data: { username: 'naoexiste@fake.com', password: 'senhaerrada' },
        });
        expect(res.status()).toBe(401);
        const body = await res.json();
        // Mensagem genérica — não revela se username ou senha estão errados
        expect(body.error).toMatch(/usuário|senha|incorretos/i);
        expect(body.error).not.toMatch(/não encontrado|not found|does not exist|email inexistente|usuário inválido/i);
    });

    test('SQL injection no username → 401 (não 500)', async ({ request }) => {
        const res = await request.post(`${BASE}/api/admin/login`, {
            data: { username: "' OR '1'='1'; --", password: "' OR '1'='1" },
        });
        expect([400, 401]).toContain(res.status());
    });

    test('payload com objetos aninhados não causa crash → não é 500', async ({ request }) => {
        const res = await request.post(`${BASE}/api/admin/login`, {
            data: { username: { nested: true }, password: ['array'] },
        });
        // 400/401 = validação; 429 = rate limit ativo após tentativas anteriores
        expect([400, 401, 429]).toContain(res.status());
    });

    test('username muito longo não causa crash → não é 500', async ({ request }) => {
        const res = await request.post(`${BASE}/api/admin/login`, {
            data: { username: 'a'.repeat(1000), password: 'b'.repeat(1000) },
        });
        expect([400, 401, 429]).toContain(res.status());
    });
});

// ─── 3. Segurança do token de download de CV ─────────────────────────────────

test.describe('CV download — validação de token', () => {
    test('sem parâmetro t → 400', async ({ request }) => {
        const res = await request.get(`${BASE}/api/cv/download`);
        expect(res.status()).toBe(400);
    });

    test('token curto (< 10 chars) → 400', async ({ request }) => {
        const res = await request.get(`${BASE}/api/cv/download?t=curto`);
        expect(res.status()).toBe(400);
    });

    test('token inexistente (hash SHA-256 aleatório) → 404', async ({ request }) => {
        const fakeToken = 'a1b2c3d4e5f6'.repeat(5); // 60 chars, válido em tamanho
        const res = await request.get(`${BASE}/api/cv/download?t=${fakeToken}`);
        expect(res.status()).toBe(404);
    });

    test('path traversal no token → 400 ou 404 (não 500)', async ({ request }) => {
        const traversal = encodeURIComponent('../../etc/passwd');
        const res = await request.get(`${BASE}/api/cv/download?t=${traversal}`);
        expect([400, 404]).toContain(res.status());
    });

    test('token com caracteres especiais → 400 ou 404 (não 500)', async ({ request }) => {
        const res = await request.get(`${BASE}/api/cv/download?t=<script>alert(1)</script>`);
        expect([400, 404]).toContain(res.status());
    });
});

// ─── 4. Cabeçalhos de segurança HTTP ─────────────────────────────────────────

test.describe('Headers de segurança HTTP', () => {
    test('/api/* tem X-Content-Type-Options: nosniff', async ({ request }) => {
        const res = await request.get(`${BASE}/api/admin/cv-versions`);
        expect(res.headers()['x-content-type-options']).toBe('nosniff');
    });

    test('/api/* tem X-Frame-Options: DENY', async ({ request }) => {
        const res = await request.get(`${BASE}/api/admin/cv-versions`);
        expect(res.headers()['x-frame-options']).toBe('DENY');
    });

    test('/api/* tem X-XSS-Protection', async ({ request }) => {
        const res = await request.get(`${BASE}/api/admin/cv-versions`);
        expect(res.headers()['x-xss-protection']).toBeDefined();
    });

    test('/admin retorna X-Robots-Tag com noindex (não indexável)', async ({ request }) => {
        // Requer que vercel.json inclua source "/admin" (exato) além de "/admin/(.*)"
        const res = await request.get(`${BASE}/admin`);
        const robotsTag = res.headers()['x-robots-tag'] || '';
        expect(robotsTag).toMatch(/noindex/);
    });

    test('/admin tem X-Frame-Options: DENY (proteção anti-clickjacking)', async ({ request }) => {
        // Requer que vercel.json inclua source "/admin" (exato) além de "/admin/(.*)"
        const res = await request.get(`${BASE}/admin`);
        expect(res.headers()['x-frame-options']).toBe('DENY');
    });

    test('resposta de erro 401 não expõe detalhes internos', async ({ request }) => {
        const res = await request.get(`${BASE}/api/admin/tokens`);
        const body = await res.json();
        // Apenas a chave "error" esperada — sem "stack", "trace", "detail", etc.
        const keys = Object.keys(body);
        expect(keys).toEqual(['error']);
    });
});

// ─── 5. Restrição de métodos HTTP ────────────────────────────────────────────

test.describe('Restrição de métodos HTTP', () => {
    test('GET /api/admin/login → 405', async ({ request }) => {
        const res = await request.get(`${BASE}/api/admin/login`);
        expect(res.status()).toBe(405);
    });

    test('DELETE /api/admin/login → 405', async ({ request }) => {
        const res = await request.delete(`${BASE}/api/admin/login`);
        expect(res.status()).toBe(405);
    });

    test('PUT /api/admin/login → 405', async ({ request }) => {
        const res = await request.put(`${BASE}/api/admin/login`, { data: {} });
        expect(res.status()).toBe(405);
    });

    test('POST /api/cv/download → 405', async ({ request }) => {
        const res = await request.post(`${BASE}/api/cv/download`, { data: {} });
        expect(res.status()).toBe(405);
    });

    test('DELETE /api/cv/download → 405', async ({ request }) => {
        const res = await request.delete(`${BASE}/api/cv/download`);
        expect(res.status()).toBe(405);
    });
});

// ─── 6. Rate limiting — força bruta (opt-in) ─────────────────────────────────

test.describe('Rate limiting — força bruta no login', () => {
    test.skip(!RUN_BRUTE_FORCE,
        'Defina SECURITY_BRUTE_FORCE_TEST=1 para rodar. ' +
        'ATENÇÃO: limpe a tabela rate_limits no Supabase antes e depois.');

    test('6ª tentativa falha consecutiva → 429 com Retry-After', async ({ request }) => {
        for (let i = 0; i < 5; i++) {
            const r = await request.post(`${BASE}/api/admin/login`, {
                data: { username: 'bruteforce_test@fake.com', password: `errada${i}` },
            });
            // As 5 primeiras devem ser 401 (não 429 ainda)
            if (r.status() === 429) {
                // Rate limit já existia — limpe a tabela e tente novamente
                test.fail(true, 'Rate limit já estava ativo. Limpe a tabela rate_limits primeiro.');
                return;
            }
        }
        const res = await request.post(`${BASE}/api/admin/login`, {
            data: { username: 'bruteforce_test@fake.com', password: 'errada6' },
        });
        expect(res.status()).toBe(429);
        const body = await res.json();
        expect(body.error).toMatch(/muitas tentativas|aguarde/i);
        expect(res.headers()['retry-after']).toBeDefined();
    });
});
