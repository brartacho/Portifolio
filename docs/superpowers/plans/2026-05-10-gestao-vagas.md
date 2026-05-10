# Gestão de Vagas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar campos de contexto ao modal de envio de CV e criar aba "Gestão de Vagas" no painel admin com pipeline de etapas por candidatura.

**Architecture:** Tabela `job_applications` no Supabase com etapas em JSONB. API CRUD em `api/admin/applications.js` (slot liberado consolidando dois endpoints). Admin UI em `admin/index.html` com nova aba, tabela com filtros e drawer lateral com timeline de etapas.

**Tech Stack:** Vanilla JS (admin), Vercel Serverless Functions (Node/ESM), Supabase (PostgreSQL + RLS), JWT auth via `api/_lib/auth.js`.

---

## Mapa de arquivos

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| Criar | `api/_lib/stages.js` | Template padrão de etapas (9 estágios) |
| Criar | `api/admin/cv-storage-url.js` | Upload URL (POST) + Download URL (GET) — consolidado |
| Criar | `api/admin/applications.js` | CRUD de candidaturas |
| Modificar | `api/admin/send-cv-email.js` | Aceita 3 novos campos + insere em job_applications |
| Modificar | `admin/index.html` | Modal campos + aba + tabela + drawer + JS |
| Modificar | `tests/api.spec.js` | Atualiza path cv-storage-url + add applications endpoint |
| Modificar | `scripts/e2e-test.mjs` | Atualiza path cv-upload-url → cv-storage-url |
| Deletar | `api/admin/cv-upload-url.js` | Substituído por cv-storage-url |
| Deletar | `api/admin/cv-download-url.js` | Substituído por cv-storage-url |

---

## Task 1: Supabase — criar tabela job_applications

**Files:**
- Executar SQL no dashboard Supabase (Settings → SQL Editor)

- [ ] **Step 1: Executar migração no Supabase**

Abra o SQL Editor do Supabase e execute:

```sql
-- Tabela principal de candidaturas
CREATE TABLE job_applications (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa          TEXT        NOT NULL,
  vaga             TEXT,
  linkedin_empresa TEXT,
  link_vaga        TEXT,
  observacoes      TEXT,
  gestor_nome      TEXT,
  gestor_email     TEXT,
  data_envio       TIMESTAMPTZ,
  source           TEXT        NOT NULL DEFAULT 'manual',
  stages           JSONB       NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: apenas service_role (backend) pode acessar
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role only"
  ON job_applications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

- [ ] **Step 2: Verificar tabela criada**

No SQL Editor, execute:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'job_applications'
ORDER BY ordinal_position;
```

