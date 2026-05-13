const { test, expect } = require('@playwright/test');

// Cenários de gestão de etapas e resultado da candidatura.
// Cobre a refatoração que separou `result` (em_processo/aprovado/recusado)
// das etapas (Triagem, Entrevistas, etc.).
//
// Cada teste cria uma vaga manual descartável, exercita o fluxo, e deleta.

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS  = process.env.ADMIN_PASSWORD;
const HAS_CREDS   = Boolean(ADMIN_EMAIL && ADMIN_PASS);

let _adminJwt = null;

test.describe('ADMIN — Gestão de etapas', () => {
  test.skip(!HAS_CREDS, 'Defina ADMIN_EMAIL e ADMIN_PASSWORD para rodar');

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const pg  = await ctx.newPage();
    await pg.goto('/admin', { waitUntil: 'networkidle' });
    await pg.locator('#loginUsername').fill(ADMIN_EMAIL);
    await pg.locator('#loginPassword').fill(ADMIN_PASS);
    await pg.locator('#loginBtn').click();
    await pg.waitForSelector('.app-logout', { state: 'visible', timeout: 12000 }).catch(() => {});
    _adminJwt = await pg.evaluate(() => sessionStorage.getItem('admin_jwt'));
    await ctx.close();
  });

  test.beforeEach(async ({ page }) => {
    if (_adminJwt) await page.addInitScript((jwt) => sessionStorage.setItem('admin_jwt', jwt), _adminJwt);
    await page.goto('/admin', { waitUntil: 'networkidle' });
    await page.waitForSelector('.app-logout', { state: 'visible', timeout: 10000 }).catch(() => {});
    // Vai pra aba Gestão de Vagas
    await page.locator('.tab-btn').filter({ hasText: /vaga/i }).first().click();
    await expect(page.locator('.vagas-table')).toBeVisible();
  });

  async function createTempVaga(page, empresa) {
    await page.locator('button', { hasText: /nova vaga/i }).click();
    await expect(page.locator('#novaVagaForm')).toBeVisible();
    await page.locator('#novaVagaForm input[name="empresa"], #novaVagaForm [id*="mpresa" i]').first().fill(empresa);
    await page.locator('#novaVagaForm button', { hasText: /salvar|criar/i }).first().click();
    // Aguarda aparecer na tabela
    await expect(page.locator('.vagas-table', { hasText: empresa })).toBeVisible({ timeout: 5000 });
  }

  async function openVaga(page, empresa) {
    await page.locator('.vagas-table tr', { hasText: empresa }).first().click();
    await expect(page.locator('#vagasDrawer.open')).toBeVisible();
  }

  async function deleteOpenVaga(page) {
    await page.locator('#drawerBody .btn-danger').click();
    await expect(page.locator('#confirmModal')).toHaveClass(/open/, { timeout: 5000 });
    await page.evaluate(() => document.getElementById('confirmOkBtn').click());
    await expect(page.locator('#vagasDrawer')).not.toHaveClass(/open/);
  }

  test('default stages não inclui Aprovado nem Recusado', async ({ page }) => {
    const empresa = `TestVaga_${Date.now()}`;
    await createTempVaga(page, empresa);
    await openVaga(page, empresa);

    // Timeline deve mostrar 7 etapas padrão (não 9)
    const labels = await page.locator('#drawerTimeline .stage-label').allInnerTexts();
    expect(labels).not.toContain('Aprovado');
    expect(labels).not.toContain('Recusado');
    expect(labels).toContain('Enviado');
    expect(labels).toContain('Proposta');

    await deleteOpenVaga(page);
  });

  test('segmented control de Resultado aparece e Em processo ativo por padrão', async ({ page }) => {
    const empresa = `TestRes_${Date.now()}`;
    await createTempVaga(page, empresa);
    await openVaga(page, empresa);

    const seg = page.locator('#drawerResult');
    await expect(seg).toBeVisible();
    await expect(seg.locator('.result-seg.active.r-em_processo')).toBeVisible();
    await expect(seg.locator('.result-seg.active.r-aprovado')).toHaveCount(0);

    await deleteOpenVaga(page);
  });

  test('setar Resultado=Aprovado atualiza badge e filtro sem mexer em etapas', async ({ page }) => {
    const empresa = `TestApp_${Date.now()}`;
    await createTempVaga(page, empresa);
    await openVaga(page, empresa);

    // Snapshot do número de etapas com status 'running' antes
    const runningBefore = await page.locator('#drawerTimeline .stage-circle.current').count();

    // Clica em Aprovado
    await page.locator('#drawerResult .result-seg', { hasText: /aprovado/i }).click();
    await expect(page.locator('#drawerResult .result-seg.active.r-aprovado')).toBeVisible();

    // Etapas continuam intocadas
    const runningAfter = await page.locator('#drawerTimeline .stage-circle.current').count();
    expect(runningAfter).toBe(runningBefore);

    // Linha na tabela ganha o badge aprovado
    await expect(page.locator('.vagas-table .stage-badge.status-aprovado')).toBeVisible();

    await deleteOpenVaga(page);
  });

  test('setar status em etapa não cascateia para outras', async ({ page }) => {
    const empresa = `TestCascade_${Date.now()}`;
    await createTempVaga(page, empresa);
    await openVaga(page, empresa);

    // Abre o manager
    await page.locator('#drawerBody button', { hasText: /gerenciar etapas/i }).click();
    const manager = page.locator('#stageManagerSection');
    await expect(manager).toBeVisible();

    // Marca a 3ª etapa (Entrevista RH) como done (✓)
    const row3 = manager.locator('.stage-manager-row').nth(2);
    await row3.locator('.sm-status-btn[title*="Aprovado" i]').click();

    // Etapas 1 e 2 continuam intocadas (Enviado=running por default, Triagem=pending)
    const row1 = manager.locator('.stage-manager-row').nth(0);
    const row2 = manager.locator('.stage-manager-row').nth(1);
    await expect(row1.locator('.sm-status-btn.active.st-running')).toBeVisible(); // Enviado segue executando
    await expect(row2.locator('.sm-status-btn.active.st-pending')).toBeVisible(); // Triagem segue pendente
    await expect(row3.locator('.sm-status-btn.active.st-done')).toBeVisible();    // RH agora done

    await deleteOpenVaga(page);
  });

  test('etapa desativada (toggle off) some da timeline mas permanece no manager', async ({ page }) => {
    const empresa = `TestHide_${Date.now()}`;
    await createTempVaga(page, empresa);
    await openVaga(page, empresa);

    const labelsBefore = await page.locator('#drawerTimeline .stage-label').count();

    await page.locator('#drawerBody button', { hasText: /gerenciar etapas/i }).click();
    const manager = page.locator('#stageManagerSection');
    await expect(manager).toBeVisible();

    // Desativa "Teste Técnico" (4ª etapa)
    await manager.locator('.stage-manager-row').nth(3).locator('.stage-toggle').click();
    await expect(manager.locator('.stage-manager-row').nth(3)).toHaveClass(/inactive/);

    // Timeline perde 1 entrada
    await expect(page.locator('#drawerTimeline .stage-label')).toHaveCount(labelsBefore - 1);
    const labelsAfter = await page.locator('#drawerTimeline .stage-label').allInnerTexts();
    expect(labelsAfter).not.toContain('Teste Técnico');

    await deleteOpenVaga(page);
  });
});
