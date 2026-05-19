# Design: Indicadores de status na aba Segurança

**Data:** 2026-05-19
**Arquivo alvo:** `admin/index.html`, `api/admin/sessions.js`
**Status:** aprovado

---

## Contexto

A aba Segurança exibe sessões do admin com texto plano. Não há diferenciação visual entre ativa/revogada nem indicação de qual sessão é a atual. O usuário quer:
1. Identificar visualmente a sessão atual (a que está sendo usada agora)
2. Indicador de status por ponto colorido (verde = ativa, vermelho = revogada)
3. Layout com 3 linhas alinhadas, espaçado, ponto no topo junto ao IP

---

## Layout aprovado (v3)

```
[●] IP · badge          [Revogar]
    OS · Browser · arch
    Login: …  Última: …  (⊘ Motivo se revogada)
```

- Grid: `24px | 1fr | auto`, `align-items: start`
- Dot alinhado ao topo (`padding-top: 4px`)
- Padding por item: `20px 24px`
- Gap entre linhas: `5px`

---

## Indicador de status (dot)

| Estado | Cor | Efeito |
|---|---|---|
| Sessão atual | `#4ade80` (success) | Pulsante (`animation: pulse 2s infinite`) |
| Ativa (outra) | `#4ade80` (success) | Fixo, glow suave |
| Revogada | `#ef4444` (danger) | Sem glow; linha com `opacity: 0.5` |

---

## Backend: identificar sessão atual

O endpoint `GET /api/admin/sessions` precisa retornar um campo `is_current: boolean` em cada sessão.

**Implementação:**
1. Em `requireAdmin()` (ou no handler de sessions), extrair o JTI do token atual via `decoded.jti`
2. Passar o JTI atual para a query — marcar a sessão com JTI correspondente como `is_current: true`

```js
// api/admin/sessions.js (handler GET)
const cookies = parseCookies(req);
const token = cookies['admin_session'];
const decoded = jwt.decode(token); // já verificado por requireAdmin antes
const currentJti = decoded?.jti || null;

const sessions = rows.map(s => ({
  ...s,
  is_current: s.jti === currentJti,
}));
```

Nenhuma query extra — apenas comparação em memória após buscar todas as sessões.

---

## Frontend: renderização

### CSS novo

```css
/* dot */
.session-status-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.session-status-dot.current { background: var(--success); animation: session-pulse 2s infinite; }
.session-status-dot.active  { background: var(--success); box-shadow: 0 0 5px rgba(74,222,128,.35); }
.session-status-dot.revoked { background: var(--danger); }

@keyframes session-pulse {
  0%,100% { box-shadow: 0 0 6px rgba(74,222,128,.5); }
  50%     { box-shadow: 0 0 14px rgba(74,222,128,.9); }
}

/* item */
.session-item {
  display: grid;
  grid-template-columns: 24px 1fr auto;
  align-items: start;
  gap: 0 12px;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.session-item.is-current { background: rgba(34,211,238,0.025); }
.session-item.is-revoked  { opacity: 0.5; }
```

### Badge

```html
<!-- sessão atual -->
<span class="badge badge-current">Esta sessão</span>

<!-- revogada -->
<span class="badge badge-revoked">Revogada</span>
```

### Linha 2 — UA simplificado

Parsear o User Agent para exibir `"Windows · Chrome 124 · x64"` em vez da string bruta. Função utilitária leve:

```js
function parseUA(ua = '') {
  const os = /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS' : 'Desconhecido';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\/(\d+)/.test(ua) ? `Chrome ${ua.match(/Chrome\/(\d+)/)[1]}`
    : /Firefox\/(\d+)/.test(ua) ? `Firefox ${ua.match(/Firefox\/(\d+)/)[1]}`
    : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const arch = /x64|Win64|WOW64/.test(ua) ? 'x64' : /arm/i.test(ua) ? 'ARM' : '';
  return [os, browser, arch].filter(Boolean).join(' · ');
}
```

### Linha 3 — revogada

Quando `session.revoked_at`, exibir motivo ao lado das datas:
```html
<span class="revoke-reason">⊘ ${session.revoke_reason || 'revogada'}</span>
```

### Botão Revogar

- Sessão atual (`is_current: true`): **sem botão** (não faz sentido revogar a própria sessão ativa — usar "Sair" para isso)
- Sessão revogada: **sem botão**
- Outras ativas: botão "⊘ Revogar" como atualmente

---

## O que NÃO muda

- Lógica de revogação (endpoint DELETE `/api/admin/sessions`)
- Estrutura da tabela `admin_sessions` no Supabase
- Demais abas do painel

---

## LGPD

Dados exibidos são exclusivamente da sessão do próprio admin (titular visualizando seus próprios dados). Base legal: legítimo interesse em segurança (art. 7º, IX). IPs de visitantes/candidatos permanecem hasheados e não são expostos aqui.
