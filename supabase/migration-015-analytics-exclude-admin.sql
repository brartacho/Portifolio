-- ============================================================
-- ARTACHO.dev — Suporte a exclude_admin em todas as RPCs de analytics
-- Adiciona parâmetro exclude_admin boolean (default false) nas 11
-- funções que leem site_events, filtrando eventos com meta->>'admin' = 'true'.
-- analytics_latest_visits e analytics_latest_cv_clicks também passam
-- a retornar is_admin boolean para destaque visual no painel.
-- ============================================================

-- 1. Visitantes únicos
create or replace function analytics_unique_visitors(
  from_ts timestamptz, to_ts timestamptz,
  exclude_admin boolean default false
)
returns table(count bigint)
language sql stable as $$
  select count(distinct visitor_id_hash)
  from site_events
  where event = 'pageview'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
    and visitor_id_hash is not null
    and (not exclude_admin or coalesce(meta->>'admin','') != 'true');
$$;

-- 2. Série temporal
create or replace function analytics_series(
  from_ts timestamptz, to_ts timestamptz,
  exclude_admin boolean default false
)
returns table(bucket date, pageviews bigint, unique_visitors bigint)
language sql stable as $$
  select
    date_trunc('day', occurred_at)::date as bucket,
    count(*)                             as pageviews,
    count(distinct visitor_id_hash)      as unique_visitors
  from site_events
  where event = 'pageview'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
    and (not exclude_admin or coalesce(meta->>'admin','') != 'true')
  group by 1
  order by 1;
$$;

-- 3. Top páginas
create or replace function analytics_top_pages(
  from_ts timestamptz, to_ts timestamptz,
  exclude_admin boolean default false
)
returns table(path text, views bigint, unique_visitors bigint, engaged bigint)
language sql stable as $$
  select
    coalesce(e.path, '/') as path,
    count(*) filter (where e.event = 'pageview') as views,
    count(distinct e.visitor_id_hash) filter (where e.event = 'pageview') as unique_visitors,
    count(*) filter (where e.event = 'engaged') as engaged
  from site_events e
  where e.occurred_at >= from_ts
    and e.occurred_at <= to_ts
    and e.event in ('pageview', 'engaged')
    and (not exclude_admin or coalesce(e.meta->>'admin','') != 'true')
  group by 1
  having count(*) filter (where e.event = 'pageview') > 0
  order by 2 desc
  limit 10;
$$;

-- 4. Top referrers
create or replace function analytics_top_referrers(
  from_ts timestamptz, to_ts timestamptz,
  exclude_admin boolean default false
)
returns table(host text, views bigint)
language sql stable as $$
  select
    coalesce(referrer_host, '(direto)') as host,
    count(*) as views
  from site_events
  where event = 'pageview'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
    and (not exclude_admin or coalesce(meta->>'admin','') != 'true')
  group by 1
  order by 2 desc
  limit 10;
$$;

-- 5. UTM sources
create or replace function analytics_utm_sources(
  from_ts timestamptz, to_ts timestamptz,
  exclude_admin boolean default false
)
returns table(source text, medium text, campaign text, views bigint)
language sql stable as $$
  select
    coalesce(utm_source, '(nenhum)')   as source,
    coalesce(utm_medium, '')           as medium,
    coalesce(utm_campaign, '')         as campaign,
    count(*) as views
  from site_events
  where event = 'pageview'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
    and (not exclude_admin or coalesce(meta->>'admin','') != 'true')
  group by 1, 2, 3
  order by 4 desc
  limit 20;
$$;

-- 6. Dispositivos
create or replace function analytics_devices(
  from_ts timestamptz, to_ts timestamptz,
  exclude_admin boolean default false
)
returns table(device text, views bigint)
language sql stable as $$
  select
    coalesce(device, 'unknown') as device,
    count(*) as views
  from site_events
  where event = 'pageview'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
    and (not exclude_admin or coalesce(meta->>'admin','') != 'true')
  group by 1
  order by 2 desc;
$$;

-- 7. Países
create or replace function analytics_countries(
  from_ts timestamptz, to_ts timestamptz,
  exclude_admin boolean default false
)
returns table(country text, views bigint)
language sql stable as $$
  select
    coalesce(country, 'Desconhecido') as country,
    count(*) as views
  from site_events
  where event = 'pageview'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
    and (not exclude_admin or coalesce(meta->>'admin','') != 'true')
  group by 1
  order by 2 desc
  limit 15;
$$;

-- 8. Visitantes recorrentes
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
    having count(*) > 1
  ) sub;
$$;

-- 9. Últimas visitas — agora retorna is_admin
create or replace function analytics_latest_visits(
  from_ts timestamptz, to_ts timestamptz, lim int default 50,
  exclude_admin boolean default false
)
returns table(occurred_at timestamptz, path text, country text, device text, browser text, hash7 text, is_admin boolean)
language sql stable as $$
  select occurred_at, path, country, device, browser,
         left(visitor_id_hash, 7),
         coalesce((meta->>'admin')::boolean, false)
  from site_events
  where event = 'pageview'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
    and (not exclude_admin or coalesce(meta->>'admin','') != 'true')
  order by occurred_at desc
  limit greatest(1, least(lim, 200));
$$;

-- 10. Últimos cliques em CV — agora retorna is_admin
create or replace function analytics_latest_cv_clicks(
  from_ts timestamptz, to_ts timestamptz, lim int default 30,
  exclude_admin boolean default false
)
returns table(occurred_at timestamptz, path text, country text, device text, browser text, hash7 text, is_admin boolean)
language sql stable as $$
  select occurred_at, path, country, device, browser,
         left(visitor_id_hash, 7),
         coalesce((meta->>'admin')::boolean, false)
  from site_events
  where event = 'cv_download_click'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
    and (not exclude_admin or coalesce(meta->>'admin','') != 'true')
  order by occurred_at desc
  limit greatest(1, least(lim, 200));
$$;

-- 11. Top recorrentes
create or replace function analytics_top_recurring(
  from_ts timestamptz, to_ts timestamptz, lim int default 10,
  exclude_admin boolean default false
)
returns table(hash7 text, visit_count bigint, first_seen timestamptz, last_seen timestamptz, top_country text)
language sql stable as $$
  with v as (
    select left(visitor_id_hash, 7) as hash7,
           count(*) as visit_count,
           min(occurred_at) as first_seen,
           max(occurred_at) as last_seen,
           mode() within group (order by country) as top_country
    from site_events
    where event = 'pageview'
      and visitor_id_hash is not null
      and occurred_at >= from_ts
      and occurred_at <= to_ts
      and (not exclude_admin or coalesce(meta->>'admin','') != 'true')
    group by left(visitor_id_hash, 7)
    having count(*) > 1
  )
  select * from v
  order by visit_count desc, last_seen desc
  limit greatest(1, least(lim, 50));
$$;
