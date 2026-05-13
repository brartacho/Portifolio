/**
 * Suite completa do painel admin — desktop, tablet e mobile.
 *
 * Cobertura:
 *  - Login (campos, toggle senha, credenciais inválidas, modal esqueci senha)
 *  - Navegação por abas (top tabs desktop/tablet × bottom nav mobile)
 *  - Aba Currículos: accordion upload, lista, busca, preview PDF
 *  - Aba Tokens: accordion form, campos de criação, lista, filtros, modal share
 *  - Aba Logs: tabela, filtros (texto, tipo, datas), paginação server-side
 *  - Aba Vagas: chips de filtro, busca, CRUD candidatura, drawer, result, etapas
 *  - Logout
 *
 * Variáveis de ambiente necessárias para testes autenticados:
 *   ADMIN_EMAIL, ADMIN_PASSWORD
 */

const { test, expect } = require('@playwright/test');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS  = process.env.ADMIN_PASSWORD;
const HAS_CREDS   = Boolean(ADMIN_EMAIL && ADMIN_PASS);

// ─── Helper: detecta se o viewport é mobile (bottom nav) ─────────────────────
function isMobile(page) {
  return page.viewportSize()?.width <= 600;
}

// ─── Helper: navegar para uma aba (funciona em desktop/tablet e mobile) ───────
async function switchToTab(page, tabName) {
  const selector = `[data-tab="${tabName}"]`;
  // Clica no primeiro botão visível com esse data-tab (top tab ou bottom nav)
  const btn = page.locator(selector).filter({ hasNot: page.locator(':hidden') }).first();
  await btn.click();
  await page.waitForTimeout(400);
}

// ─── Fixture: JWT compartilhado por describe block ────────────────────────────
async function captureJwt(browser) {
  const ctx = await browser.newContext();
  const pg  = await ctx.newPage();
  await pg.goto('/admin', { waitUntil: 'networkidle' });
  await pg.locator('#loginUsername').fill(ADMIN_EMAIL);
  await pg.locator('#loginPassword').fill(ADMIN_PASS);
  await pg.locator('#loginBtn').click();
  await pg.waitForSelector('.app-logout', { state: 'visible', timeout: 15000 });
  const jwt = await pg.evaluate(() => sessionStorage.getItem('admin_jwt'));
  await ctx.close();
  return jwt;
}

