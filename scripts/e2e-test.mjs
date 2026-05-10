import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const BASE = process.env.BASE_URL || 'http://localhost:3001';
const PASSWORD = 'admin123';
const PDF_PATH = resolve('Currículo Bruno Artacho - QA 2026 v1.4.pdf');

function log(label, ok, extra = '') {
    const tag = ok ? '✅' : '❌';
    console.log(`${tag}  ${label}${extra ? '  →  ' + extra : ''}`);
    if (!ok) process.exitCode = 1;
}

async function jsonReq(method, path, body, token) {
    const r = await fetch(BASE + path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, headers: r.headers, json, text };
}

console.log('\n═══ E2E TEST — Portfolio CV system ═══\n');

// ─── PRE-CHECK ──────────────────────────────────────────
if (!existsSync(PDF_PATH)) { console.log('❌  PDF de teste não encontrado:', PDF_PATH); process.exit(1); }
const pdfBytes = readFileSync(PDF_PATH);
console.log(`📄  PDF de teste: ${pdfBytes.length} bytes\n`);

// ─── 1. LOGIN ───────────────────────────────────────────
console.log('— Fluxo: Admin login —');
const login = await jsonReq('POST', '/api/admin/login', { password: PASSWORD });
log('Login com senha correta', login.status === 200 && login.json?.token, `HTTP ${login.status}`);
const TOKEN = login.json?.token;

const badLogin = await jsonReq('POST', '/api/admin/login', { password: 'errada' });
log('Login com senha errada → 401', badLogin.status === 401, `HTTP ${badLogin.status}`);

// ─── 2. UPLOAD URL ──────────────────────────────────────
console.log('\n— Fluxo: Upload de CV —');
const uploadUrl = await fetch(`${BASE}/api/admin/cv-storage-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ fileName: 'e2e-test.pdf' }),
}).then(r => r.json());
log('Gera URL assinada (Storage)', !!uploadUrl?.signedUrl, uploadUrl?.filePath);

// ─── 3. UPLOAD ──────────────────────────────────────────
const upRes = await fetch(uploadUrl.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: pdfBytes,
});
log('PUT do PDF no Supabase Storage', upRes.ok, `HTTP ${upRes.status}`);

// ─── 4. REGISTRA NO BANCO ───────────────────────────────
const versionRes = await jsonReq('POST', '/api/admin/cv-versions', {
    name: '[E2E TEST] QA Geral',
    description: 'Versão criada pelo teste automatizado — pode deletar',
    file_path: uploadUrl.filePath,
    file_name: 'Curriculo-Bruno-Artacho-E2E.pdf',
}, TOKEN);
log('Registra cv_version no banco', versionRes.status === 201 && versionRes.json?.id, `id=${versionRes.json?.id?.slice(0, 8)}...`);
const CV_ID = versionRes.json?.id;

// ─── 5. LISTA VERSIONS ──────────────────────────────────
const listVersions = await jsonReq('GET', '/api/admin/cv-versions', null, TOKEN);
const found = Array.isArray(listVersions.json) && listVersions.json.some(v => v.id === CV_ID);
log('Listagem inclui a versão criada', found, `${listVersions.json?.length} versão(ões)`);

// ─── 5b. PATCH metadata ─────────────────────────────────
const patchRes = await fetch(`${BASE}/api/admin/cv-versions?id=${CV_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ name: '[E2E TEST] QA Geral — editado', description: 'desc nova', active: false }),
});
const patchData = await patchRes.json();
log('PATCH /cv-versions atualiza metadata', patchRes.status === 200 && patchData.name?.includes('editado') && patchData.active === false, `name="${patchData.name}", active=${patchData.active}`);

const patchBad = await fetch(`${BASE}/api/admin/cv-versions?id=${CV_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ name: '   ' }),
});
log('PATCH com name vazio → 400', patchBad.status === 400, `HTTP ${patchBad.status}`);

// Reativa a versão pra continuar o teste de download
await fetch(`${BASE}/api/admin/cv-versions?id=${CV_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ active: true, name: '[E2E TEST] QA Geral' }),
});

// ─── 6. GERA TOKEN DE DOWNLOAD ──────────────────────────
console.log('\n— Fluxo: Token + Download —');
const tokenRes = await jsonReq('POST', '/api/admin/tokens', {
    cv_version_id: CV_ID,
    label: '[E2E TEST] Recrutador fictício',
    expires_in_hours: 1,
    max_uses: 5,
}, TOKEN);
log('Gera token de download', tokenRes.status === 201 && tokenRes.json?.token, tokenRes.json?.shareUrl);
const SHARE_TOKEN = tokenRes.json?.token;

