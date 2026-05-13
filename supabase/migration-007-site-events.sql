-- ============================================================
-- ARTACHO.dev — Tabela de eventos de acesso ao site (analytics)
-- ============================================================

create table if not exists site_events (
  id              uuid primary key default gen_random_uuid(),
  occurred_at     timestamptz not null default now(),
  event           text not null,
  path            text,
  visitor_id_hash text,
  referrer_host   text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  device          text,
  browser         text,
  os              text,
  country         text,
  meta            jsonb
);

-- event: 'pageview' | 'cv_download_click' | 'email_request' | 'contact_click' | 'case_open' | 'engaged'
-- visitor_id_hash: sha256(ip + ua + salt_diário) — nunca armazena IP cru
-- country: via header x-vercel-ip-country da Vercel

create index if not exists idx_site_events_date    on site_events(occurred_at desc);
create index if not exists idx_site_events_event   on site_events(event, occurred_at desc);
create index if not exists idx_site_events_visitor on site_events(visitor_id_hash);
create index if not exists idx_site_events_path    on site_events(path, occurred_at desc);

alter table site_events enable row level security;

-- ─── FUNÇÕES RPC PARA ANALYTICS ──────────────────────────────

-- Visitantes únicos no período
create or replace function analytics_unique_visitors(from_ts timestamptz, to_ts timestamptz)
returns table(count bigint)
language sql stable
as $$
  select count(distinct visitor_id_hash)
  from site_events
  where event = 'pageview'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
    and visitor_id_hash is not null;
$$;

-- Série temporal de pageviews por dia
create or replace function analytics_series(from_ts timestamptz, to_ts timestamptz)
returns table(bucket date, pageviews bigint, unique_visitors bigint)
language sql stable
as $$
  select
    date_trunc('day', occurred_at)::date as bucket,
    count(*)                             as pageviews,
    count(distinct visitor_id_hash)      as unique_visitors
  from site_events
  where event = 'pageview'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
  group by 1
  order by 1;
$$;

-- Top páginas por pageviews
create or replace function analytics_top_pages(from_ts timestamptz, to_ts timestamptz)
returns table(path text, views bigint, unique_visitors bigint, engaged bigint)
language sql stable
as $$
  select
    coalesce(e.path, '/') as path,
    count(*) filter (where e.event = 'pageview') as views,
    count(distinct e.visitor_id_hash) filter (where e.event = 'pageview') as unique_visitors,
    count(*) filter (where e.event = 'engaged') as engaged
  from site_events e
  where e.occurred_at >= from_ts
    and e.occurred_at <= to_ts
    and e.event in ('pageview', 'engaged')
  group by 1
  having count(*) filter (where e.event = 'pageview') > 0
  order by 2 desc
  limit 10;
$$;

-- Top referrers
create or replace function analytics_top_referrers(from_ts timestamptz, to_ts timestamptz)
returns table(host text, views bigint)
language sql stable
as $$
  select
    coalesce(referrer_host, '(direto)') as host,
    count(*) as views
  from site_events
  where event = 'pageview'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
  group by 1
  order by 2 desc
  limit 10;
$$;

-- UTM sources
create or replace function analytics_utm_sources(from_ts timestamptz, to_ts timestamptz)
returns table(source text, medium text, campaign text, views bigint)
language sql stable
as $$
  select
    coalesce(utm_source, '(nenhum)')   as source,
    coalesce(utm_medium, '')           as medium,
    coalesce(utm_campaign, '')         as campaign,
    count(*) as views
  from site_events
  where event = 'pageview'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
  group by 1, 2, 3
  order by 4 desc
  limit 20;
$$;

-- Distribuição de dispositivos
create or replace function analytics_devices(from_ts timestamptz, to_ts timestamptz)
returns table(device text, views bigint)
language sql stable
as $$
  select
    coalesce(device, 'unknown') as device,
    count(*) as views
  from site_events
  where event = 'pageview'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
  group by 1
  order by 2 desc;
$$;

-- Distribuição de países
create or replace function analytics_countries(from_ts timestamptz, to_ts timestamptz)
returns table(country text, views bigint)
language sql stable
as $$
  select
    coalesce(country, 'Desconhecido') as country,
    count(*) as views
  from site_events
  where event = 'pageview'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
  group by 1
  order by 2 desc
  limit 15;
$$;

-- Visitantes recorrentes (visitor visto em >= 2 dias distintos)
create or replace function analytics_recurring_visitors(from_ts timestamptz, to_ts timestamptz)
returns table(count bigint)
language sql stable
as $$
  select count(*) from (
    select visitor_id_hash
    from site_events
    where event = 'pageview'
      and occurred_at >= from_ts
      and occurred_at <= to_ts
      and visitor_id_hash is not null
    group by visitor_id_hash
    having count(distinct date_trunc('day', occurred_at)) >= 2
  ) sub;
$$;
