-- ============================================================
-- ARTACHO.dev — RPC para marcar visitas históricas do admin
-- Operação pontual: retroativamente aplica meta.admin = true
-- nos registros cujo visitor_id_hash bate com os fornecidos.
-- Chamado pelo endpoint /api/admin/mark-my-visits uma vez por dispositivo.
-- ============================================================

create or replace function mark_admin_visits(hashes text[])
returns int
language sql
as $$
  with upd as (
    update site_events
    set meta = coalesce(meta, '{}')::jsonb || '{"admin":true}'::jsonb
    where visitor_id_hash = any(hashes)
      and coalesce(meta->>'admin', '') != 'true'
    returning 1
  )
  select count(*)::int from upd;
$$;
