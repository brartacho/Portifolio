/**
 * Smoke test do fluxo WhatsApp no admin (sem precisar logar com senha).
 * - Bypassa login injetando JWT válido em sessionStorage
 * - Garante 1 CV de teste (cria se não existir, deleta no fim)
 * - Abre modal Enviar → modo WhatsApp → confirma defaults
 * - Preenche form → clica Enviar → confirma waReadyArea + href do anchor
 * - Clica no anchor → captura nova aba → valida URL wa.me
 *
 * Uso: node scripts/test-whatsapp-flow.mjs
 */
import { chromium } from '@playwright/test';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { getSupabase } from '../api/_lib/supabase.js';

// Carrega .env.local
function loadEnv() {
    const text = readFileSync('.env.local', 'utf8');
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^([A-Z_]+)='?"?([^'"]+)'?"?$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
}
loadEnv();

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3001';
const adminJwt = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '15m' });
const supabase = getSupabase();

let testCreatedCv = null;
let createdTokenIds = [];

function ok(label) { console.log('✅ ' + label); }
function fail(label, err) { console.log('❌ ' + label + (err ? '  →  ' + err : '')); process.exitCode = 1; }

async function ensureCv() {
    const { data: existing } = await supabase
        .from('cv_versions')
        .select('id, name, file_name, file_path')
        .eq('active', true)
        .limit(1);
    if (existing?.length) {
        console.log(`📄 Usando CV existente: "${existing[0].name}"`);
        return existing[0];
    }
    // Cria placeholder temporário
    const { data: cv, error } = await supabase
        .from('cv_versions')
        .insert({
            name: '[E2E TEST] Placeholder',
            file_path: 'cv/test-placeholder-' + Date.now() + '.pdf',
            file_name: 'test_placeholder.pdf',
            active: true,
        })
        .select()
        .single();
    if (error) throw new Error('Falha ao criar CV de teste: ' + error.message);
    testCreatedCv = cv.id;
    console.log(`📄 CV de teste criado: ${cv.id}`);
    return cv;
}

async function cleanup() {
    if (createdTokenIds.length) {
        await supabase.from('download_tokens').delete().in('id', createdTokenIds);
    }
    if (testCreatedCv) {
        await supabase.from('cv_versions').delete().eq('id', testCreatedCv);
    }
    // Limpa logs órfãos do teste
    await supabase.from('download_logs').delete().like('user_agent', 'Send to E2E%');
}

(async () => {
    console.log('\n═══ Playwright smoke — fluxo WhatsApp ═══\n');

    const cv = await ensureCv();

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    try {
        // 1. Bypass login injetando JWT
        await page.goto(`${BASE}/admin`);
        await page.evaluate(t => sessionStorage.setItem('admin_jwt', t), adminJwt);
        await page.reload();
        await page.waitForFunction(
            () => document.getElementById('appScreen')?.style.display === 'block',
            { timeout: 5000 }
        );
        ok('Login bypass via JWT funcionou');

        // 2. Espera tabela de CVs popular
        await page.waitForSelector('#cvTable button[title="Enviar agora"]', { timeout: 5000 });

        // Acha o botão Enviar do nosso CV específico (busca pelo nome na linha)
        const sendBtn = page.locator(`#cvTable tr`).filter({ hasText: cv.name }).locator('button[title="Enviar agora"]').first();
        await sendBtn.click();
        await page.waitForSelector('#sendCvModal:not([hidden])', { timeout: 3000 });
        ok('Modal "Enviar Currículo" abriu');

        // 3. Switch pra WhatsApp
        await page.click('#sendModeWhatsapp');
        await page.waitForSelector('#waSubmodeGroup', { state: 'visible' });
        ok('Modo WhatsApp ativado');

        // 4. Default = "Link rastreado"
        const linkClass = await page.getAttribute('#waSubLink', 'class');
        const attachClass = await page.getAttribute('#waSubAttach', 'class');
        if (linkClass.includes('btn-cyan') && !attachClass.includes('btn-cyan')) {
            ok('Default é "Link rastreado" (cyan ativo)');
        } else {
            fail('Default deveria ser "Link rastreado"', `link=${linkClass} attach=${attachClass}`);
        }

        // 5. Estrutura do botão "Abrir WhatsApp" — anchor com target=_blank
        const tag = await page.evaluate(() => document.getElementById('waOpenLink').tagName);
        const target = await page.getAttribute('#waOpenLink', 'target');
        if (tag === 'A' && target === '_blank') {
            ok('Botão "Abrir WhatsApp" é <a target="_blank"> (não bloqueável)');
        } else {
            fail('Botão deveria ser <a target=_blank>', `tag=${tag} target=${target}`);
        }

        // 6. Preenche form
        await page.fill('#sendName', 'E2E Maria');
        await page.fill('#sendPhone', '5544988887777');
        ok('Form preenchido (nome + telefone)');

        // 7. Mensagem default deve substituir [nome] vivo
        const msg = await page.inputValue('#sendMessage');
        if (msg.includes('Olá E2E Maria')) {
            ok('Mensagem default substituiu [nome] ao digitar');
        } else {
            fail('Mensagem não substituiu [nome]', `msg starts: ${msg.slice(0, 50)}`);
        }

        // 8. Clica enviar (gera token + popula href)
        await page.click('#sendBtn');
        await page.waitForSelector('#waReadyArea:not([hidden])', { timeout: 10000 });
        ok('waReadyArea apareceu após processamento');

        // 9. Anchor href deve estar populado com wa.me/<phone>
        const finalHref = await page.getAttribute('#waOpenLink', 'href');
        if (finalHref.startsWith('https://wa.me/5544988887777?text=')) {
            ok(`Anchor href correto (${finalHref.length} chars, começa com wa.me/...)`);
        } else {
            fail('Anchor href errado', finalHref?.slice(0, 100));
        }

        // 10. Captura novo token criado pra cleanup
        const { data: newTokens } = await supabase
            .from('download_tokens')
            .select('id, label')
            .like('label', 'WhatsApp · E2E Maria%');
        createdTokenIds = (newTokens || []).map(t => t.id);

        // 11. Clica no anchor — deve abrir nova aba SEM bloqueio
        // Modal pode ter overflow interno; força scroll do anchor pra dentro do viewport antes
        await page.locator('#waOpenLink').scrollIntoViewIfNeeded();
        const popupPromise = context.waitForEvent('page', { timeout: 8000 }).catch(() => null);
        await page.click('#waOpenLink', { force: true });
        const popup = await popupPromise;
        if (popup) {
            const popupUrl = popup.url();
            // wa.me/<phone> redireciona pra api.whatsapp.com/send/?phone=<phone>&text=...
            // Aceitamos qualquer um dos dois formatos.
            const phoneOk = popupUrl.includes('5544988887777');
            const isWaDomain = /^https:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//.test(popupUrl);
            if (phoneOk && isWaDomain) {
                ok(`Anchor click abriu nova aba (sem popup blocker): ${new URL(popupUrl).host}`);
            } else {
                fail('Popup abriu mas URL inesperada', popupUrl);
            }
            await popup.close();
        } else {
            fail('Anchor click NÃO abriu nova aba (popup blocker?)', '');
        }

        console.log('\n═══ Resumo: ' + (process.exitCode ? '❌ FALHOU' : '✅ TUDO OK') + ' ═══\n');
    } catch (e) {
        fail('Exception inesperada', e.message + '\n' + e.stack);
    } finally {
        await browser.close();
        await cleanup();
    }
})();
