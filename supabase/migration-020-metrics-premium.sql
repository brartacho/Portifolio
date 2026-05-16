-- ============================================================
-- ARTACHO.dev — Revamp premium da aba Métricas
-- Bugfixes (timezone BRT, recorrente=≥2 dias) + RPCs novas
-- (sessões, scroll, retenção, funil pareado, hora-do-dia,
-- dia-da-semana, conversão por origem, jornada de visitante)
-- ============================================================
-- Idempotente: pode rodar várias vezes sem efeito colateral.
-- Aplicar via Supabase SQL Editor.
-- ============================================================

-- ─── A.1. Novas colunas em site_events ───────────────────────
alter table site_events
  add column if not exists session_id      text,
  add column if not exists time_on_page_ms int,
  add column if not exists scroll_max_pct  smallint;

create index if not exists idx_site_events_session
  on site_events(session_id) where session_id is not null;

-- ─── A.2 + A.3. Bugfix #1 e #4: timezone BRT + recorrente=≥2 dias ──
-- analytics_series: agrega por dia em America/Sao_Paulo
create or replace function analytics_series(
  from_ts timestamptz, to_ts timestamptz,
  exclude_admin boolean default false
)
returns table(bucket date, pageviews bigint, unique_visitors bigint)
language sql stable as $$
  select
    (occurred_at at time zone 'America/Sao_Paulo')::date as bucket,
    count(*)                                              as pageviews,
    count(distinct visitor_id_hash)                       as unique_visitors
  from site_events
  where event = 'pageview'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
    and (not exclude_admin or coalesce(meta->>'admin','') != 'true')
  group by 1
  order by 1;
$$;

-- analytics_recurring_visitors: ≥2 dias distintos em BRT
create or replace function analytics_recurring_visitors(
  from_ts timestamptz, to_ts timestamptz,
  exclude_admin boolean default false
)
returns table(count bigint)
language sql stable as $$
  select count(*) from (
    select visitor_id_hash
    from site_events
    where event = 'pageview'
      and occurred_at >= from_ts
      and occurred_at <= to_ts
      and visitor_id_hash is not null
      and (not exclude_admin or coalesce(meta->>'admin','') != 'true')
    group by visitor_id_hash
    having count(distinct ((occurred_at at time zone 'America/Sao_Paulo')::date)) >= 2
  ) sub;
$$;

-- ─── A.4. Novas RPCs premium ─────────────────────────────────

-- Distribuição por hora-do-dia (0-23 em BRT)
create or replace function analytics_hourly(
  from_ts timestamptz, to_ts timestamptz,
  exclude_admin boolean default false
)
returns table(hour int, views bigint, unique_visitors bigint)
language sql stable as $$
  select
    extract(hour from (occurred_at at time zone 'America/Sao_Paulo'))::int as hour,
    count(*)                            as views,
    count(distinct visitor_id_hash)     as unique_visitors
  from site_events
  where event = 'pageview'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
    and (not exclude_admin or coalesce(meta->>'admin','') != 'true')
  group by 1
  order by 1;
$$;

-- Distribuição por dia-da-semana (0=domingo, em BRT)
create or replace function analytics_dow(
  from_ts timestamptz, to_ts timestamptz,
  exclude_admin boolean default false
)
returns table(dow int, views bigint, unique_visitors bigint)
language sql stable as $$
  select
    extract(dow from (occurred_at at time zone 'America/Sao_Paulo'))::int as dow,
    count(*)                            as views,
    count(distinct visitor_id_hash)     as unique_visitors
  from site_events
  where event = 'pageview'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
    and (not exclude_admin or coalesce(meta->>'admin','') != 'true')
  group by 1
  order by 1;
$$;

-- Funil pareado por visitor_id_hash (% de visitantes únicos que avançaram em cada etapa)
create or replace function analytics_funnel_unique(
  from_ts timestamptz, to_ts timestamptz,
  exclude_admin boolean default false
)
returns table(
  step_pageview     bigint,
  step_engaged      bigint,
  step_cv_click     bigint,
  step_cv_download  bigint
)
language sql stable as $$
  with base as (
    select visitor_id_hash, event
    from site_events
    where occurred_at >= from_ts
      and occurred_at <= to_ts
      and visitor_id_hash is not null
      and (not exclude_admin or coalesce(meta->>'admin','') != 'true')
  ),
  visitors_pv as (
    select distinct visitor_id_hash from base where event = 'pageview'
  ),
  visitors_eng as (
    select distinct visitor_id_hash from base where event = 'engaged'
  ),
  visitors_cv_click as (
    select distinct visitor_id_hash from base where event = 'cv_download_click'
  )
  select
    (select count(*) from visitors_pv)                                                            as step_pageview,
    (select count(*) from visitors_pv where visitor_id_hash in (select visitor_id_hash from visitors_eng)) as step_engaged,
    (select count(*) from visitors_pv where visitor_id_hash in (select visitor_id_hash from visitors_cv_click)) as step_cv_click,
    -- step_cv_download: visitantes únicos que efetivamente baixaram (download_logs)
    (select count(distinct dl.ip_address)
       from download_logs dl
      where dl.downloaded_at >= from_ts
        and dl.downloaded_at <= to_ts
        and (not exclude_admin or dl.ip_address not like 'admin-%')) as step_cv_download;
$$;