Expected: 12 colunas listadas (id, empresa, vaga, linkedin_empresa, link_vaga, observacoes, gestor_nome, gestor_email, data_envio, source, stages, created_at).

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "feat(db): cria tabela job_applications com RLS no Supabase"
```

---

## Task 2: Template padrão de etapas

**Files:**
- Create: `api/_lib/stages.js`

- [ ] **Step 1: Criar api/_lib/stages.js**

```js
export const DEFAULT_STAGES = [
    { name: 'Enviado',                  done: false, current: true,  active: true },
    { name: 'Triagem de CV',            done: false, current: false, active: true },
    { name: 'Entrevista RH',            done: false, current: false, active: true },
    { name: 'Teste Técnico',            done: false, current: false, active: true },
    { name: 'Entrevista Técnica',       done: false, current: false, active: true },
    { name: 'Entrevista Coordenador',   done: false, current: false, active: true },
    { name: 'Proposta / Oferta',        done: false, current: false, active: true },
    { name: 'Aprovado',                 done: false, current: false, active: true },
    { name: 'Recusado',                 done: false, current: false, active: true },
];
```

- [ ] **Step 2: Commit**

```bash
git add api/_lib/stages.js
git commit -m "feat(api): template padrão de etapas do processo seletivo"
```

---

## Task 3: Consolidar cv-storage-url.js

**Files:**
- Create: `api/admin/cv-storage-url.js`
- Modify: `admin/index.html` (3 call sites)
- Modify: `tests/api.spec.js`
- Modify: `scripts/e2e-test.mjs`
- Delete: `api/admin/cv-upload-url.js`
- Delete: `api/admin/cv-download-url.js`

- [ ] **Step 1: Criar api/admin/cv-storage-url.js**

```js
import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase, BUCKET } from '../_lib/supabase.js';
import { normalizeFileName } from '../_lib/filename.js';

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;

    const supabase = getSupabase();

    // POST → gera URL assinada de upload
    if (req.method === 'POST') {
        const { fileName } = req.body || {};
        if (!fileName) return res.status(400).json({ error: 'fileName obrigatório' });

        const safe = normalizeFileName(fileName);
        const filePath = `cv/${Date.now()}_${safe}`;

        const { data, error } = await supabase.storage
            .from(BUCKET())
            .createSignedUploadUrl(filePath);

        if (error) return res.status(500).json({ error: error.message });

        return res.status(200).json({
            signedUrl: data.signedUrl,
            filePath,
            token: data.token,
        });
    }

    // GET → gera URL assinada de download
    if (req.method === 'GET') {
        const { id, recipient, channel, empresa, vaga } = req.query;
        if (!id) return res.status(400).json({ error: 'ID obrigatório' });

        const { data: cv, error: cvErr } = await supabase
            .from('cv_versions')
            .select('name, file_path, file_name')
            .eq('id', id)
            .single();

        if (cvErr || !cv) return res.status(404).json({ error: 'Versão de CV não encontrada' });

        const safeFileName = normalizeFileName(cv.file_name);

        if (recipient && channel) {
            const cleanRecipient = String(recipient).replace(/[\r\n\t]/g, '').trim().slice(0, 200);
            const cleanChannel = String(channel).replace(/[^a-z-]/gi, '').toLowerCase().slice(0, 50);
            if (cleanRecipient && cleanChannel) {
                const s = v => v ? String(v).replace(/[\r\n\t]/g, '').trim() : null;
                await supabase.from('download_logs').insert({
                    cv_version_id: id,
                    cv_name_snapshot: cv.name,
                    cv_id_snapshot: id,
                    ip_address: `admin-send-${cleanChannel}`,
                    user_agent: `Send to ${cleanRecipient} via ${cleanChannel} (manual attach)`,
                    empresa: s(empresa)?.slice(0, 200) || null,
                    vaga:    s(vaga)?.slice(0, 200)    || null,
                }).then(() => {}, () => {});
            }
        }

        const { data: signed, error: signErr } = await supabase
            .storage
            .from(BUCKET())
            .createSignedUrl(cv.file_path, 60, { download: safeFileName });

        if (signErr || !signed) return res.status(500).json({ error: signErr?.message || 'Falha ao gerar URL' });

        return res.status(200).json({
            signedUrl: signed.signedUrl,
            file_name: safeFileName,
        });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
```

- [ ] **Step 2: Atualizar admin/index.html — chamada de upload (linha ~2143)**

Localizar:
```js
const { signedUrl, filePath } = await api('GET', `/api/admin/cv-upload-url?fileName=${encodeURIComponent(selectedFile.name)}`);
```

Substituir por:
```js
const { signedUrl, filePath } = await api('POST', '/api/admin/cv-storage-url', { fileName: selectedFile.name });
```

- [ ] **Step 3: Atualizar admin/index.html — chamada de download direto (linha ~1765)**

Localizar:
```js
const dl = await api('GET', `/api/admin/cv-download-url?id=${id}`);
```

Substituir por:
```js
const dl = await api('GET', `/api/admin/cv-storage-url?id=${id}`);
```

- [ ] **Step 4: Atualizar admin/index.html — download no fluxo WA attachment (linha ~2509)**

Localizar:
```js
const dlUrl = `/api/admin/cv-download-url?id=${_sendCv.id}`
    + `&recipient=${encodeURIComponent(name)}&channel=whatsapp`
    + (empresa ? `&empresa=${encodeURIComponent(empresa)}` : '')
    + (vaga    ? `&vaga=${encodeURIComponent(vaga)}`       : '');
```

Substituir por:
```js
const dlUrl = `/api/admin/cv-storage-url?id=${_sendCv.id}`
    + `&recipient=${encodeURIComponent(name)}&channel=whatsapp`
    + (empresa ? `&empresa=${encodeURIComponent(empresa)}` : '')
    + (vaga    ? `&vaga=${encodeURIComponent(vaga)}`       : '');
```

- [ ] **Step 5: Atualizar tests/api.spec.js**

Localizar:
```js
{ method: 'GET',  path: '/api/admin/cv-download-url' },
{ method: 'GET',  path: '/api/admin/cv-upload-url' },
```

Substituir por:
```js
{ method: 'GET',  path: '/api/admin/cv-storage-url' },
{ method: 'POST', path: '/api/admin/cv-storage-url' },
```

- [ ] **Step 6: Atualizar scripts/e2e-test.mjs**

Localizar (linha ~47):
```js
const uploadUrl = await fetch(`${BASE}/api/admin/cv-upload-url?fileName=e2e-test.pdf`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
}).then(r => r.json());
log('Gera URL assinada (Storage)', !!uploadUrl?.signedUrl, uploadUrl?.filePath);
```

Substituir por:
```js
const uploadUrl = await fetch(`${BASE}/api/admin/cv-storage-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ fileName: 'e2e-test.pdf' }),
}).then(r => r.json());
log('Gera URL assinada (Storage)', !!uploadUrl?.signedUrl, uploadUrl?.filePath);
```

- [ ] **Step 7: Deletar arquivos antigos**

```bash
git rm api/admin/cv-upload-url.js api/admin/cv-download-url.js
```

- [ ] **Step 8: Commit**

```bash
git add api/admin/cv-storage-url.js admin/index.html tests/api.spec.js scripts/e2e-test.mjs
git commit -m "refactor(api): consolida cv-upload-url e cv-download-url em cv-storage-url"
```

---

## Task 4: Novos campos no modal de envio

**Files:**
- Modify: `admin/index.html` (HTML modal + openSendCV() + sendCV())

- [ ] **Step 1: Adicionar inputs ao modal HTML**

Localizar o bloco de "Contexto da vaga" no modal (buscar pela string `sendVaga`):

```html
        <!-- Contexto da vaga — campos opcionais de rastreio -->
        <div style="border-top:1px solid rgba(255,255,255,0.06);margin:6px 0 10px;padding-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="form-group" style="margin:0">
                <label for="sendEmpresa" style="font-size:0.78rem">Empresa <span style="color:var(--text-dim);font-weight:400">(opcional)</span></label>
                <input type="text" id="sendEmpresa" placeholder="Nubank, iFood…" maxlength="200" autocomplete="off" data-form-type="other">
            </div>
            <div class="form-group" style="margin:0">
                <label for="sendVaga" style="font-size:0.78rem">Vaga <span style="color:var(--text-dim);font-weight:400">(opcional)</span></label>
                <input type="text" id="sendVaga" placeholder="Sr QA, Tech Lead…" maxlength="200" autocomplete="off" data-form-type="other">
            </div>
        </div>
```

Substituir por:

```html
        <!-- Contexto da vaga — campos opcionais de rastreio -->
        <div style="border-top:1px solid rgba(255,255,255,0.06);margin:6px 0 6px;padding-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="form-group" style="margin:0">
                <label for="sendEmpresa" style="font-size:0.78rem">Empresa <span style="color:var(--text-dim);font-weight:400">(opcional)</span></label>
                <input type="text" id="sendEmpresa" placeholder="Nubank, iFood…" maxlength="200" autocomplete="off" data-form-type="other">
            </div>
            <div class="form-group" style="margin:0">
                <label for="sendVaga" style="font-size:0.78rem">Vaga <span style="color:var(--text-dim);font-weight:400">(opcional)</span></label>
                <input type="text" id="sendVaga" placeholder="Sr QA, Tech Lead…" maxlength="200" autocomplete="off" data-form-type="other">
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:6px">
            <div class="form-group" style="margin:0">
                <label for="sendLinkedinEmpresa" style="font-size:0.78rem">LinkedIn da empresa <span style="color:var(--text-dim);font-weight:400">(opcional)</span></label>
                <input type="text" id="sendLinkedinEmpresa" placeholder="linkedin.com/company/…" maxlength="300" autocomplete="off" data-form-type="other">
            </div>
            <div class="form-group" style="margin:0">
                <label for="sendLinkVaga" style="font-size:0.78rem">Link da vaga <span style="color:var(--text-dim);font-weight:400">(opcional)</span></label>
                <input type="text" id="sendLinkVaga" placeholder="linkedin.com/jobs/…" maxlength="500" autocomplete="off" data-form-type="other">
            </div>
        </div>
        <div class="form-group" style="margin-bottom:10px">
            <label for="sendObservacoes" style="font-size:0.78rem">Observações <span style="color:var(--text-dim);font-weight:400">(opcional)</span></label>
            <input type="text" id="sendObservacoes" placeholder="headhunter, urgência, referência…" maxlength="500" autocomplete="off" data-form-type="other">
        </div>
```

- [ ] **Step 2: Atualizar openSendCV() para limpar novos campos**

Localizar em `openSendCV()`:
```js
    document.getElementById('sendEmpresa').value = '';
    document.getElementById('sendVaga').value    = '';
```

Substituir por:
```js
    document.getElementById('sendEmpresa').value         = '';
    document.getElementById('sendVaga').value            = '';
    document.getElementById('sendLinkedinEmpresa').value = '';
    document.getElementById('sendLinkVaga').value        = '';
    document.getElementById('sendObservacoes').value     = '';
```

- [ ] **Step 3: Atualizar sendCV() para ler novos campos**

Localizar em `sendCV()`:
```js
    const empresa = document.getElementById('sendEmpresa').value.trim();
    const vaga    = document.getElementById('sendVaga').value.trim();
```

Substituir por:
```js
    const empresa          = document.getElementById('sendEmpresa').value.trim();
    const vaga             = document.getElementById('sendVaga').value.trim();
    const linkedinEmpresa  = document.getElementById('sendLinkedinEmpresa').value.trim();
    const linkVaga         = document.getElementById('sendLinkVaga').value.trim();
    const observacoes      = document.getElementById('sendObservacoes').value.trim();
```

- [ ] **Step 4: Passar novos campos no POST /api/admin/send-cv-email**

Localizar o bloco de chamada da API de email em `sendCV()`:
```js
                const r = await api('POST', '/api/admin/send-cv-email', {
                    cv_version_id: _sendCv.id,
                    recipient_name: name,
                    recipient_email: email,
                    message: message || null,
                    empresa: empresa || null,
                    vaga:    vaga    || null,
                });
```

Substituir por:
```js
                const r = await api('POST', '/api/admin/send-cv-email', {
                    cv_version_id:    _sendCv.id,
                    recipient_name:   name,
                    recipient_email:  email,
                    message:          message || null,
                    empresa:          empresa          || null,
                    vaga:             vaga             || null,
                    linkedin_empresa: linkedinEmpresa  || null,
                    link_vaga:        linkVaga         || null,
                    observacoes:      observacoes      || null,
                });
```

- [ ] **Step 5: Commit**

```bash
git add admin/index.html
git commit -m "feat(admin): adiciona campos linkedin_empresa, link_vaga e observacoes ao modal de envio"
```

---

## Task 5: Atualizar send-cv-email.js

**Files:**
- Modify: `api/admin/send-cv-email.js`

- [ ] **Step 1: Adicionar import do template de etapas**

Localizar no topo do arquivo:
```js
import { checkRateLimit } from '../_lib/rate-limit.js';
```

Substituir por:
```js
import { checkRateLimit } from '../_lib/rate-limit.js';
import { DEFAULT_STAGES } from '../_lib/stages.js';
```

- [ ] **Step 2: Extrair novos campos do body**

Localizar:
```js
    const { cv_version_id, recipient_name, recipient_email, message, empresa, vaga, notas, contato } = req.body || {};
```

Substituir por:
```js
    const {
        cv_version_id, recipient_name, recipient_email, message,
        empresa, vaga, linkedin_empresa, link_vaga, observacoes,
    } = req.body || {};
```

- [ ] **Step 3: Inserir registro em job_applications após envio**

Localizar (logo após o bloco `sendEmail` bem sucedido, antes do log `download_logs`):
```js
    // Log de envio
    await supabase.from('download_logs').insert({
```

Inserir ANTES dessa linha:
```js
    // Registra candidatura (fire & forget — não bloqueia o envio)
    supabase.from('job_applications').insert({
        empresa:          empresa          ? clean(empresa).slice(0, 200)          : 'N/A',
        vaga:             vaga             ? clean(vaga).slice(0, 200)             : null,
        linkedin_empresa: linkedin_empresa ? clean(linkedin_empresa).slice(0, 300) : null,
        link_vaga:        link_vaga        ? clean(link_vaga).slice(0, 500)        : null,
        observacoes:      observacoes      ? clean(observacoes).slice(0, 500)      : null,
        gestor_nome:      name,
        gestor_email:     email,
        data_envio:       new Date().toISOString(),
        source:           'cv_send',
        stages:           DEFAULT_STAGES,
    }).then(() => {}, (e) => console.error('[job_applications] insert failed:', e.message));

```

- [ ] **Step 4: Limpar referências obsoletas (notas/contato) no log de download_logs**

Localizar em download_logs:
```js
        notas:   notas   ? clean(notas).slice(0, 500)   : null,
        contato: contato ? clean(contato).slice(0, 300) : null,
```

Substituir por (removendo campos que não existem mais no schema):
```js
```

(Deletar as duas linhas — notas e contato foram removidos do modal anteriormente.)

- [ ] **Step 5: Commit**

```bash
git add api/admin/send-cv-email.js
git commit -m "feat(api): send-cv-email aceita novos campos e registra candidatura automaticamente"
```

---

## Task 6: applications.js — API CRUD

**Files:**
- Create: `api/admin/applications.js`

- [ ] **Step 1: Criar api/admin/applications.js**

```js
import { requireAdmin, cors } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { DEFAULT_STAGES } from '../_lib/stages.js';

const TEXT_MAX = { empresa: 200, vaga: 200, linkedin_empresa: 300, link_vaga: 500, observacoes: 500, gestor_nome: 100, gestor_email: 120 };

function clean(str, max) {
    if (typeof str !== 'string') return null;
    return str.replace(/[ --]/g, '').trim().slice(0, max) || null;
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!requireAdmin(req, res)) return;

    const supabase = getSupabase();

    // GET — lista todas as candidaturas
    if (req.method === 'GET') {
        const { data, error } = await supabase
            .from('job_applications')
            .select('*')
            .order('data_envio', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json(data);
    }

    // POST — cria candidatura manual
    if (req.method === 'POST') {
        const { empresa, vaga, linkedin_empresa, link_vaga, observacoes, gestor_nome, gestor_email, data_envio } = req.body || {};

        const emp = clean(empresa, TEXT_MAX.empresa);
        if (!emp) return res.status(400).json({ error: 'empresa obrigatório' });

        const { data, error } = await supabase
            .from('job_applications')
            .insert({
                empresa:          emp,
                vaga:             clean(vaga, TEXT_MAX.vaga),
                linkedin_empresa: clean(linkedin_empresa, TEXT_MAX.linkedin_empresa),
                link_vaga:        clean(link_vaga, TEXT_MAX.link_vaga),
                observacoes:      clean(observacoes, TEXT_MAX.observacoes),
                gestor_nome:      clean(gestor_nome, TEXT_MAX.gestor_nome),
                gestor_email:     clean(gestor_email, TEXT_MAX.gestor_email),
                data_envio:       data_envio || null,
                source:           'manual',
                stages:           DEFAULT_STAGES,
            })
            .select()
            .single();

        if (error) return res.status(500).json({ error: error.message });
        return res.status(201).json(data);
    }

    // PUT — atualiza candidatura (?id=)
    if (req.method === 'PUT') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id obrigatório' });

        const { empresa, vaga, linkedin_empresa, link_vaga, observacoes, gestor_nome, gestor_email, data_envio, stages } = req.body || {};

        const patch = {};
        if (empresa          !== undefined) patch.empresa          = clean(empresa, TEXT_MAX.empresa);
        if (vaga             !== undefined) patch.vaga             = clean(vaga, TEXT_MAX.vaga);
        if (linkedin_empresa !== undefined) patch.linkedin_empresa = clean(linkedin_empresa, TEXT_MAX.linkedin_empresa);
        if (link_vaga        !== undefined) patch.link_vaga        = clean(link_vaga, TEXT_MAX.link_vaga);
        if (observacoes      !== undefined) patch.observacoes      = clean(observacoes, TEXT_MAX.observacoes);
        if (gestor_nome      !== undefined) patch.gestor_nome      = clean(gestor_nome, TEXT_MAX.gestor_nome);
        if (gestor_email     !== undefined) patch.gestor_email     = clean(gestor_email, TEXT_MAX.gestor_email);
        if (data_envio       !== undefined) patch.data_envio       = data_envio;
        if (stages           !== undefined) {
            // Valida estrutura mínima: array de objetos com name
            if (!Array.isArray(stages) || stages.some(s => typeof s.name !== 'string')) {
                return res.status(400).json({ error: 'stages deve ser array de objetos com name (string)' });
            }
            // Garante que apenas um current:true por vez
            const currentCount = stages.filter(s => s.current && s.active !== false).length;
            if (currentCount > 1) return res.status(400).json({ error: 'Apenas uma etapa pode ser current:true' });
            patch.stages = stages;
        }

        if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

        const { data, error } = await supabase
            .from('job_applications')
            .update(patch)
            .eq('id', id)
            .select()
            .single();

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'Candidatura não encontrada' });
        return res.status(200).json(data);
    }

    // DELETE — deleta candidatura (?id=)
    if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id obrigatório' });

        const { error } = await supabase
            .from('job_applications')
            .delete()
            .eq('id', id);

        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
```

- [ ] **Step 2: Commit**

```bash
git add api/admin/applications.js
git commit -m "feat(api): endpoint CRUD /api/admin/applications para gestão de vagas"
```

---

## Task 7: Admin UI — Aba + Tabela

**Files:**
- Modify: `admin/index.html`

- [ ] **Step 1: Adicionar botão de aba na nav**

Localizar:
```html
        <button class="tab-btn" onclick="switchTab('logs', this)"><i class="fa-solid fa-chart-bar"></i> Logs</button>
```

Adicionar logo após:
```html
        <button class="tab-btn" onclick="switchTab('vagas', this)"><i class="fa-solid fa-briefcase"></i> Gestão de Vagas</button>
```

- [ ] **Step 2: Registrar a aba no switchTab()**

Localizar em `switchTab()`:
```js
    if (name === 'logs') loadLogs();
```

Adicionar após:
```js
    if (name === 'vagas') loadApplications();
```

- [ ] **Step 3: Adicionar CSS para drawer e timeline**

Localizar o CSS de media query final (buscar `@media (max-width: 768px)` na última ocorrência) e adicionar ANTES do fechamento `</style>`:

```css
        /* ─── GESTÃO DE VAGAS ───────────────────── */
        .vagas-filters { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; }
        .vagas-filter-chip {
            font-size:0.75rem; padding:5px 14px; border-radius:20px; border:1px solid var(--border-soft);
            background:transparent; color:var(--text-soft); cursor:pointer; transition:all 0.15s;
        }
        .vagas-filter-chip.active { background:var(--cyan-soft); border-color:var(--cyan); color:var(--cyan); }

        .vagas-table { width:100%; border-collapse:collapse; }
        .vagas-table th {
            text-align:left; font-size:0.68rem; text-transform:uppercase; letter-spacing:0.06em;
            color:var(--text-dim); padding:8px 10px; border-bottom:1px solid var(--border-soft);
        }
        .vagas-table td { padding:10px 10px; border-bottom:1px solid rgba(255,255,255,0.03); vertical-align:middle; }
        .vagas-table tr { cursor:pointer; transition:background 0.1s; }
        .vagas-table tr:hover td { background:rgba(255,255,255,0.02); }
        .vagas-table tr.selected td { background:rgba(34,211,238,0.04); }

        .stage-badge {
            display:inline-block; font-size:0.65rem; padding:2px 8px; border-radius:4px; font-weight:500;
        }
        .stage-badge.status-em-processo { background:rgba(234,179,8,0.12); color:#eab308; }
        .stage-badge.status-aprovado    { background:rgba(74,222,128,0.12); color:#4ade80; }
        .stage-badge.status-recusado    { background:rgba(239,68,68,0.12); color:#f87171; }
        .stage-badge.status-enviado     { background:rgba(99,102,241,0.12); color:#818cf8; }

        /* Drawer */
        .vagas-drawer-overlay {
            position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:200;
            opacity:0; pointer-events:none; transition:opacity 0.2s;
        }
        .vagas-drawer-overlay.open { opacity:1; pointer-events:all; }

        .vagas-drawer {
            position:fixed; top:0; right:0; bottom:0; width:420px; max-width:95vw;
            background:var(--bg-elevated); border-left:1px solid var(--border);
            z-index:201; display:flex; flex-direction:column;
            transform:translateX(100%); transition:transform 0.25s ease;
            overflow:hidden;
        }
        .vagas-drawer.open { transform:translateX(0); }

        .drawer-header {
            padding:20px 20px 14px; border-bottom:1px solid var(--border-soft);
            display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
            flex-shrink:0;
        }
        .drawer-body { flex:1; overflow-y:auto; padding:16px 20px; display:flex; flex-direction:column; gap:16px; }
        .drawer-close { background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:1.1rem; padding:2px; }
        .drawer-close:hover { color:var(--text); }

        /* Timeline de etapas */
        .stage-timeline { display:flex; flex-direction:column; gap:0; }
        .stage-row { display:flex; gap:12px; align-items:flex-start; }
        .stage-row:last-child .stage-line { display:none; }
        .stage-icon-col { display:flex; flex-direction:column; align-items:center; width:20px; flex-shrink:0; }
        .stage-circle {
            width:20px; height:20px; border-radius:50%; flex-shrink:0;
            display:flex; align-items:center; justify-content:center; font-size:0.6rem;
        }
        .stage-circle.done    { background:#22c55e; color:#fff; }
        .stage-circle.current { background:#eab308; box-shadow:0 0 8px rgba(234,179,8,0.4); }
        .stage-circle.inactive{ border:1px dashed #334155; background:transparent; }
        .stage-circle.pending { border:1px solid #334155; background:transparent; }
        .stage-line { width:1px; flex:1; min-height:12px; margin:2px 0; }
        .stage-line.done    { background:#22c55e; }
        .stage-line.current { background:linear-gradient(#eab308, #334155); }
        .stage-line.other   { background:#1e2030; }
        .stage-label {
            font-size:0.72rem; padding:1px 0 12px; line-height:1.3;
            transition:opacity 0.15s;
        }
        .stage-label.inactive { opacity:0.3; }
        .stage-label.done     { color:#22c55e; }
        .stage-label.current  { color:#eab308; font-weight:600; }
        .stage-label.pending  { color:var(--text-dim); }

        /* Gerenciador de etapas */
        .stage-manager { display:flex; flex-direction:column; gap:6px; }
        .stage-manager-row {
            display:flex; align-items:center; gap:8px; padding:8px 10px;
            border:1px solid var(--border-soft); border-radius:8px;
            background:var(--bg-surface); transition:opacity 0.15s;
        }
        .stage-manager-row.inactive { opacity:0.45; }
        .stage-toggle { cursor:pointer; color:var(--text-dim); font-size:0.85rem; }
        .stage-toggle.active { color:var(--cyan); }
        .stage-name-input {
            flex:1; background:transparent; border:none; color:var(--text); font-size:0.78rem;
            font-family:var(--font-display); outline:none;
        }
        .stage-name-input:focus { color:var(--cyan); }
```

- [ ] **Step 4: Adicionar HTML do painel "vagas" e drawer**

Localizar o fechamento `</div>` do último `tab-panel` existente (buscar por `id="tab-logs"` e sua div de fechamento). Adicionar após o fechamento desse painel:

```html
        <!-- ─── TAB: GESTÃO DE VAGAS ──────────────────────────────────── -->
        <div id="tab-vagas" class="tab-panel">

            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
                <div class="vagas-filters" id="vagasFilters">
                    <button class="vagas-filter-chip active" data-filter="all" onclick="setVagasFilter('all',this)">Todas</button>
                    <button class="vagas-filter-chip" data-filter="em-processo" onclick="setVagasFilter('em-processo',this)">Em processo</button>
                    <button class="vagas-filter-chip" data-filter="aprovado" onclick="setVagasFilter('aprovado',this)">Aprovado</button>
                    <button class="vagas-filter-chip" data-filter="recusado" onclick="setVagasFilter('recusado',this)">Recusado</button>
                </div>
                <button class="btn btn-sm btn-cyan" onclick="openNovaVaga()"><i class="fa-solid fa-plus"></i> Nova vaga</button>
            </div>

            <div id="vagasTableWrap" style="overflow-x:auto">
                <table class="vagas-table">
                    <thead>
                        <tr>
                            <th>Empresa / Vaga</th>
                            <th>Gestor</th>
                            <th>Enviado em</th>
                            <th>Etapa atual</th>
                        </tr>
                    </thead>
                    <tbody id="vagasTableBody">
                        <tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:32px">Carregando…</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
```

Adicionar ANTES do fechamento `</div>` do `<div class="app-content">` (logo antes de `</div>` que fecha o app-content):

```html
        <!-- ─── DRAWER: DETALHE DA CANDIDATURA ──────────────────────── -->
        <div class="vagas-drawer-overlay" id="vagasOverlay" onclick="closeDrawer()"></div>
        <div class="vagas-drawer" id="vagasDrawer">
            <div class="drawer-header">
                <div id="drawerTitle" style="flex:1">
                    <div id="drawerEmpresa" style="font-size:1rem;font-weight:700;color:var(--cyan)">—</div>
                    <div id="drawerVaga" style="font-size:0.78rem;color:var(--text-soft);margin-top:2px">—</div>
                    <div id="drawerMeta" style="font-size:0.68rem;color:var(--text-dim);margin-top:6px">—</div>
                </div>
                <button class="drawer-close" onclick="closeDrawer()"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="drawer-body" id="drawerBody">
                <!-- Preenchido por renderDrawer() -->
            </div>
        </div>
```

- [ ] **Step 5: Adicionar JS — variáveis e funções de carregamento**

Localizar no JS (buscar por `// ─── TABS ─────`). Adicionar ANTES dessa linha:

```js
// ─── GESTÃO DE VAGAS ──────────────────────────────────────
let _applications = [];
let _vagasFilter  = 'all';
let _openAppId    = null;

function getAppStatus(app) {
    const curr = (app.stages || []).find(s => s.current && s.active !== false);
    if (!curr) return 'em-processo';
    const n = curr.name;
    if (n === 'Aprovado')  return 'aprovado';
    if (n === 'Recusado')  return 'recusado';
    if (n === 'Enviado')   return 'enviado';
    return 'em-processo';
}

function getAppCurrentStageName(app) {
    const curr = (app.stages || []).find(s => s.current && s.active !== false);
    return curr ? curr.name : '—';
}

async function loadApplications() {
    const tbody = document.getElementById('vagasTableBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:32px">Carregando…</td></tr>';
    try {
        _applications = await api('GET', '/api/admin/applications');
        renderApplicationsTable();
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--danger);padding:32px">${esc(e.message)}</td></tr>`;
    }
}

