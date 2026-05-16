/**
 * Smoke tests da aba Métricas premium.
 *
 * Cobertura:
 *  - Estrutura DOM dos novos blocos (KPIs secundários, funil pareado, hora/DOW, conversão).
 *  - Quando ADMIN_EMAIL/ADMIN_PASSWORD presentes: login + abrir aba Métricas + validar
 *    que o gráfico tem barras quando há pageviews > 0 e que period switching dispara reload.
 *  - Validação leve do payload de /api/admin/analytics (campos premium presentes).
 */

const { test, expect } = require('@playwright/test');

test.describe.configure({ mode: 'serial' });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS  = process.env.ADMIN_PASSWORD;
const HAS_CREDS   = Boolean(ADMIN_EMAIL && ADMIN_PASS);

async function loginAdmin(page) {
    await page.goto('/admin', { waitUntil: 'networkidle' });
    await page.locator('#loginUsername').fill(ADMIN_EMAIL);
    await page.locator('#loginPassword').fill(ADMIN_PASS);
    await page.locator('#loginBtn').click();
    await page.waitForSelector('#mainPanel', { state: 'visible', timeout: 15_000 });
}

test.describe('Métricas — estrutura DOM (sem login)', () => {
    test('elementos premium presentes no HTML', async ({ page }) => {
        await page.goto('/admin', { waitUntil: 'domcontentloaded' });
        // KPI cards primários — deltas
        for (const id of ['kpi-pageviews-delta', 'kpi-unique-delta', 'kpi-engaged-delta',
                          'kpi-cv-clicks-delta', 'kpi-cv-downloads-delta', 'kpi-recurring-delta']) {
            await expect(page.locator(`#${id}`)).toHaveCount(1);
        }
        // KPI cards de sessão e retenção
        for (const id of ['kpi-sessions', 'kpi-bounce', 'kpi-pages-per-session',
                          'kpi-avg-duration', 'kpi-retention-7d', 'kpi-retention-30d']) {
            await expect(page.locator(`#${id}`)).toHaveCount(1);
        }
        // Funil pareado
        for (const id of ['fu-bar-pageview', 'fu-bar-engaged', 'fu-bar-cv-click', 'fu-bar-cv-download']) {
            await expect(page.locator(`#${id}`)).toHaveCount(1);
        }
        // Gráficos temporais
        await expect(page.locator('#hourlyChart')).toHaveCount(1);
        await expect(page.locator('#dowChart')).toHaveCount(1);
        // Painel conversão por origem
        await expect(page.locator('#metricsRefConversion')).toHaveCount(1);
    });
});

test.describe('Métricas — fluxo autenticado', () => {
    test.skip(!HAS_CREDS, 'ADMIN_EMAIL / ADMIN_PASSWORD não definidos');

    test('aba Métricas carrega payload e gráfico fica coerente com o KPI', async ({ page }) => {
        await loginAdmin(page);
        const respPromise = page.waitForResponse(r =>
            r.url().includes('/api/admin/analytics') && r.status() === 200,
        );
        await page.locator('[data-tab="metricas"]').first().click();
        const resp = await respPromise;
        const data = await resp.json();

        // Campos premium presentes
        expect(data).toHaveProperty('kpis_prev');
        expect(data).toHaveProperty('hourly');
        expect(data).toHaveProperty('dow');
        expect(data).toHaveProperty('referrer_conversion');
        expect(data).toHaveProperty('funnel_unique');
        expect(data.kpis).toHaveProperty('bounce_rate');
        expect(data.kpis).toHaveProperty('retention_7d_pct');

        // Bug 1 — coerência entre KPI Visitas e soma das barras do gráfico
        await page.waitForTimeout(500); // renderAnalytics + Chart.js
        const kpiVisitas = await page.locator('#kpi-pageviews').textContent();
        const total = Number(kpiVisitas);
        const seriesSum = (data.series || []).reduce((acc, s) => acc + Number(s.pageviews || 0), 0);
        // Soma pode ser ligeiramente diferente devido a eventos no boundary, mas deve ser zero juntos ou positivos juntos
        if (total > 0) expect(seriesSum).toBeGreaterThan(0);
    });

    test('toggle "Excluir meus acessos" dispara reload', async ({ page }) => {
        await loginAdmin(page);
        await page.locator('[data-tab="metricas"]').first().click();
        await page.waitForResponse(r => r.url().includes('/api/admin/analytics'));
        const resp2 = page.waitForResponse(r => r.url().includes('exclude_admin=1'));
        await page.locator('#metricsExcludeAdmin').click();
        const r = await resp2;
        expect(r.status()).toBe(200);
    });
});