-- Sessões: métricas agregadas por session_id
create or replace function analytics_sessions(
  from_ts timestamptz, to_ts timestamptz,
  exclude_admin boolean default false
)
returns table(
  total_sessions       bigint,
  bounce_rate          numeric,
  pages_per_session    numeric,
  avg_duration_seconds numeric
)
language sql stable as $$
  with s as (
    select
      session_id,
      count(*) filter (where event = 'pageview') as pageviews,
      count(*) filter (where event = 'engaged')  as engaged,
      max(occurred_at) - min(occurred_at)        as duration
    from site_events
    where session_id is not null
      and occurred_at >= from_ts
      and occurred_at <= to_ts
      and (not exclude_admin or coalesce(meta->>'admin','') != 'true')
    group by session_id
  )
  select
    count(*)                                                                       as total_sessions,
    case when count(*) > 0
      then round(100.0 * count(*) filter (where pageviews <= 1 and engaged = 0) / count(*), 1)
      else 0 end                                                                   as bounce_rate,
    case when count(*) > 0
      then round(avg(pageviews)::numeric, 2)
      else 0 end                                                                   as pages_per_session,
    case when count(*) > 0
      then round(avg(extract(epoch from duration))::numeric, 1)
      else 0 end                                                                   as avg_duration_seconds
  from s;
$$;

-- Conversão por origem: views, cv_click, cv_download, taxa de conversão (%)
create or replace function analytics_referrer_conversion(
  from_ts timestamptz, to_ts timestamptz,
  exclude_admin boolean default false
)
returns table(
  host             text,
  views            bigint,
  cv_clicks        bigint,
  conversion_rate  numeric
)
language sql stable as $$
  with by_host as (
    select
      coalesce(referrer_host, '(direto)') as host,
      count(*) filter (where event = 'pageview')          as views,
      count(*) filter (where event = 'cv_download_click') as cv_clicks
    from site_events
    where occurred_at >= from_ts
      and occurred_at <= to_ts
      and (not exclude_admin or coalesce(meta->>'admin','') != 'true')
    group by 1
    having count(*) filter (where event = 'pageview') > 0
  )
  select
    host, views, cv_clicks,
    case when views > 0 then round(100.0 * cv_clicks / views, 1) else 0 end as conversion_rate
  from by_host
  order by views desc
  limit 15;
$$;

-- Timeline de eventos de um visitor específico (drill-down de jornada)
create or replace function analytics_visitor_journey(
  visitor_hash7 text,
  from_ts timestamptz default (now() - interval '90 days'),
  to_ts   timestamptz default now()
)
returns table(
  occurred_at timestamptz,
  event       text,
  path        text,
  meta        jsonb,
  session_id  text,
  device      text,
  browser     text,
  country     text
)
language sql stable as $$
  select occurred_at, event, path, meta, session_id, device, browser, country
  from site_events
  where left(visitor_id_hash, 7) = visitor_hash7
    and occurred_at >= from_ts
    and occurred_at <= to_ts
  order by occurred_at desc
  limit 500;
$$;

-- Retenção: % de visitantes do período que retornaram em 7d e 30d após primeira visita
create or replace function analytics_retention(
  from_ts timestamptz, to_ts timestamptz,
  exclude_admin boolean default false
)
returns table(
  total_visitors    bigint,
  returned_in_7d    bigint,
  returned_in_30d   bigint,
  retention_7d_pct  numeric,
  retention_30d_pct numeric
)
language sql stable as $$
  with first_seen as (
    select visitor_id_hash, min(occurred_at) as first_at
    from site_events
    where event = 'pageview'
      and visitor_id_hash is not null
      and occurred_at >= from_ts
      and occurred_at <= to_ts
      and (not exclude_admin or coalesce(meta->>'admin','') != 'true')
    group by visitor_id_hash
  ),
  return_7 as (
    select fs.visitor_id_hash
    from first_seen fs
    where exists (
      select 1 from site_events se
      where se.visitor_id_hash = fs.visitor_id_hash
        and se.event = 'pageview'
        and se.occurred_at >  fs.first_at + interval '1 hour'
        and se.occurred_at <= fs.first_at + interval '7 days'
    )
  ),
  return_30 as (
    select fs.visitor_id_hash
    from first_seen fs
    where exists (
      select 1 from site_events se
      where se.visitor_id_hash = fs.visitor_id_hash
        and se.event = 'pageview'
        and se.occurred_at >  fs.first_at + interval '1 hour'
        and se.occurred_at <= fs.first_at + interval '30 days'
    )
  )
  select
    (select count(*) from first_seen)                                                                   as total_visitors,
    (select count(*) from return_7)                                                                     as returned_in_7d,
    (select count(*) from return_30)                                                                    as returned_in_30d,
    case when (select count(*) from first_seen) > 0
      then round(100.0 * (select count(*) from return_7)  / (select count(*) from first_seen), 1)
      else 0 end                                                                                        as retention_7d_pct,
    case when (select count(*) from first_seen) > 0
      then round(100.0 * (select count(*) from return_30) / (select count(*) from first_seen), 1)
      else 0 end                                                                                        as retention_30d_pct;
$$;

-- ─── A.5. Bugfix #5 (opcional): alinhar admin em download_logs ─
-- Adiciona coluna is_admin em download_logs e backfill por convenção de IP
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'download_logs') then
    if not exists (select 1 from information_schema.columns where table_name = 'download_logs' and column_name = 'is_admin') then
      alter table download_logs add column is_admin boolean default false;
      update download_logs set is_admin = true where ip_address like 'admin-%';
      create index if not exists idx_download_logs_is_admin on download_logs(is_admin) where is_admin = true;
    end if;
  end if;
end $$;
