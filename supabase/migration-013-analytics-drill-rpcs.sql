-- ============================================================
-- ARTACHO.dev — RPCs para drill-down dos cards de Métricas
-- ============================================================
-- 3 funções leves que alimentam os modais de detalhe dos KPIs.
-- Todas retornam hash truncado (7 chars) em vez de IP cru — o
-- esquema de site_events não armazena IP por design LGPD.

create or replace function analytics_latest_visits(
  from_ts timestamptz, to_ts timestamptz, lim int default 50
)
returns table(occurred_at timestamptz, path text, country text, device text, browser text, hash7 text)
language sql stable as $$
  select occurred_at, path, country, device, browser, left(visitor_id_hash, 7)
  from site_events
  where event = 'pageview'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
  order by occurred_at desc
  limit greatest(1, least(lim, 200));
$$;

create or replace function analytics_latest_cv_clicks(
  from_ts timestamptz, to_ts timestamptz, lim int default 30
)
returns table(occurred_at timestamptz, path text, country text, device text, browser text, hash7 text)
language sql stable as $$
  select occurred_at, path, country, device, browser, left(visitor_id_hash, 7)
  from site_events
  where event = 'cv_download_click'
    and occurred_at >= from_ts
    and occurred_at <= to_ts
  order by occurred_at desc
  limit greatest(1, least(lim, 200));
$$;

create or replace function analytics_top_recurring(
  from_ts timestamptz, to_ts timestamptz, lim int default 10
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
    group by left(visitor_id_hash, 7)
    having count(*) > 1
  )
  select * from v
  order by visit_count desc, last_seen desc
  limit greatest(1, least(lim, 50));
$$;