function renderApplicationsTable() {
    const tbody = document.getElementById('vagasTableBody');
    const filtered = _vagasFilter === 'all'
        ? _applications
        : _applications.filter(a => getAppStatus(a) === _vagasFilter);

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:32px">Nenhuma candidatura encontrada.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(app => {
        const status  = getAppStatus(app);
        const stage   = esc(getAppCurrentStageName(app));
        const empresa = esc(app.empresa || '—');
        const vaga    = esc(app.vaga || '');
        const gestor  = esc(app.gestor_nome || '—');
        const dt      = app.data_envio ? fmtDate(app.data_envio) : '—';
        const selected = _openAppId === app.id ? ' selected' : '';
        return `<tr class="${selected}" onclick="openDrawer('${app.id}')">
            <td>
                <div style="font-size:0.82rem;font-weight:500">${empresa}</div>
                ${vaga ? `<div style="font-size:0.72rem;color:var(--text-soft)">${vaga}</div>` : ''}
            </td>
            <td style="font-size:0.75rem;color:var(--text-soft)">${gestor}</td>
            <td style="font-size:0.72rem;color:var(--text-dim)">${dt}</td>
            <td><span class="stage-badge status-${status}">${stage}</span></td>
        </tr>`;
    }).join('');
}

function setVagasFilter(filter, btn) {
    _vagasFilter = filter;
    document.querySelectorAll('.vagas-filter-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderApplicationsTable();
}
```

- [ ] **Step 6: Commit**

```bash
git add admin/index.html
git commit -m "feat(admin): aba Gestão de Vagas com tabela e filtros de status"
```

---

## Task 8: Drawer lateral + timeline de etapas

**Files:**
- Modify: `admin/index.html`

- [ ] **Step 1: Adicionar funções do drawer e timeline**

Adicionar no JS (logo após o bloco da Task 7):

```js
function openDrawer(id) {
    _openAppId = id;
    const app = _applications.find(a => a.id === id);
    if (!app) return;

    document.getElementById('drawerEmpresa').textContent = app.empresa || '—';
    document.getElementById('drawerVaga').textContent    = app.vaga || '';
    const srcBadge = app.source === 'cv_send' ? '📧 via envio' : '✎ manual';
    const dt = app.data_envio ? fmtDate(app.data_envio) : '—';
    document.getElementById('drawerMeta').textContent = `${dt} · ${srcBadge}`;

    renderDrawerBody(app);

    document.getElementById('vagasDrawer').classList.add('open');
    document.getElementById('vagasOverlay').classList.add('open');
    renderApplicationsTable();
}

function closeDrawer() {
    _openAppId = null;
    document.getElementById('vagasDrawer').classList.remove('open');
    document.getElementById('vagasOverlay').classList.remove('open');
    renderApplicationsTable();
}

function renderDrawerBody(app) {
    const body = document.getElementById('drawerBody');

    const gestor = app.gestor_nome
        ? `<div style="font-size:0.75rem;color:var(--text-soft)">
               <i class="fa-solid fa-user" style="color:var(--text-dim);margin-right:4px"></i>
               ${esc(app.gestor_nome)}
               ${app.gestor_email ? ` &lt;<a href="mailto:${esc(app.gestor_email)}" style="color:var(--cyan)">${esc(app.gestor_email)}</a>&gt;` : ''}
           </div>` : '';

    const links = [
        app.linkedin_empresa ? `<a href="${esc(app.linkedin_empresa)}" target="_blank" rel="noopener" style="color:var(--cyan);font-size:0.72rem"><i class="fa-brands fa-linkedin"></i> LinkedIn empresa</a>` : '',
        app.link_vaga        ? `<a href="${esc(app.link_vaga)}" target="_blank" rel="noopener" style="color:var(--cyan);font-size:0.72rem"><i class="fa-solid fa-link"></i> Link da vaga</a>` : '',
    ].filter(Boolean).join(' · ');

    const obs = app.observacoes
        ? `<div style="font-size:0.72rem;color:var(--text-soft);background:var(--bg-surface);padding:8px 10px;border-radius:6px">${esc(app.observacoes)}</div>`
        : '';

    body.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:6px">
            ${gestor}
            ${links ? `<div style="display:flex;gap:10px;flex-wrap:wrap">${links}</div>` : ''}
            ${obs}
        </div>

        <div>
            <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-dim);margin-bottom:10px">Processo seletivo</div>
            <div class="stage-timeline" id="drawerTimeline">
                ${renderTimeline(app.stages || [])}
            </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:4px;border-top:1px solid var(--border-soft)">
            <button class="btn btn-sm" onclick="openEditVaga('${app.id}')"><i class="fa-solid fa-pen"></i> Editar vaga</button>
            <button class="btn btn-sm" onclick="toggleStageManager('${app.id}')"><i class="fa-solid fa-gear"></i> Gerenciar etapas</button>
            <button class="btn btn-sm" style="margin-left:auto;color:var(--danger);border-color:var(--danger-soft)"
                onclick="deleteApplication('${app.id}')"><i class="fa-solid fa-trash"></i> Deletar</button>
        </div>

        <div id="stageManagerSection" hidden></div>
        <div id="editVagaSection" hidden></div>
    `;
}

function renderTimeline(stages) {
    return stages.map((s, i) => {
        const isLast = i === stages.length - 1;
        let circleClass, lineClass, labelClass, content = '';
        if (!s.active) {
            circleClass = 'inactive'; lineClass = 'other'; labelClass = 'inactive';
        } else if (s.done) {
            circleClass = 'done'; lineClass = 'done'; labelClass = 'done';
            content = '<i class="fa-solid fa-check" style="font-size:0.55rem"></i>';
        } else if (s.current) {
            circleClass = 'current'; lineClass = 'current'; labelClass = 'current';
        } else {
            circleClass = 'pending'; lineClass = 'other'; labelClass = 'pending';
        }
        return `<div class="stage-row">
            <div class="stage-icon-col">
                <div class="stage-circle ${circleClass}">${content}</div>
                ${!isLast ? `<div class="stage-line ${lineClass}"></div>` : ''}
            </div>
            <div class="stage-label ${labelClass}">${esc(s.name)}</div>
        </div>`;
    }).join('');
}

async function deleteApplication(id) {
    if (!confirm('Deletar esta candidatura? Esta ação não pode ser desfeita.')) return;
    try {
        await api('DELETE', `/api/admin/applications?id=${id}`);
        closeDrawer();
        await loadApplications();
        showToast('Candidatura removida.');
    } catch (e) {
        showToast(e.message, 'error');
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add admin/index.html
git commit -m "feat(admin): drawer lateral com timeline de etapas para candidaturas"
```

---

## Task 9: Gerenciador de etapas

**Files:**
- Modify: `admin/index.html`

- [ ] **Step 1: Adicionar funções do gerenciador**

Adicionar no JS (após o bloco da Task 8):

```js
let _stageManagerOpen = false;

function toggleStageManager(appId) {
    const section = document.getElementById('stageManagerSection');
    if (_stageManagerOpen) {
        section.hidden = true;
        _stageManagerOpen = false;
        return;
    }
    const app = _applications.find(a => a.id === appId);
    if (!app) return;
    renderStageManager(app);
    section.hidden = false;
    _stageManagerOpen = true;
}

function renderStageManager(app) {
    const section = document.getElementById('stageManagerSection');
    const rows = app.stages.map((s, i) => `
        <div class="stage-manager-row${!s.active ? ' inactive' : ''}" id="smRow${i}">
            <span class="stage-toggle${s.active ? ' active' : ''}" title="${s.active ? 'Ativa — clique para inativar' : 'Inativa — clique para ativar'}"
                  onclick="toggleStageActive('${app.id}',${i})">
                <i class="fa-solid fa-${s.active ? 'toggle-on' : 'toggle-off'}"></i>
            </span>
            <input class="stage-name-input" value="${esc(s.name)}" maxlength="80"
                   onblur="renameStage('${app.id}',${i},this.value)"
                   onkeydown="if(event.key==='Enter')this.blur()">
            <span style="display:flex;gap:4px">
                ${s.active && !s.done && !s.current ? `<button class="btn btn-sm" style="padding:2px 7px;font-size:0.65rem" title="Marcar como etapa atual" onclick="setCurrentStage('${app.id}',${i})"><i class="fa-solid fa-circle-dot"></i></button>` : ''}
                ${s.active && s.current ? `<button class="btn btn-sm" style="padding:2px 7px;font-size:0.65rem;color:var(--success)" title="Marcar como concluída" onclick="markStageDone('${app.id}',${i})"><i class="fa-solid fa-check"></i></button>` : ''}
            </span>
        </div>
    `).join('');

    section.innerHTML = `
        <div style="border-top:1px solid var(--border-soft);padding-top:12px">
            <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-dim);margin-bottom:10px">Gerenciar etapas</div>
            <div class="stage-manager" id="stageManagerList">${rows}</div>
            <button class="btn btn-sm" style="margin-top:8px;width:100%" onclick="addCustomStage('${app.id}')">
                <i class="fa-solid fa-plus"></i> Adicionar etapa
            </button>
        </div>
    `;
}

async function patchStages(appId, stages) {
    const updated = await api('PUT', `/api/admin/applications?id=${appId}`, { stages });
    const idx = _applications.findIndex(a => a.id === appId);
    if (idx !== -1) _applications[idx] = updated;
    renderDrawerBody(updated);
    renderApplicationsTable();
    toggleStageManager(appId); // reabrir manager após update
    toggleStageManager(appId);
    return updated;
}

async function toggleStageActive(appId, stageIdx) {
    const app = _applications.find(a => a.id === appId);
    if (!app) return;
    const stages = app.stages.map((s, i) => i === stageIdx ? { ...s, active: !s.active, current: false } : s);
    try { await patchStages(appId, stages); } catch (e) { showToast(e.message, 'error'); }
}

async function renameStage(appId, stageIdx, newName) {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const app = _applications.find(a => a.id === appId);
    if (!app || app.stages[stageIdx].name === trimmed) return;
    const stages = app.stages.map((s, i) => i === stageIdx ? { ...s, name: trimmed } : s);
    try { await patchStages(appId, stages); } catch (e) { showToast(e.message, 'error'); }
}

async function setCurrentStage(appId, stageIdx) {
    const app = _applications.find(a => a.id === appId);
    if (!app) return;
    const stages = app.stages.map((s, i) => ({
        ...s,
        current: i === stageIdx && s.active !== false,
        done:    i < stageIdx && s.active !== false ? true : s.done,
    }));
    try { await patchStages(appId, stages); } catch (e) { showToast(e.message, 'error'); }
}

async function markStageDone(appId, stageIdx) {
    const app = _applications.find(a => a.id === appId);
    if (!app) return;
    const stages = app.stages.map((s, i) => {
        if (i === stageIdx) return { ...s, done: true, current: false };
        const nextActive = app.stages.findIndex((ns, ni) => ni > stageIdx && ns.active !== false);
        if (i === nextActive) return { ...s, current: true };
        return s;
    });
    try { await patchStages(appId, stages); } catch (e) { showToast(e.message, 'error'); }
}

async function addCustomStage(appId) {
    const name = prompt('Nome da nova etapa:');
    if (!name || !name.trim()) return;
    const app = _applications.find(a => a.id === appId);
    if (!app) return;
    const stages = [...app.stages, { name: name.trim(), done: false, current: false, active: true }];
    try { await patchStages(appId, stages); } catch (e) { showToast(e.message, 'error'); }
}
```

