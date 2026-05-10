-- ============================================================
-- ARTACHO.dev — Schema de CV rastreável
-- Executar no SQL Editor do Supabase
-- ============================================================

-- ─── EXTENSÕES ───────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── TABELAS ─────────────────────────────────────────────────

-- Versões do currículo (PDFs no Storage)
create table if not exists cv_versions (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    description text,
    file_path   text not null,
    file_name   text not null,
    active      boolean not null default true,
    created_at  timestamptz not null default now()
);

-- Tokens de download
create table if not exists download_tokens (
    id             uuid primary key default gen_random_uuid(),
    token_hash     text not null unique,
    cv_version_id  uuid not null references cv_versions(id) on delete cascade,
    label          text,
    expires_at     timestamptz not null,
    max_uses       integer,
    use_count      integer not null default 0,
    revoked        boolean not null default false,
    created_at     timestamptz not null default now()
);

-- Log de downloads realizados
create table if not exists download_logs (
    id                uuid primary key default gen_random_uuid(),
    token_id          uuid references download_tokens(id) on delete set null,
    cv_version_id     uuid references cv_versions(id) on delete set null,
    cv_name_snapshot  text,        -- nome do CV gravado na hora do log (imutável)
    ip_address        text,
    user_agent        text,
    downloaded_at     timestamptz not null default now()
);

-- Rate limiting por IP
create table if not exists rate_limits (
    ip_address   text primary key,
    attempts     integer not null default 0,
    window_start timestamptz not null default now()
);

-- ─── ÍNDICES ──────────────────────────────────────────────────
create index if not exists idx_download_tokens_hash  on download_tokens(token_hash);
create index if not exists idx_download_tokens_cv    on download_tokens(cv_version_id);
create index if not exists idx_download_logs_token   on download_logs(token_id);
create index if not exists idx_download_logs_date    on download_logs(downloaded_at desc);
create index if not exists idx_rate_limits_window    on rate_limits(window_start);

-- ─── RLS ─────────────────────────────────────────────────────
-- Todas as operações passam pelo service_key (bypass RLS).
-- RLS habilitado como barreira contra uso acidental da anon key.
alter table cv_versions     enable row level security;
alter table download_tokens enable row level security;
alter table download_logs   enable row level security;
alter table rate_limits     enable row level security;

-- ─── STORAGE BUCKET ──────────────────────────────────────────
-- Criar manualmente no Supabase Dashboard:
--   Storage > New bucket > Name: "curriculos" > Private (sem acesso público)
--
-- Ou via API (requer service key com permissão de storage admin):
-- insert into storage.buckets (id, name, public)
-- values ('curriculos', 'curriculos', false)
-- on conflict do nothing;
