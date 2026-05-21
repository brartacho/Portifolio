const { test, expect } = require('@playwright/test');

test.describe('DEMO — abas novas e consumo', () => {
  test('login, Logs, Métricas e consumo de token', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));

    await page.goto('/projeto-sistema-admin.html', { waitUntil: 'domcontentloaded' });
    await page.locator('#gateBtn').click();

    // App revelado: abas presentes
    await expect(page.locator('.tab-btn[data-tab="logs"]')).toBeVisible();
    await expect(page.locator('.tab-btn[data-tab="metricas"]')).toBeVisible();

    // Aba Logs
    await page.locator('.tab-btn[data-tab="logs"]').click();
    await expect(page.locator('#logTable tr').first()).toBeVisible();
    await expect(page.locator('#kpiLogTotal')).not.toHaveText('—', { timeout: 8000 });

    // Aba Métricas
    await page.locator('.tab-btn[data-tab="metricas"]').click();
    await expect(page.locator('#mkpi-pageviews')).not.toHaveText('—', { timeout: 8000 });
    await expect(page.locator('#metricsChart')).toBeVisible();

    // Tokens: consumir um token de exemplo
    await page.locator('.tab-btn[data-tab="tokens"]').click();
    const consumeBtn = page.locator('button[onclick^="consumeToken"]').first();
    await expect(consumeBtn).toBeVisible({ timeout: 8000 });
    const popupP = page.waitForEvent('popup');
    await consumeBtn.click();
    const popup = await popupP;
    expect(popup.url()).toContain('/projeto-sistema-admin-assets/');
    await popup.close();

    expect(errors, 'erros de console: ' + errors.join(' | ')).toEqual([]);
  });
});