- [ ] **Step 2: Commit**

```bash
git add admin/index.html
git commit -m "feat(admin): gerenciador de etapas — ativar/inativar, renomear, marcar atual/concluída, adicionar custom"
```

---

## Task 10: Formulários — Nova vaga e Editar vaga

**Files:**
- Modify: `admin/index.html`

- [ ] **Step 1: Adicionar funções dos formulários**

Adicionar no JS (após o bloco da Task 9):

```js
function vagaFormHTML(app) {
    const v = (field, max) => `value="${esc(app?.[field] || '')}" maxlength="${max}"`;
    return `
        <div style="border-top:1px solid var(--border-soft);padding-top:12px;display:flex;flex-direction:column;gap:10px">
            <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-dim)">${app ? 'Editar candidatura' : 'Nova candidatura'}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div class="form-group" style="margin:0">
                    <label style="font-size:0.75rem">Empresa *</label>
                    <input id="vfEmpresa" class="mock-input" placeholder="Nubank…" ${v('empresa',200)} autocomplete="off" data-form-type="other">
                </div>
                <div class="form-group" style="margin:0">
                    <label style="font-size:0.75rem">Vaga</label>
                    <input id="vfVaga" class="mock-input" placeholder="Sr QA…" ${v('vaga',200)} autocomplete="off" data-form-type="other">
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div class="form-group" style="margin:0">
                    <label style="font-size:0.75rem">LinkedIn empresa</label>
                    <input id="vfLinkedin" class="mock-input" placeholder="linkedin.com/company/…" ${v('linkedin_empresa',300)} autocomplete="off" data-form-type="other">
                </div>
                <div class="form-group" style="margin:0">
                    <label style="font-size:0.75rem">Link da vaga</label>
                    <input id="vfLinkVaga" class="mock-input" placeholder="linkedin.com/jobs/…" ${v('link_vaga',500)} autocomplete="off" data-form-type="other">
                </div>
            </div>
            <div class="form-group" style="margin:0">
                <label style="font-size:0.75rem">Observações</label>
                <input id="vfObs" class="mock-input" placeholder="headhunter, urgência…" ${v('observacoes',500)} autocomplete="off" data-form-type="other">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div class="form-group" style="margin:0">
                    <label style="font-size:0.75rem">Gestor (nome)</label>
                    <input id="vfGestorNome" class="mock-input" placeholder="Maria Silva" ${v('gestor_nome',100)} autocomplete="off" data-form-type="other">
                </div>
                <div class="form-group" style="margin:0">
                    <label style="font-size:0.75rem">Gestor (email)</label>
                    <input id="vfGestorEmail" class="mock-input" placeholder="m.silva@empresa.com" ${v('gestor_email',120)} autocomplete="off" data-form-type="other">
                </div>
            </div>
            <div class="form-group" style="margin:0">
                <label style="font-size:0.75rem">Data de envio</label>
                <input id="vfDataEnvio" type="date" class="mock-input" value="${app?.data_envio ? app.data_envio.slice(0,10) : ''}" autocomplete="off">
            </div>
            <div style="display:flex;gap:8px">
                <button class="btn btn-cyan btn-sm" style="flex:1" onclick="${app ? `saveEditVaga('${app.id}')` : 'saveNovaVaga()'}">
                    <i class="fa-solid fa-check"></i> ${app ? 'Salvar' : 'Criar candidatura'}
                </button>
                <button class="btn btn-sm" onclick="${app ? 'closeEditVaga()' : 'closeNovaVaga()'}">Cancelar</button>
            </div>
            <p id="vfMsg" hidden style="font-size:0.78rem"></p>
        </div>
    `;
}

// Nova vaga (formulário inline no corpo da aba, acima da tabela)
function openNovaVaga() {
    const existing = document.getElementById('novaVagaForm');
    if (existing) { existing.remove(); return; }
    const wrap = document.createElement('div');
    wrap.id = 'novaVagaForm';
    wrap.innerHTML = vagaFormHTML(null);
    document.getElementById('vagasTableWrap').before(wrap);
    document.getElementById('vfEmpresa').focus();
}
function closeNovaVaga() {
    document.getElementById('novaVagaForm')?.remove();
}
async function saveNovaVaga() {
    const msg = document.getElementById('vfMsg');
    const empresa = document.getElementById('vfEmpresa').value.trim();
    if (!empresa) { msg.textContent = 'Empresa é obrigatório.'; msg.hidden = false; return; }
    try {
        await api('POST', '/api/admin/applications', {
            empresa,
            vaga:             document.getElementById('vfVaga').value.trim() || null,
            linkedin_empresa: document.getElementById('vfLinkedin').value.trim() || null,
            link_vaga:        document.getElementById('vfLinkVaga').value.trim() || null,
            observacoes:      document.getElementById('vfObs').value.trim() || null,
            gestor_nome:      document.getElementById('vfGestorNome').value.trim() || null,
            gestor_email:     document.getElementById('vfGestorEmail').value.trim() || null,
            data_envio:       document.getElementById('vfDataEnvio').value || null,
        });
        closeNovaVaga();
        await loadApplications();
        showToast('Candidatura criada.');
    } catch (e) {
        msg.textContent = e.message;
        msg.hidden = false;
    }
}

// Editar vaga (formulário inline no drawer)
function openEditVaga(appId) {
    const section = document.getElementById('editVagaSection');
    const app = _applications.find(a => a.id === appId);
    if (!app) return;
    section.innerHTML = vagaFormHTML(app);
    section.hidden = false;
}
function closeEditVaga() {
    document.getElementById('editVagaSection').hidden = true;
}
async function saveEditVaga(appId) {
    const msg = document.getElementById('vfMsg');
    const empresa = document.getElementById('vfEmpresa').value.trim();
    if (!empresa) { msg.textContent = 'Empresa é obrigatório.'; msg.hidden = false; return; }
    try {
        const updated = await api('PUT', `/api/admin/applications?id=${appId}`, {
            empresa,
            vaga:             document.getElementById('vfVaga').value.trim() || null,
            linkedin_empresa: document.getElementById('vfLinkedin').value.trim() || null,
            link_vaga:        document.getElementById('vfLinkVaga').value.trim() || null,
            observacoes:      document.getElementById('vfObs').value.trim() || null,
            gestor_nome:      document.getElementById('vfGestorNome').value.trim() || null,
            gestor_email:     document.getElementById('vfGestorEmail').value.trim() || null,
            data_envio:       document.getElementById('vfDataEnvio').value || null,
        });
        const idx = _applications.findIndex(a => a.id === appId);
        if (idx !== -1) _applications[idx] = updated;
        renderDrawerBody(updated);
        renderApplicationsTable();
        showToast('Candidatura atualizada.');
    } catch (e) {
        msg.textContent = e.message;
        msg.hidden = false;
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add admin/index.html
git commit -m "feat(admin): formulários Nova vaga e Editar vaga no painel de gestão"
```

