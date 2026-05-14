-- ============================================================
-- ARTACHO.dev — Audit log de tentativas de login no painel
-- ============================================================

create table if not exists admin_login_attempts (
    id             uuid        primary key default gen_random_uuid(),
    occurred_at    timestamptz not null    default now(),
    ip_address     text,
    user_agent     text,
    success        boolean     not null    default false,
    username_hint  text        -- primeiros 4 chars do input (não revela credencial completa)
);

create index if not exists idx_login_attempts_time   on admin_login_attempts(occurred_at desc);
create index if not exists idx_login_attempts_ip     on admin_login_attempts(ip_address, occurred_at desc);

-- ─── RPC: últimas tentativas com contagem de falhas recentes por IP ───────────
create or replace function admin_login_recent(lim int default 50)
returns table(
    occurred_at              timestamptz,
    ip_address               text,
    user_agent               text,
    success                  boolean,
    username_hint            text,
    recent_failures_from_ip  bigint
)
language sql stable security definer as $$
    select
        a.occurred_at,
        a.ip_address,
        a.user_agent,
        a.success,
        a.username_hint,
        (
            select count(*)
            from   admin_login_attempts f
            where  f.ip_address = a.ip_address
              and  f.success    = false
              and  f.occurred_at >= now() - interval '1 hour'
        ) as recent_failures_from_ip
    from   admin_login_attempts a
    order  by a.occurred_at desc
    limit  greatest(1, least(lim, 200));
$$;
