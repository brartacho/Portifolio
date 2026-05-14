-- ============================================================
-- ARTACHO.dev — Toggle "Incluir arquivadas" nas RPCs de análise
-- ============================================================
-- Recria as 6 RPCs adicionando parâmetro include_archived.
-- Default false mantém o comportamento atual (excluir arquivadas).
-- vagas_series ganha o filtro pela primeira vez (fix do bug onde
-- ele incluía arquivadas enquanto as outras RPCs e os KPIs não).

-- Drop das assinaturas antigas (sem include_archived) para evitar
-- ambiguidade de overload — Postgres não escolhe automaticamente.
drop function if exists vagas_by_result(timestamptz, timestamptz);
drop function if exists vagas_by_modalidade(timestamptz, timestamptz);
drop function if exists vagas_by_tipo(timestamptz, timestamptz);
drop function if exists vagas_series(timestamptz, timestamptz, text);
drop function if exists vagas_distribution(timestamptz, timestamptz, text);
drop function if exists vagas_stages_distribution(timestamptz, timestamptz);

create or replace function vagas_by_result(
  from_ts timestamptz default null,
  to_ts   timestamptz default null,
  include_archived boolean default false
)
returns table(result text, cnt bigint)
language sql stable as $$
  select coalesce(result, 'em_processo') as result, count(*) as cnt
  from job_applications
  where (include_archived or not coalesce(archived, false))
    and (from_ts is null or created_at >= from_ts)
    and (to_ts   is null or created_at <= to_ts)
  group by 1
  order by cnt desc;
$$;

create or replace function vagas_by_modalidade(
  from_ts timestamptz default null,
  to_ts   timestamptz default null,
  include_archived boolean default false
)
returns table(modalidade text, cnt bigint)
language sql stable as $$
  select coalesce(modalidade, '(não informado)') as modalidade, count(*) as cnt
  from job_applications
  where (include_archived or not coalesce(archived, false))
    and (from_ts is null or created_at >= from_ts)
    and (to_ts   is null or created_at <= to_ts)
  group by 1
  order by cnt desc;
$$;

create or replace function vagas_by_tipo(
  from_ts timestamptz default null,
  to_ts   timestamptz default null,
  include_archived boolean default false
)
returns table(tipo_contratacao text, cnt bigint)
language sql stable as $$
  select coalesce(tipo_contratacao, '(não informado)') as tipo_contratacao, count(*) as cnt
  from job_applications
  where (include_archived or not coalesce(archived, false))
    and (from_ts is null or created_at >= from_ts)
    and (to_ts   is null or created_at <= to_ts)
  group by 1
  order by cnt desc;
$$;

-- vagas_series — FIX: adiciona filtro de archived (antes não tinha)
create or replace function vagas_series(
  from_ts     timestamptz default null,
  to_ts       timestamptz default null,
  bucket_size text        default 'week',
  include_archived boolean default false
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
  where (include_archived or not coalesce(archived, false))
    and (from_ts is null or created_at >= from_ts)
    and (to_ts   is null or created_at <= to_ts)
  group by 1
  order by 1;
$$;

create or replace function vagas_distribution(
  from_ts timestamptz default null,
  to_ts   timestamptz default null,
  mode    text        default 'dow',
  include_archived boolean default false
)
returns table(idx int, cnt bigint)
language sql stable as $$
  select
    case mode
      when 'dow' then case extract(dow from created_at)::int
                        when 0 then 7
                        else extract(dow from created_at)::int
                      end
      when 'wom' then least(5, ceil(extract(day from created_at) / 7.0))::int
      when 'dom' then extract(day from created_at)::int
      when 'moy' then extract(month from created_at)::int
      else 0
    end as idx,
    count(*) as cnt
  from job_applications
  where (include_archived or not coalesce(archived, false))
    and (from_ts is null or created_at >= from_ts)
    and (to_ts   is null or created_at <= to_ts)
  group by 1
  order by 1;
$$;

create or replace function vagas_stages_distribution(
  from_ts timestamptz default null,
  to_ts   timestamptz default null,
  include_archived boolean default false
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
    where (include_archived or not coalesce(archived, false))
      and (from_ts is null or created_at >= from_ts)
      and (to_ts   is null or created_at <= to_ts)
  )
  select sname as stage_name, count(*) as cnt
  from current_stage
  group by sname
  order by cnt desc
  limit 15;
$$;