---

## Task 11: Atualizar testes

**Files:**
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Adicionar testes para /api/admin/applications**

Em `tests/api.spec.js`, localizar o array `protectedEndpoints` e adicionar as entradas do novo endpoint:

```js
    { method: 'GET',    path: '/api/admin/applications' },
    { method: 'POST',   path: '/api/admin/applications' },
    { method: 'PUT',    path: '/api/admin/applications' },
    { method: 'DELETE', path: '/api/admin/applications' },
```

Adicionar também (ao final do arquivo, antes do `}` final do describe principal, ou como novo describe):

```js
test.describe('API — /api/admin/applications (sem auth)', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE'];
    for (const method of methods) {
        test(`${method} /api/admin/applications sem auth → 401`, async ({ request }) => {
            let res;
            if (method === 'GET' || method === 'DELETE') {
                res = await request.fetch('/api/admin/applications', { method });
            } else {
                res = await request.fetch('/api/admin/applications', { method, data: {} });
            }
            expect(res.status()).toBe(401);
        });
    }
});
```

- [ ] **Step 2: Rodar os testes**

```bash
npx playwright test tests/api.spec.js
```

Expected: todos os testes passam (os novos retornam 401 sem auth, o que é correto).

- [ ] **Step 3: Commit**

```bash
git add tests/api.spec.js
git commit -m "test(api): adiciona testes de auth para /api/admin/applications e cv-storage-url"
```

