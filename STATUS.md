# Status do Projeto — Portfolio Bruno Artacho

> Última atualização: 2026-05-18 (tarde)

## Entregue em produção

### Frontend público
- Hero com indicador "Disponível para oportunidades"
- Skills grid 2x2 (QA · Automação · APIs · Stack) com Playwright, PyAutoGUI, Postman, Insomnia
- Seção Formação + 5 certificações
- Animações scroll com IntersectionObserver
- Self-host de fontes, ícones e libs (zero CDN externo)

### Painel Admin
- Login com cookie httpOnly + JTI revogável + sessions
- Hardening de segurança fase 1 e 2 (alertas Telegram, CSP, rate limit)
- 6 abas: CVs · Tokens · Vagas · Logs · Segurança · Métricas
- Mobile UX completa (bottom nav, cards, drawer full-screen, touch targets 48px)
- Drag-and-drop de etapas com SortableJS + undo/redo
- Preview de PDF em modal
- Lazy loading por aba + auto-refresh 60s
- Análise de vagas com 5 modos de gráfico + export CSV
- Auto-vínculo de CV e WhatsApp nas mensagens (migration 019)
- Drawer com preview do CV enviado + link wa.me clicável

### Demo / Showcase (`/projeto-sistema-admin`)
- Banco descartável para demonstração pública com reset automático
- **3 abas espelham produção** (CVs · Tokens · Vagas) com dados fictícios isolados por sessão:
  - **CVs**: storage card real, upload zone com drag-and-drop, upload simulado em 4 fases
  - **Tokens**: 5 KPIs clicáveis, preset chips, bulk (Estender+24h/Revogar/Excluir), Limpar expirados
  - **Vagas**: toolbar (Filtros/Selecionar/Exportar CSV/Nova), sort chip, bulk Arquivar/Excluir, sub-aba Análise (KPIs, chart 5 modos, 4 distribuições)
- Endpoints `api/demo.js` via `?resource=` (cv-versions, tokens, applications, logs, analytics, storage-stats)

### Infraestrutura
- Vercel Functions consolidadas em **12 functions** (dentro do limite Hobby) via dispatcher pattern:
  - `api/cv.js` (download + request-by-email via `?action=`)
  - `api/demo.js` (multi-resource via `?resource=`)
  - `api/admin/*` (9 endpoints, applications.js sub-roteia via `?__h=`)

## Stack
HTML5 · CSS3 · JavaScript (frontend) · Node.js + Vercel Functions (admin) · Supabase (DB + Storage) · Playwright (E2E)

## Próximos passos
Nenhum trabalho em aberto. Novas features via issues.
