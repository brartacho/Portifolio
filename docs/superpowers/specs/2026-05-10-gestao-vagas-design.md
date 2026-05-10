# Design: Campos de Contexto no Modal + Gestão de Vagas

**Data:** 2026-05-10  
**Status:** Aprovado

---

## Contexto

O portfolio de Bruno Artacho possui um modal de envio de CV que coleta dados básicos do recrutador (Nome, Email, Empresa, Vaga). O objetivo desta feature é:

1. Adicionar campos opcionais de contexto ao modal (preenchidos por Bruno, não pelo recrutador)
2. Criar uma aba "Gestão de Vagas" no painel admin para rastrear todas as candidaturas com pipeline de etapas por vaga

---

## Seção 1 — Modal de Envio: Novos Campos

### Campos adicionados
Abaixo do bloco Empresa/Vaga, separados por divisor visual, três campos opcionais:

| Campo | Tipo | Placeholder |
|-------|------|-------------|
| LinkedIn da empresa | text input | `linkedin.com/company/…` |
| Link da vaga | text input | `linkedin.com/jobs/…` |
| Observações | text input | `headhunter, urgência…` |

### Layout (Opção B — sempre visível)
```
[ Nome * ]           [ Email * ]

── Contexto da vaga ──────────────────────────
[ Empresa (opcional) ] [ Vaga (opcional) ]
[ LinkedIn empresa   ] [ Link da vaga    ]
[ Observações                             ]
──────────────────────────────────────────────

[ Mensagem ]
[ Enviar ]
```

### Comportamento
- Todos os 3 campos são opcionais
- Preenchidos por Bruno no momento do envio
- **Não aparecem no email** enviado ao recrutador — são dados de rastreio interno
- Ao enviar, são persistidos em `job_applications` junto com os demais dados da candidatura

---

## Seção 2 — Modelo de Dados

### Tabela `job_applications`

```sql
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
  source           TEXT        NOT NULL DEFAULT 'manual', -- 'cv_send' | 'manual'
  stages           JSONB       NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

RLS habilitado: apenas o admin (token verificado) pode ler e escrever.

### Template padrão de etapas

Toda candidatura nasce com as 9 etapas abaixo. A ordem reflete o fluxo mais comum no mercado:

```json
[
  { "name": "Enviado",                  "done": false, "current": true,  "active": true },
  { "name": "Triagem de CV",            "done": false, "current": false, "active": true },
  { "name": "Entrevista RH",            "done": false, "current": false, "active": true },
  { "name": "Teste Técnico",            "done": false, "current": false, "active": true },
  { "name": "Entrevista Técnica",       "done": false, "current": false, "active": true },
  { "name": "Entrevista Coordenador",   "done": false, "current": false, "active": true },
  { "name": "Proposta / Oferta",        "done": false, "current": false, "active": true },
  { "name": "Aprovado",                 "done": false, "current": false, "active": true },
  { "name": "Recusado",                 "done": false, "current": false, "active": true }
]
```

### Campos por etapa

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `name` | string | Nome da etapa (editável) |
| `done` | boolean | Etapa concluída |
| `current` | boolean | Etapa atual do processo |
| `active` | boolean | `false` = etapa inativa para essa vaga (exibida em cinza) |

Regras:
- Exatamente um `current: true` por candidatura (ou nenhum se finalizada)
- Etapa inativa nunca pode ser `current: true`
- Novas etapas custom podem ser adicionadas pelo admin (inseridas no array na posição desejada)

---

## Seção 3 — API

### Consolidação (libera slot no Vercel Hobby)

`api/admin/cv-upload-url.js` + `api/admin/cv-download-url.js` → `api/admin/cv-storage-url.js`

Roteamento por método HTTP:
- `POST` → gera URL assinada de upload
- `GET` → gera URL assinada de download

### Novo endpoint: `api/admin/applications.js`

Autenticação: token de admin no header `Authorization` (mesmo padrão dos demais endpoints admin).

| Método | Ação |
|--------|------|
| `GET` | Lista todas as candidaturas, ordenadas por `data_envio DESC` |
| `POST` | Cria candidatura manual; aplica template padrão de stages |
| `PUT` | Atualiza campos gerais e/ou `stages` de uma candidatura (`?id=`) |
| `DELETE` | Deleta candidatura (`?id=`) |

### Integração com `send-cv-email.js`

Ao concluir o envio de email com sucesso, `send-cv-email.js` usa o cliente Supabase (`api/_lib/supabase.js`) para inserir diretamente um registro em `job_applications` — sem chamada HTTP para o endpoint `applications.js`. Com:
- `source: 'cv_send'`
- `gestor_nome` ← campo Nome do modal
- `gestor_email` ← campo Email do modal
- `empresa`, `vaga`, `linkedin_empresa`, `link_vaga`, `observacoes` ← novos campos do modal
- `data_envio` ← timestamp atual
- `stages` ← template padrão completo

Falha ao criar o registro **não bloqueia** o envio do email — é registrada no console mas o CV segue.

---

## Seção 4 — Admin UI: Aba "Gestão de Vagas"

### Posicionamento
Nova aba após as abas existentes no painel admin (`admin/index.html`).

### Tabela principal

**Filtros (chips):** Todas · Em processo · Aprovado · Recusado

Lógica de filtro baseada na etapa com `current: true`:
- **Em processo** = etapa atual não é "Aprovado" nem "Recusado"
- **Aprovado** = etapa atual é "Aprovado" (ou última etapa concluída é "Aprovado")
- **Recusado** = etapa atual é "Recusado"

**Colunas:** Empresa/Vaga · Gestor · Data Envio · Etapa Atual · (ação)  
**Botão:** `+ Nova vaga` (canto superior direito)

### Drawer lateral

Ao clicar em qualquer linha, abre um painel deslizante à direita (≈40% da largura) com:

**Cabeçalho:**
- Nome da empresa (destaque) + cargo
- Data de envio · source badge (cv_send / manual)
- Gestor: nome + email

**Timeline vertical de etapas:**
- ✓ verde + linha verde = etapa concluída (`done: true`)
- Círculo âmbar + glow = etapa atual (`current: true`)
- Círculo cinza pontilhado + texto opaco = etapa inativa (`active: false`)
- Círculo vazio + linha cinza = etapa futura (ativa mas não iniciada)

**Ações no drawer:**
- `✎ Editar vaga` — abre formulário inline com todos os campos da candidatura
- `⚙ Gerenciar etapas` — abre painel de etapas com toggle ativo/inativo, renomear, adicionar etapa custom, marcar como atual/concluída
- `✕ Deletar` — confirmação antes de deletar

### Gerenciador de etapas (dentro do drawer)

Lista vertical das 9 etapas padrão + eventuais custom. Para cada etapa:
- Toggle `ativo / inativo`
- Campo de texto para renomear
- Botão para marcar como etapa atual
- Botão para marcar como concluída
- Botão para adicionar nova etapa abaixo

Botão "Adicionar etapa" no fim da lista insere uma etapa custom com nome editável.

---

## Fluxo de dados — Envio automático

```
Recrutador preenche modal
         ↓
Bruno preenche campos de contexto (LinkedIn, link, observações)
         ↓
POST /api/admin/send-cv-email
         ↓
Email enviado via Resend ────────────────────→ Recrutador
         ↓
INSERT job_applications (source: 'cv_send')
         ↓
Aparece na aba "Gestão de Vagas"
```

---

## Fora do escopo

- Notificações/lembretes por etapa
- Exportação de candidaturas
- Filtro por empresa ou vaga (apenas por status)
- Histórico de alterações nas etapas