---

## Task 12: Deploy e verificação final

- [ ] **Step 1: Push e aguardar deploy**

```bash
git push origin main
```

Aguardar o deploy no Vercel (~1-2 min).

- [ ] **Step 2: Verificar no Vercel**

No dashboard do Vercel, confirmar que há exatamente **12 funções** após a consolidação (cv-storage-url substituiu as duas antigas).

- [ ] **Step 3: Smoke test no browser**

1. Abrir o painel admin em produção
2. Navegar para aba "Gestão de Vagas" — tabela deve carregar (vazia)
3. Clicar em "+ Nova vaga" — preencher e salvar — candidatura aparece na tabela
4. Clicar na linha — drawer abre com timeline de etapas
5. Clicar "Gerenciar etapas" — toggle de ativar/inativar funciona
6. Clicar "Editar vaga" — formulário preenchido, salvar atualiza dados
7. Abrir modal de envio de CV — verificar 3 novos campos presentes
8. Enviar CV por email — candidatura aparece automaticamente em "Gestão de Vagas" com source "cv_send"
9. Clicar "Deletar" — confirmação + remoção da tabela

- [ ] **Step 4: Commit final se necessário**

Se houve ajustes no smoke test:
```bash
git add -p
git commit -m "fix(admin): ajustes pós-smoke-test na gestão de vagas"
git push origin main
```
