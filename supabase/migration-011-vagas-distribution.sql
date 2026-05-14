-- ============================================================
-- ARTACHO.dev — RPC para distribuição comparativa de candidaturas
-- ============================================================

-- vagas_distribution(from_ts, to_ts, mode):
--   mode = 'dow' → dia da semana (1=Seg ... 7=Dom)
--   mode = 'wom' → semana do mês (1..5)
--   mode = 'dom' → dia do mês    (1..31)
--   mode = 'moy' → mês do ano    (1..12)
create or replace function vagas_distribution(
  from_ts timestamptz default null,
  to_ts   timestamptz default null,
  mode    text        default 'dow'
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
  where not coalesce(archived, false)
    and (from_ts is null or created_at >= from_ts)
    and (to_ts   is null or created_at <= to_ts)
  group by 1
  order by 1;
$$;
