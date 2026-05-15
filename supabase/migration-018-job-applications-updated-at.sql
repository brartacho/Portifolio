-- ============================================================
-- ARTACHO.dev — Adiciona updated_at em job_applications
-- Permite ordenar candidaturas por última modificação.
-- ============================================================

alter table job_applications
  add column if not exists updated_at timestamptz not null default now();

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger job_applications_updated_at
  before update on job_applications
  for each row execute function set_updated_at();

-- Retroativo: registros existentes recebem o created_at como updated_at
update job_applications set updated_at = created_at;