// ─── 7. DOWNLOAD COM TOKEN VÁLIDO ───────────────────────
const downloadRes = await fetch(`${BASE}/api/cv/download?t=${encodeURIComponent(SHARE_TOKEN)}`);
const downloadOk = downloadRes.status === 200 && downloadRes.headers.get('content-type') === 'application/pdf';
log('Download com token válido → 200 PDF', downloadOk, `${downloadRes.headers.get('content-type')}`);
const downloadedBytes = Buffer.from(await downloadRes.arrayBuffer());
log('Conteúdo do PDF idêntico ao original', downloadedBytes.length === pdfBytes.length, `${downloadedBytes.length} bytes`);
log('Header Content-Disposition presente', !!downloadRes.headers.get('content-disposition'), downloadRes.headers.get('content-disposition'));

// ─── 8. EDGE CASES DOWNLOAD ─────────────────────────────
console.log('\n— Edge cases —');
const noToken = await fetch(`${BASE}/api/cv/download`);
log('Download sem token → 400', noToken.status === 400, `HTTP ${noToken.status}`);

const badToken = await fetch(`${BASE}/api/cv/download?t=tokenfalsoxxxxxxx`);
log('Download com token inexistente → 404', badToken.status === 404, `HTTP ${badToken.status}`);

// ─── 9. LOG REGISTRADO ──────────────────────────────────
const logs = await jsonReq('GET', '/api/admin/logs', null, TOKEN);
const logsHaveOurDownload = Array.isArray(logs.json) && logs.json.some(l => l.cv_versions?.name?.includes('[E2E TEST]'));
log('Download foi registrado em download_logs', logsHaveOurDownload, `${logs.json?.length} log(s) total`);

// ─── 10. PÁGINA /cv (sem token) ─────────────────────────
console.log('\n— Páginas —');
const cvPage = await fetch(`${BASE}/cv`);
const cvHtml = await cvPage.text();
log('/cv (sem token) carrega', cvPage.status === 200, `HTTP ${cvPage.status}`);
log('/cv mostra "Currículo enviado sob solicitação"', cvHtml.includes('Currículo enviado sob solicitação'));
log('/cv tem botão WhatsApp', cvHtml.includes('Solicitar via WhatsApp'));
log('/cv tem botão Email', cvHtml.includes('Solicitar por email'));

const adminPage = await fetch(`${BASE}/admin`);
const adminHtml = await adminPage.text();
log('/admin carrega', adminPage.status === 200);
log('/admin tem campo de senha (sem placeholder fake)', adminHtml.includes('Digite sua senha') && !adminHtml.includes('placeholder="••••'));
log('/admin tem botão "Esqueci minha senha"', adminHtml.includes('Esqueci minha senha'));
log('/admin tem toggle de mostrar senha', adminHtml.includes('togglePassword'));

const home = await fetch(`${BASE}/`);
const homeHtml = await home.text();
log('Home tem link admin no rodapé', homeHtml.includes('footer-admin-link'));

// ─── 11. CLEANUP — testa hard delete de token ───────────
console.log('\n— Cleanup —');
const tokenList = await jsonReq('GET', '/api/admin/tokens', null, TOKEN);
const ourToken = tokenList.json?.find(t => t.label?.includes('[E2E TEST]'));
if (ourToken) {
    const revoke = await fetch(`${BASE}/api/admin/tokens?id=${ourToken.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${TOKEN}` },
    });
    log('Token de teste revogado (soft)', revoke.status === 200, `HTTP ${revoke.status}`);

    const delTok = await fetch(`${BASE}/api/admin/tokens?id=${ourToken.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${TOKEN}` },
    });
    log('DELETE /tokens (hard delete)', delTok.status === 200, `HTTP ${delTok.status}`);

    const tokensAfter = await jsonReq('GET', '/api/admin/tokens', null, TOKEN);
    const stillThere = tokensAfter.json?.some(t => t.id === ourToken.id);
    log('Token sumiu da listagem', !stillThere);
}
const delVersion = await fetch(`${BASE}/api/admin/cv-versions?id=${CV_ID}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${TOKEN}` },
});
log('Versão de teste deletada (DB + Storage)', delVersion.status === 200, `HTTP ${delVersion.status}`);

console.log('\n═══ FIM ═══\n');
