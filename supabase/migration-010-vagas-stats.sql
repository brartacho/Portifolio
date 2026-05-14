-- ============================================================
-- ARTACHO.dev — RPCs para análise de candidaturas (vagas)
-- ============================================================

-- Contagem por resultado (em_processo | aprovado | recusado)
create or replace function vagas_by_result(
  from_ts timestamptz default null,
  to_ts   timestamptz default null
)
returns table(result text, cnt bigint)
language sql stable as $$
  select coalesce(result, 'em_processo') as result, count(*) as cnt
  from job_applications
  where not coalesce(archived, false)
    and (from_ts is null or created_at >= from_ts)
    and (to_ts   is null or created_at <= to_ts)
  group by 1
  order by cnt desc;
$$;

-- Contagem por modalidade
create or replace function vagas_by_modalidade(
  from_ts timestamptz default null,
  to_ts   timestamptz default null
)
returns table(modalidade text, cnt bigint)
language sql stable as $$
  select coalesce(modalidade, '(não informado)') as modalidade, count(*) as cnt
  from job_applications
  where not coalesce(archived, false)
    and (from_ts is null or created_at >= from_ts)
    and (to_ts   is null or created_at <= to_ts)
  group by 1
  order by cnt desc;
$$;

-- Contagem por tipo de contratação
create or replace function vagas_by_tipo(
  from_ts timestamptz default null,
  to_ts   timestamptz default null
)
returns table(tipo_contratacao text, cnt bigint)
language sql stable as $$
  select coalesce(tipo_contratacao, '(não informado)') as tipo_contratacao, count(*) as cnt
  from job_applications
  where not coalesce(archived, false)
    and (from_ts is null or created_at >= from_ts)
    and (to_ts   is null or created_at <= to_ts)
  group by 1
  order by cnt desc;
$$;

-- Série temporal de candidaturas por período
create or replace function vagas_series(
  from_ts     timestamptz default null,
  to_ts       timestamptz default null,
  bucket_size text        default 'week'
)
returns table(bucket text, cnt bigint)
language sql stable as $$
  select
    date_trunc(
      case bucket_size
        when 'week'  then 'week'
        when 'month' then 'month'
        when 'year'  then 'year'
        else 'day'
      end,
      created_at
    )::date::text as bucket,
    count(*) as cnt
  from job_applications
  where (from_ts is null or created_at >= from_ts)
    and (to_ts   is null or created_at <= to_ts)
  group by 1
  order by 1;
$$;

-- Distribuição pela etapa atual de cada candidatura (extração de JSONB)
-- "Etapa atual" = etapa em status 'running', ou última em 'done'/'rejected'
create or replace function vagas_stages_distribution(
  from_ts timestamptz default null,
  to_ts   timestamptz default null
)
returns table(stage_name text, cnt bigint)
language sql stable as $$
  with current_stage as (
    select
      coalesce(
        (select elem->>'name'
         from jsonb_array_elements(stages) as elem
         where (elem->>'status') = 'running'
           and (elem->>'active') is distinct from 'false'
         limit 1),
        (select elem->>'name'
         from jsonb_array_elements(stages) with ordinality as t(elem, pos)
         where (elem->>'status') in ('done','rejected')
           and (elem->>'active') is distinct from 'false'
         order by t.pos desc
         limit 1),
        '—'
      ) as sname
    from job_applications
    where not coalesce(archived, false)
      and (from_ts is null or created_at >= from_ts)
      and (to_ts   is null or created_at <= to_ts)
  )
  select sname as stage_name, count(*) as cnt
  from current_stage
  group by sname
  order by cnt desc
  limit 15;
$$;
