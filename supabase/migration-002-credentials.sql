-- ============================================================
-- Migration 002 — Admin credentials & password recovery
-- Executar no SQL Editor do Supabase
-- ============================================================

-- Credenciais do admin armazenadas no banco (sobrepõe ADMIN_PASSWORD_HASH do .env quando existe).
create table if not exists admin_credentials (
    id            uuid primary key default gen_random_uuid(),
    password_hash text not null,
    updated_at    timestamptz not null default now()
);

-- Tokens de recuperação de senha (one-shot, expiração curta).
create table if not exists password_resets (
    id          uuid primary key default gen_random_uuid(),
    token_hash  text not null unique,
    expires_at  timestamptz not null,
    used        boolean not null default false,
    created_at  timestamptz not null default now()
);

create index if not exists idx_password_resets_hash on password_resets(token_hash);
create index if not exists idx_password_resets_exp  on password_resets(expires_at);

alter table admin_credentials enable row level security;
alter table password_resets   enable row level security;

-- Garantir grants (caso esta migração rode antes do grant geral)
grant all privileges on admin_credentials to anon, authenticated, service_role;
grant all privileges on password_resets   to anon, authenticated, service_role;