async function injectAndGoto(page, jwt) {
  if (jwt) await page.addInitScript((t) => sessionStorage.setItem('admin_jwt', t), jwt);
  await page.goto('/admin', { waitUntil: 'networkidle' });
  if (jwt) await page.waitForSelector('.app-logout', { state: 'visible', timeout: 12000 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. LOGIN
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Login — estrutura da tela', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'networkidle' });
  });

  test('página carrega com status 200', async ({ page }) => {
    const res = await page.goto('/admin', { waitUntil: 'networkidle' });
    expect(res.status()).toBe(200);
  });

  test('campo de usuário visível', async ({ page }) => {
    await expect(page.locator('#loginUsername')).toBeVisible();
  });

  test('campo de senha visível', async ({ page }) => {
    await expect(page.locator('#loginPassword')).toBeVisible();
  });

  test('botão de login visível', async ({ page }) => {
    await expect(page.locator('#loginBtn')).toBeVisible();
  });

  test('toggle de senha alterna type password ↔ text', async ({ page }) => {
    const input  = page.locator('#loginPassword');
    const toggle = page.locator('#pwToggleBtn');
    await expect(input).toHaveAttribute('type', 'password');
    await toggle.click();
    await expect(input).toHaveAttribute('type', 'text');
    await toggle.click();
    await expect(input).toHaveAttribute('type', 'password');
  });

  test('credenciais inválidas exibem mensagem de erro', async ({ page }) => {
    await page.locator('#loginUsername').fill('invalido@test.com');
    await page.locator('#loginPassword').fill('senha-errada-xyz-999');
    await page.locator('#loginBtn').click();
    await expect(page.locator('#loginError')).toBeVisible({ timeout: 12000 });
  });

  test('modal "esqueci a senha" abre ao clicar no link', async ({ page }) => {
    await page.locator('button.forgot-link').click();
    await expect(page.locator('#forgotModal')).toBeVisible({ timeout: 5000 });
  });

  test('modal "esqueci a senha" fecha ao clicar no X', async ({ page }) => {
    await page.locator('button.forgot-link').click();
    await expect(page.locator('#forgotModal')).toBeVisible({ timeout: 5000 });
    await page.locator('#forgotModal .forgot-close').click();
    await expect(page.locator('#forgotModal')).toBeHidden({ timeout: 5000 });
  });

  test('modal "esqueci a senha" fecha com Escape', async ({ page }) => {
    await page.locator('button.forgot-link').click();
    await expect(page.locator('#forgotModal')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('#forgotModal')).toBeHidden({ timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. AUTENTICAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Login bem-sucedido', () => {
  test.skip(!HAS_CREDS, 'Defina ADMIN_EMAIL e ADMIN_PASSWORD');

  test('credenciais corretas abrem o painel', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'networkidle' });
    await page.locator('#loginUsername').fill(ADMIN_EMAIL);
    await page.locator('#loginPassword').fill(ADMIN_PASS);
    await page.locator('#loginBtn').click();
    await expect(page.locator('.app-logout')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#appScreen')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. NAVEGAÇÃO POR ABAS — desktop / tablet  (viewport > 600px)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Navegação — desktop/tablet (top tabs)', () => {
  test.skip(!HAS_CREDS, 'Defina ADMIN_EMAIL e ADMIN_PASSWORD');

  // Não roda no mobile (iPhone 14 = 390px)
  test.skip(({ viewport }) => viewport && viewport.width <= 600, 'Apenas desktop/tablet');

  let jwt = null;
  test.beforeAll(async ({ browser }) => { jwt = await captureJwt(browser); });
  test.beforeEach(async ({ page }) => { await injectAndGoto(page, jwt); });

  test('top tabs visíveis e bottom nav oculto', async ({ page }) => {
    await expect(page.locator('.app-tabs')).toBeVisible();
    await expect(page.locator('.mobile-bottom-nav')).toBeHidden();
  });

  test('4 botões de aba no top nav', async ({ page }) => {
    await expect(page.locator('.app-tabs .tab-btn')).toHaveCount(4);
  });

  test('aba Currículos ativa por padrão', async ({ page }) => {
    await expect(page.locator('.app-tabs .tab-btn[data-tab="cvs"]')).toHaveClass(/active/);
    await expect(page.locator('#tab-cvs')).toHaveClass(/active/);
  });

  test('clicar em Tokens ativa a aba correta', async ({ page }) => {
    await page.locator('.app-tabs .tab-btn[data-tab="tokens"]').click();
    await expect(page.locator('#tab-tokens')).toHaveClass(/active/);
    await expect(page.locator('.app-tabs .tab-btn[data-tab="tokens"]')).toHaveClass(/active/);
  });

  test('clicar em Logs ativa a aba correta', async ({ page }) => {
    await page.locator('.app-tabs .tab-btn[data-tab="logs"]').click();
    await expect(page.locator('#tab-logs')).toHaveClass(/active/);
  });

  test('clicar em Gestão de Vagas ativa a aba correta', async ({ page }) => {
    await page.locator('.app-tabs .tab-btn[data-tab="vagas"]').click();
    await expect(page.locator('#tab-vagas')).toHaveClass(/active/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. NAVEGAÇÃO — mobile (bottom nav, viewport ≤ 600px)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Navegação — mobile (bottom nav)', () => {
  test.skip(!HAS_CREDS, 'Defina ADMIN_EMAIL e ADMIN_PASSWORD');

  // Só roda quando viewport é ≤ 600px
  test.skip(({ viewport }) => !viewport || viewport.width > 600, 'Apenas mobile');

  let jwt = null;
  test.beforeAll(async ({ browser }) => { jwt = await captureJwt(browser); });
  test.beforeEach(async ({ page }) => { await injectAndGoto(page, jwt); });

  test('bottom nav visível e top tabs ocultos', async ({ page }) => {
    await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
    await expect(page.locator('.app-tabs')).toBeHidden();
  });

  test('4 botões no bottom nav', async ({ page }) => {
    await expect(page.locator('.mobile-bottom-nav .mobile-nav-btn')).toHaveCount(4);
  });

  test('Currículos ativa por padrão no bottom nav', async ({ page }) => {
    await expect(page.locator('.mobile-nav-btn[data-tab="cvs"]')).toHaveClass(/active/);
  });

  test('bottom nav navega para Tokens', async ({ page }) => {
    await page.locator('.mobile-nav-btn[data-tab="tokens"]').click();
    await expect(page.locator('#tab-tokens')).toHaveClass(/active/);
    await expect(page.locator('.mobile-nav-btn[data-tab="tokens"]')).toHaveClass(/active/);
  });

  test('bottom nav navega para Logs', async ({ page }) => {
    await page.locator('.mobile-nav-btn[data-tab="logs"]').click();
    await expect(page.locator('#tab-logs')).toHaveClass(/active/);
  });

  test('bottom nav navega para Vagas', async ({ page }) => {
    await page.locator('.mobile-nav-btn[data-tab="vagas"]').click();
    await expect(page.locator('#tab-vagas')).toHaveClass(/active/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. ABA CURRÍCULOS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Aba Currículos', () => {
  test.skip(!HAS_CREDS, 'Defina ADMIN_EMAIL e ADMIN_PASSWORD');

  let jwt = null;
  test.beforeAll(async ({ browser }) => { jwt = await captureJwt(browser); });
  test.beforeEach(async ({ page }) => {
    await injectAndGoto(page, jwt);
    // Garante que CVs está ativa (já é padrão, mas por segurança)
    await switchToTab(page, 'cvs');
  });

  test('tabela de CVs renderiza (thead visível)', async ({ page }) => {
    await expect(page.locator('#tab-cvs table thead')).toBeVisible({ timeout: 8000 });
  });

  test('toggle de upload existe e tem aria-expanded=false por padrão', async ({ page }) => {
    await expect(page.locator('#cvsUploadToggleBtn')).toBeVisible();
    await expect(page.locator('#cvsUploadToggleBtn')).toHaveAttribute('aria-expanded', 'false');
  });

  test('accordion de upload abre ao clicar no toggle', async ({ page }) => {
    const collapsible = page.locator('#cvsUploadCollapsible');
    await expect(collapsible).not.toHaveClass(/open/);
    await page.locator('#cvsUploadToggleBtn').click();
    await expect(collapsible).toHaveClass(/open/);
    await expect(page.locator('#cvsUploadToggleBtn')).toHaveAttribute('aria-expanded', 'true');
  });

  test('accordion de upload fecha ao clicar novamente', async ({ page }) => {
    await page.locator('#cvsUploadToggleBtn').click();
    await page.locator('#cvsUploadToggleBtn').click();
    await expect(page.locator('#cvsUploadCollapsible')).not.toHaveClass(/open/);
  });

  test('upload zone visível dentro do accordion aberto', async ({ page }) => {
    await page.locator('#cvsUploadToggleBtn').click();
    await expect(page.locator('#cvsUploadCollapsible .upload-zone').first()).toBeVisible();
  });

  test('campo de busca presente na aba CVs', async ({ page }) => {
    // Busca pode estar em filter-bar ou como input dentro de tab-cvs
    const searchInputs = page.locator('#tab-cvs input[type="search"], #tab-cvs input[type="text"]');
    await expect(searchInputs.first()).toBeAttached();
  });

  test('botão de preview PDF visível se houver CVs', async ({ page }) => {
    const previewBtns = page.locator('#tab-cvs .cv-action-btn[title*="Pré-visualizar"]');
    const count = await previewBtns.count();
    if (count > 0) {
      await expect(previewBtns.first()).toBeVisible();
    }
  });

  test('modal de preview PDF abre e exibe overlay', async ({ page }) => {
    const previewBtns = page.locator('#tab-cvs .cv-action-btn[title*="Pré-visualizar"]');
    const count = await previewBtns.count();
    if (count === 0) test.skip();
    await previewBtns.first().click();
    await expect(page.locator('#pdfPreviewOverlay')).toBeVisible({ timeout: 8000 });
  });

  test('modal de preview fecha com botão fechar', async ({ page }) => {
    const previewBtns = page.locator('#tab-cvs .cv-action-btn[title*="Pré-visualizar"]');
    if (await previewBtns.count() === 0) test.skip();
    await previewBtns.first().click();
    await expect(page.locator('#pdfPreviewOverlay')).toBeVisible({ timeout: 8000 });
    await page.locator('#pdfPreviewOverlay .modal-close, #pdfPreviewOverlay button').first().click();
    await expect(page.locator('#pdfPreviewOverlay')).toBeHidden({ timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. ABA TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Aba Tokens', () => {
  test.skip(!HAS_CREDS, 'Defina ADMIN_EMAIL e ADMIN_PASSWORD');

  let jwt = null;
  test.beforeAll(async ({ browser }) => { jwt = await captureJwt(browser); });
  test.beforeEach(async ({ page }) => {
    await injectAndGoto(page, jwt);
    await switchToTab(page, 'tokens');
  });

  test('seção de tokens carrega', async ({ page }) => {
    await expect(page.locator('#tab-tokens')).toHaveClass(/active/);
  });

  test('toggle de formulário presente', async ({ page }) => {
    await expect(page.locator('#tokenFormToggleBtn')).toBeVisible();
  });

  // No mobile o form começa fechado (accordion); no desktop pode começar visível
  test('accordion de criação de token abre e exibe campos', async ({ page }) => {
    const collapsible = page.locator('#tokenFormCollapsible');
    const isOpen = await collapsible.evaluate(el => el.classList.contains('open'));
    if (!isOpen) {
      await page.locator('#tokenFormToggleBtn').click();
      await expect(collapsible).toHaveClass(/open/, { timeout: 3000 });
    }
    await expect(page.locator('#tokenCV')).toBeVisible();
    await expect(page.locator('#tokenLabel')).toBeVisible();
    await expect(page.locator('#tokenMaxUses')).toBeVisible();
  });

  test('opções de validade presentes (24h, 48h, 72h, 7 dias, 30 dias, Data específica)', async ({ page }) => {
    const collapsible = page.locator('#tokenFormCollapsible');
    if (!await collapsible.evaluate(el => el.classList.contains('open'))) {
      await page.locator('#tokenFormToggleBtn').click();
    }
    const opts = page.locator('#expiryOpts .expiry-opt');
    await expect(opts).toHaveCount(6);
    await expect(opts.filter({ hasText: '24h' })).toHaveCount(1);
    await expect(opts.filter({ hasText: '30 dias' })).toHaveCount(1);
    await expect(opts.filter({ hasText: /data específica/i })).toHaveCount(1);
  });

  test('"Data específica" exibe input datetime-local', async ({ page }) => {
    const collapsible = page.locator('#tokenFormCollapsible');
    if (!await collapsible.evaluate(el => el.classList.contains('open'))) {
      await page.locator('#tokenFormToggleBtn').click();
    }
    await page.locator('#expiryOpts .expiry-opt[data-hours="custom"]').click();
    await expect(page.locator('#expiryDate')).toBeVisible();
  });

  test('opção 24h ativa por padrão', async ({ page }) => {
    const collapsible = page.locator('#tokenFormCollapsible');
    if (!await collapsible.evaluate(el => el.classList.contains('open'))) {
      await page.locator('#tokenFormToggleBtn').click();
    }
    await expect(page.locator('#expiryOpts .expiry-opt[data-hours="24"]')).toHaveClass(/active/);
  });

  test('tabela de tokens renderiza', async ({ page }) => {
    await expect(page.locator('#tokenTable')).toBeAttached();
    await expect(page.locator('#tab-tokens table thead')).toBeVisible({ timeout: 8000 });
  });

  test('campo de busca de tokens presente', async ({ page }) => {
    await expect(page.locator('#tokenSearch')).toBeVisible();
  });

  test('filtro de status de tokens presente com 5 opções', async ({ page }) => {
    const select = page.locator('#tokenStatusFilter');
    await expect(select).toBeVisible();
    await expect(select.locator('option')).toHaveCount(5);
  });

  test('busca filtra tokens (input dispara renderTokens)', async ({ page }) => {
    await page.locator('#tokenSearch').fill('zzz_nenhum_match_xyz');
    await page.waitForTimeout(300);
    const count = page.locator('#tokenCount');
    if (await count.isVisible()) {
      const text = await count.textContent();
      expect(text).toMatch(/0/);
    }
    await page.locator('#tokenSearch').fill('');
  });

  test('modal share abre a partir de token existente', async ({ page }) => {
    const rows = page.locator('#tokenTable tr[data-id], #tokenTable tbody tr').filter({
      hasNot: page.locator('td[colspan]'),
    });
    const count = await rows.count();
    if (count === 0) test.skip();
    // Clica no botão de share (ícone de compartilhar) na primeira linha
    const shareBtn = rows.first().locator('button').filter({ has: page.locator('.fa-share-nodes, .fa-paper-plane, .fa-arrow-up-right-from-square') });
    const shareBtnCount = await shareBtn.count();
    if (shareBtnCount === 0) test.skip();
    await shareBtn.first().click();
    await expect(page.locator('#shareModal')).toBeVisible({ timeout: 5000 });
  });

  test('modal share fecha com ESC', async ({ page }) => {
    const rows = page.locator('#tokenTable tr[data-id], #tokenTable tbody tr').filter({
      hasNot: page.locator('td[colspan]'),
    });
    if (await rows.count() === 0) test.skip();
    const shareBtn = rows.first().locator('button').filter({ has: page.locator('.fa-share-nodes, .fa-paper-plane, .fa-arrow-up-right-from-square') });
    if (await shareBtn.count() === 0) test.skip();
    await shareBtn.first().click();
    await expect(page.locator('#shareModal')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('#shareModal')).toBeHidden({ timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. ABA LOGS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Aba Logs', () => {
  test.skip(!HAS_CREDS, 'Defina ADMIN_EMAIL e ADMIN_PASSWORD');

  let jwt = null;
  test.beforeAll(async ({ browser }) => { jwt = await captureJwt(browser); });
  test.beforeEach(async ({ page }) => {
    await injectAndGoto(page, jwt);
    await switchToTab(page, 'logs');
    // Aguarda tabela carregar (overlay some)
    await page.waitForSelector('#logOverlay', { state: 'hidden', timeout: 10000 }).catch(() => {});
  });

  test('tabela de logs renderiza', async ({ page }) => {
    await expect(page.locator('#logTable')).toBeAttached();
    await expect(page.locator('#tab-logs table thead')).toBeVisible();
  });

  test('campo de busca presente', async ({ page }) => {
    await expect(page.locator('#logSearch')).toBeVisible();
  });

  test('filtro por tipo de evento presente com todas as opções', async ({ page }) => {
    const select = page.locator('#logTipoFilter');
    await expect(select).toBeVisible();
    await expect(select.locator('option')).toHaveCount(6);
    await expect(select.locator('option[value="download"]')).toHaveCount(1);
    await expect(select.locator('option[value="email"]')).toHaveCount(1);
    await expect(select.locator('option[value="whatsapp"]')).toHaveCount(1);
  });

  test('filtros de data (De / Até) presentes', async ({ page }) => {
    await expect(page.locator('#logFrom')).toBeVisible();
    await expect(page.locator('#logTo')).toBeVisible();
  });

  test('paginação renderiza quando há registros', async ({ page }) => {
    const tbody = page.locator('#logTable');
    const rowCount = await tbody.locator('tr').count();
    if (rowCount === 0) test.skip();
    // Com 50 registros por página, a paginação aparece se há logs
    const pagination = page.locator('#logPagination');
    const isVisible  = await pagination.isVisible();
    if (isVisible) {
      await expect(page.locator('#logPrevBtn')).toBeVisible();
      await expect(page.locator('#logNextBtn')).toBeVisible();
      await expect(page.locator('#logPageInfo')).toBeVisible();
    }
  });

  test('filtro por tipo "Acesso do recrutador" recarrega tabela', async ({ page }) => {
    await page.locator('#logTipoFilter').selectOption('download');
    await page.waitForSelector('#logOverlay', { state: 'hidden', timeout: 10000 }).catch(() => {});
    await expect(page.locator('#logTable')).toBeAttached();
  });

  test('filtro por data futura retorna tabela vazia ou com poucos resultados', async ({ page }) => {
    await page.locator('#logFrom').fill('2099-01-01');
    await page.waitForSelector('#logOverlay', { state: 'hidden', timeout: 10000 }).catch(() => {});
    const rows = await page.locator('#logTable tr').count();
    expect(rows).toBeLessThanOrEqual(1); // 0 rows ou 1 linha "sem resultados"
    // Limpa para não afetar outros testes
    await page.locator('#logFrom').fill('');
  });

  test('clique em linha de log abre drawer de detalhe', async ({ page }) => {
    const rows = page.locator('#logTable tr').filter({ hasNot: page.locator('td[colspan]') });
    if (await rows.count() === 0) test.skip();
    await rows.first().click();
    await expect(page.locator('#logDrawer')).toBeVisible({ timeout: 5000 });
    await page.locator('#logDrawerOverlay, #logDrawer button').first().click();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. ABA VAGAS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Aba Vagas — estrutura e filtros', () => {
  test.skip(!HAS_CREDS, 'Defina ADMIN_EMAIL e ADMIN_PASSWORD');

  let jwt = null;
  test.beforeAll(async ({ browser }) => { jwt = await captureJwt(browser); });
  test.beforeEach(async ({ page }) => {
    await injectAndGoto(page, jwt);
    await switchToTab(page, 'vagas');
    await page.waitForSelector('.vagas-table', { timeout: 8000 });
  });

  test('tabela de vagas carrega', async ({ page }) => {
    await expect(page.locator('.vagas-table')).toBeVisible();
  });

  test('4 chips de filtro presentes (Todas, Em processo, Aprovado, Recusado)', async ({ page }) => {
    const chips = page.locator('.vagas-filter-chip');
    await expect(chips).toHaveCount(4);
    await expect(chips.filter({ hasText: 'Todas' })).toHaveCount(1);
    await expect(chips.filter({ hasText: /em processo/i })).toHaveCount(1);
    await expect(chips.filter({ hasText: /aprovado/i })).toHaveCount(1);
    await expect(chips.filter({ hasText: /recusado/i })).toHaveCount(1);
  });

  test('chip "Todas" ativo por padrão', async ({ page }) => {
    await expect(page.locator('.vagas-filter-chip[data-filter="all"]')).toHaveClass(/active/);
  });

  test('clicar em chip muda filtro ativo', async ({ page }) => {
    await page.locator('.vagas-filter-chip[data-filter="em-processo"]').click();
    await expect(page.locator('.vagas-filter-chip[data-filter="em-processo"]')).toHaveClass(/active/);
    await expect(page.locator('.vagas-filter-chip[data-filter="all"]')).not.toHaveClass(/active/);
  });

  test('campo de busca presente', async ({ page }) => {
    await expect(page.locator('#vagasSearch')).toBeVisible();
  });

  test('busca filtra resultados', async ({ page }) => {
    await page.locator('#vagasSearch').fill('zzz_nenhum_match_xyz');
    await page.waitForTimeout(300);
    const count = page.locator('#vagasCount');
    if (await count.isVisible()) {
      const text = await count.textContent();
      expect(text).toMatch(/0/);
    }
    await page.locator('#vagasSearch').fill('');
  });

  test('botão "Nova vaga" visível', async ({ page }) => {
    await expect(page.locator('button', { hasText: /nova vaga/i })).toBeVisible();
  });
});

test.describe('Aba Vagas — CRUD candidatura', () => {
  test.skip(!HAS_CREDS, 'Defina ADMIN_EMAIL e ADMIN_PASSWORD');

  let jwt = null;
  const empresa = `Teste_Suite_${Date.now()}`;

  test.beforeAll(async ({ browser }) => { jwt = await captureJwt(browser); });
  test.beforeEach(async ({ page }) => {
    await injectAndGoto(page, jwt);
    await switchToTab(page, 'vagas');
    await page.waitForSelector('.vagas-table', { timeout: 8000 });
  });

  test('formulário "Nova vaga" abre e exibe campos obrigatórios', async ({ page }) => {
    await page.locator('button', { hasText: /nova vaga/i }).click();
    await expect(page.locator('#novaVagaForm')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#vfEmpresa')).toBeVisible();
    await expect(page.locator('#vfVaga')).toBeVisible();
    await expect(page.locator('#vfLinkedin')).toBeVisible();
    await expect(page.locator('#vfLinkVaga')).toBeVisible();
    await expect(page.locator('#vfObs')).toBeVisible();
    await expect(page.locator('#vfGestorNome')).toBeVisible();
    await expect(page.locator('#vfGestorEmail')).toBeVisible();
    await expect(page.locator('#vfDataEnvio')).toBeVisible();
  });

  test('submeter sem empresa exibe mensagem de erro', async ({ page }) => {
    await page.locator('button', { hasText: /nova vaga/i }).click();
    await expect(page.locator('#novaVagaForm')).toBeVisible();
    await page.locator('#novaVagaForm button', { hasText: /criar candidatura/i }).click();
    await expect(page.locator('#vfMsg')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#vfMsg')).toContainText(/empresa/i);
  });

  test('cancelar formulário remove o form do DOM', async ({ page }) => {
    await page.locator('button', { hasText: /nova vaga/i }).click();
    await expect(page.locator('#novaVagaForm')).toBeVisible();
    await page.locator('#novaVagaForm button', { hasText: /cancelar/i }).click();
    await expect(page.locator('#novaVagaForm')).toBeHidden();
  });

  test('criar candidatura e excluir (fluxo completo)', async ({ page }) => {
    // Criar
    await page.locator('button', { hasText: /nova vaga/i }).click();
    await page.locator('#vfEmpresa').fill(empresa);
    await page.locator('#vfVaga').fill('QA Automation Engineer');
    await page.locator('#novaVagaForm button', { hasText: /criar candidatura/i }).click();
    await expect(page.locator('.vagas-table', { hasText: empresa })).toBeVisible({ timeout: 8000 });

    // Abrir drawer
    await page.locator('.vagas-table tr', { hasText: empresa }).first().click();
    await expect(page.locator('#vagasDrawer')).toHaveClass(/open/, { timeout: 5000 });

    // Deletar via drawer
    page.once('dialog', d => d.accept());
    await page.locator('#drawerBody button', { hasText: /deletar/i }).click();
    await expect(page.locator('#vagasDrawer')).not.toHaveClass(/open/, { timeout: 8000 });
    await expect(page.locator('.vagas-table', { hasText: empresa })).toBeHidden({ timeout: 5000 });
  });
});

test.describe('Aba Vagas — drawer e etapas', () => {
  test.skip(!HAS_CREDS, 'Defina ADMIN_EMAIL e ADMIN_PASSWORD');

  let jwt = null;
  const empresaDrawer = `Drawer_${Date.now()}`;

  test.beforeAll(async ({ browser }) => {
    jwt = await captureJwt(browser);
  });

  test.beforeEach(async ({ page }) => {
    await injectAndGoto(page, jwt);
    await switchToTab(page, 'vagas');
    await page.waitForSelector('.vagas-table', { timeout: 8000 });
  });

  // Cria vaga descartável antes dos testes de drawer
  async function createAndOpenVaga(page, nome) {
    await page.locator('button', { hasText: /nova vaga/i }).click();
    await page.locator('#vfEmpresa').fill(nome);
    await page.locator('#novaVagaForm button', { hasText: /criar candidatura/i }).click();
    await expect(page.locator('.vagas-table', { hasText: nome })).toBeVisible({ timeout: 8000 });
    await page.locator('.vagas-table tr', { hasText: nome }).first().click();
    await expect(page.locator('#vagasDrawer')).toHaveClass(/open/, { timeout: 5000 });
  }

  async function deleteOpenVaga(page) {
    page.once('dialog', d => d.accept());
    await page.locator('#drawerBody button', { hasText: /deletar/i }).click();
    await expect(page.locator('#vagasDrawer')).not.toHaveClass(/open/, { timeout: 8000 });
  }

  test('drawer exibe empresa e controle de resultado', async ({ page }) => {
    const nome = `Drawer_Res_${Date.now()}`;
    await createAndOpenVaga(page, nome);
    await expect(page.locator('#drawerEmpresa')).toContainText(nome);
    await expect(page.locator('#drawerResult')).toBeVisible();
    await deleteOpenVaga(page);
  });

  test('"Em processo" ativo por padrão no segmented control', async ({ page }) => {
    const nome = `Drawer_Seg_${Date.now()}`;
    await createAndOpenVaga(page, nome);
    await expect(page.locator('#drawerResult .result-seg.active.r-em_processo')).toBeVisible();
    await deleteOpenVaga(page);
  });

  test('timeline de etapas renderiza', async ({ page }) => {
    const nome = `Drawer_TL_${Date.now()}`;
    await createAndOpenVaga(page, nome);
    await expect(page.locator('#drawerTimeline')).toBeVisible();
    const labels = await page.locator('#drawerTimeline .stage-label').allInnerTexts();
    expect(labels.length).toBeGreaterThan(0);
    expect(labels).toContain('Enviado');
    await deleteOpenVaga(page);
  });

  test('etapas padrão não incluem Aprovado nem Recusado', async ({ page }) => {
    const nome = `Drawer_Stages_${Date.now()}`;
    await createAndOpenVaga(page, nome);
    const labels = await page.locator('#drawerTimeline .stage-label').allInnerTexts();
    expect(labels).not.toContain('Aprovado');
    expect(labels).not.toContain('Recusado');
    await deleteOpenVaga(page);
  });

  test('botão "Gerenciar etapas" abre o manager', async ({ page }) => {
    const nome = `Drawer_Mgr_${Date.now()}`;
    await createAndOpenVaga(page, nome);
    await page.locator('#drawerBody button', { hasText: /gerenciar etapas/i }).click();
    await expect(page.locator('#stageManagerSection')).toBeVisible({ timeout: 5000 });
    await deleteOpenVaga(page);
  });

  test('botão "Editar" abre formulário de edição', async ({ page }) => {
    const nome = `Drawer_Edit_${Date.now()}`;
    await createAndOpenVaga(page, nome);
    await page.locator('#drawerBody button', { hasText: /editar/i }).click();
    await expect(page.locator('#editVagaSection')).toBeVisible({ timeout: 5000 });
    await deleteOpenVaga(page);
  });

  test('drawer fecha ao clicar no overlay', async ({ page }) => {
    const nome = `Drawer_Ov_${Date.now()}`;
    await createAndOpenVaga(page, nome);
    await page.locator('#vagasOverlay').click({ force: true });
    await expect(page.locator('#vagasDrawer')).not.toHaveClass(/open/, { timeout: 5000 });
    // Deleta via tabela
    await page.locator('.vagas-table tr', { hasText: nome }).first().click();
    await expect(page.locator('#vagasDrawer')).toHaveClass(/open/, { timeout: 5000 });
    await deleteOpenVaga(page);
  });

  test('drawer mobile — botões de ação ficam no topo (order: -1)', async ({ page }) => {
    test.skip(({ viewport }) => !viewport || viewport.width > 600, 'Apenas mobile');
    const nome = `Drawer_Mobile_${Date.now()}`;
    await createAndOpenVaga(page, nome);
    // No mobile os botões têm order:-1, ou seja devem aparecer antes do corpo
    const actionsOrder = await page.locator('#drawerBody .drawer-actions-mobile, #drawerBody .drawer-btn-group').first().evaluate(
      el => getComputedStyle(el).order
    );
    expect(Number(actionsOrder)).toBeLessThan(0);
    await deleteOpenVaga(page);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. LOGOUT
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Logout', () => {
  test.skip(!HAS_CREDS, 'Defina ADMIN_EMAIL e ADMIN_PASSWORD');

  let jwt = null;
  test.beforeAll(async ({ browser }) => { jwt = await captureJwt(browser); });
  test.beforeEach(async ({ page }) => { await injectAndGoto(page, jwt); });

  test('botão de logout visível', async ({ page }) => {
    await expect(page.locator('.app-logout')).toBeVisible();
  });

  test('clicar em logout retorna para tela de login', async ({ page }) => {
    await page.locator('.app-logout').click();
    await expect(page.locator('#loginScreen')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#appScreen')).toBeHidden();
  });

  test('após logout JWT não persiste em sessionStorage', async ({ page }) => {
    await page.locator('.app-logout').click();
    await expect(page.locator('#loginScreen')).toBeVisible({ timeout: 5000 });
    const storedJwt = await page.evaluate(() => sessionStorage.getItem('admin_jwt'));
    expect(storedJwt).toBeFalsy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. /admin/reset — tela de redefinição de senha
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('/admin/reset', () => {
  test('página carrega com status 200', async ({ page }) => {
    const res = await page.goto('/admin/reset', { waitUntil: 'networkidle' });
    expect(res.status()).toBe(200);
  });

  test('sem token na URL: exibe mensagem de link inválido ou expirado', async ({ page }) => {
    await page.goto('/admin/reset', { waitUntil: 'networkidle' });
    const body = await page.locator('body').textContent();
    expect(body.length).toBeGreaterThan(100);
    expect(body).toMatch(/inválido|expirado|invalid|expired|link/i);
  });

  test('título da página condiz com redefinição de senha', async ({ page }) => {
    await page.goto('/admin/reset', { waitUntil: 'networkidle' });
    const title = await page.title();
    expect(title.toLowerCase()).toMatch(/reset|redefin|senha|artacho/i);
  });
});
