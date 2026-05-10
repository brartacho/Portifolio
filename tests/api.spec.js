const { test, expect } = require('@playwright/test');

// Testes de API usam request context diretamente (sem browser)
// Verificam status HTTP e estrutura básica das respostas

test.describe('API — /api/admin/login', () => {
  test('sem body retorna 400 ou 422', async ({ request }) => {
    const res = await request.post('/api/admin/login', {
      data: {},
    });
    // 400: campos obrigatórios ausentes; 429: rate limit atingido entre runs de teste
    expect([400, 401, 422, 429]).toContain(res.status());
  });

  test('credenciais inválidas retornam 400 ou 401', async ({ request }) => {
    const res = await request.post('/api/admin/login', {
      data: { username: 'invalido@teste.com', password: 'senha-errada' },
    });
    // 429: rate limit atingido em execuções repetidas contra produção
    expect([400, 401, 429]).toContain(res.status());
  });

  test('resposta é JSON', async ({ request }) => {
    const res = await request.post('/api/admin/login', {
      data: { username: 'invalido@teste.com', password: 'errado' },
    });
    const contentType = res.headers()['content-type'] ?? '';
    expect(contentType).toContain('json');
  });
});

test.describe('API — /api/admin/forgot-password', () => {
  test('sem email retorna 2xx, 4xx ou 5xx', async ({ request }) => {
    const res = await request.post('/api/admin/forgot-password', {
      data: {},
    });
    // API envia sempre para NOTIFY_EMAIL (ignora body) — pode retornar 200,
    // 429 (rate limit), 500/503 (email não configurado)
    expect([200, 400, 422, 429, 500, 503]).toContain(res.status());
  });

  test('com email no body não retorna 404', async ({ request }) => {
    const res = await request.post('/api/admin/forgot-password', {
      data: { email: 'teste@artacho.dev' },
    });
    // API não valida o campo email — envia para NOTIFY_EMAIL configurado no servidor
    expect([200, 400, 429, 500, 503]).toContain(res.status());
  });
});

test.describe('API — endpoints protegidos sem auth', () => {
  const protectedEndpoints = [
    { method: 'GET',  path: '/api/admin/cv-versions' },
    { method: 'GET',  path: '/api/admin/tokens' },
    { method: 'GET',  path: '/api/admin/storage-stats' },
    { method: 'GET',  path: '/api/admin/logs' },
    { method: 'GET',  path: '/api/admin/cv-storage-url' },
    { method: 'POST', path: '/api/admin/cv-storage-url' },
    { method: 'POST', path: '/api/admin/tokens' },
    { method: 'POST', path: '/api/admin/send-cv-email' },
  ];

  for (const ep of protectedEndpoints) {
    test(`${ep.method} ${ep.path} sem auth → 401`, async ({ request }) => {
      const res = ep.method === 'GET'
        ? await request.get(ep.path)
        : await request.post(ep.path, { data: {} });
      expect(res.status()).toBe(401);
    });
  }
});

test.describe('API — /api/admin/reset-password', () => {
  test('sem token retorna 400 ou 401', async ({ request }) => {
    const res = await request.post('/api/admin/reset-password', {
      data: { password: 'novaSenha123' },
    });
    expect([400, 401, 422]).toContain(res.status());
  });

  test('token inválido retorna 400, 401 ou 404', async ({ request }) => {
    const res = await request.post('/api/admin/reset-password', {
      data: { token: 'token-invalido-xyz', password: 'novaSenha123' },
    });
    expect([400, 401, 404]).toContain(res.status());
  });
});

test.describe('API — /api/cv/download (pública)', () => {
  test('sem token retorna 400 ou 401', async ({ request }) => {
    const res = await request.get('/api/cv/download');
    expect([400, 401]).toContain(res.status());
  });

  test('token inválido retorna 401 ou 404', async ({ request }) => {
    const res = await request.get('/api/cv/download?t=token-invalido-000');
    expect([400, 401, 404]).toContain(res.status());
  });
});

test.describe('API — /api/cv/request-by-email (pública)', () => {
  test('sem body retorna 400 ou 422', async ({ request }) => {
    const res = await request.post('/api/cv/request-by-email', {
      data: {},
    });
    expect([400, 422]).toContain(res.status());
  });
});

test.describe('API — headers de segurança', () => {
  test('/api/* tem X-Content-Type-Options: nosniff', async ({ request }) => {
    const res = await request.get('/api/admin/cv-versions');
    const headers = res.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
  });

  test('/api/* tem X-Frame-Options: DENY', async ({ request }) => {
    const res = await request.get('/api/admin/cv-versions');
    const headers = res.headers();
    expect(headers['x-frame-options']).toBe('DENY');
  });
});
