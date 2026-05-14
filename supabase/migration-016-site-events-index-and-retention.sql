-- ============================================================
-- ARTACHO.dev — Índice parcial + retenção automática de site_events
-- 1. Índice parcial em meta->>'admin' para acelerar o filtro exclude_admin
-- 2. pg_cron: apaga site_events com mais de 365 dias (todo dia 1 às 03h UTC)
-- 3. pg_cron: apaga admin_login_attempts com mais de 90 dias (todo dia 1 às 03h UTC)
-- ============================================================

-- 1. Índice parcial — só indexa linhas onde meta->>'admin' = 'true' (fração mínima da tabela)
create index if not exists idx_site_events_meta_admin
  on site_events ((meta->>'admin'))
  where meta->>'admin' = 'true';

-- 2. Retenção de site_events: apaga eventos com mais de 365 dias
select cron.schedule(
  'site_events_cleanup',
  '0 3 1 * *',
  $$delete from site_events where occurred_at < now() - interval '365 days'$$
);

-- 3. Retenção de login attempts: apaga tentativas com mais de 90 dias
select cron.schedule(
  'login_attempts_cleanup',
  '0 3 1 * *',
  $$delete from admin_login_attempts where attempted_at < now() - interval '90 days'$$
);
