-- ============================================================
-- ARTACHO.dev — Migration 020: Tabelas DEMO descartáveis
-- ============================================================
-- Objetivo: showcase espelhado do painel admin para recrutadores
-- Isolamento: tabelas demo_* totalmente separadas de produção
-- Retenção: 24h via cron diário; emergency cleanup se inflar
-- Identificação: cada recrutador tem session_id (UUID) próprio
-- LGPD: IPs sempre armazenados como hash (ip:xxxxxxxx)
-- ============================================================

create extension if not exists "pgcrypto";

-- ─── TABELA: demo_cv_versions ────────────────────────────────
create table if not exists demo_cv_versions (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null,
    name text not null,
    description text,
    file_name text not null,
    active boolean default true,
    created_at timestamptz default now()
);
create index if not exists idx_demo_cv_session on demo_cv_versions(session_id);
create index if not exists idx_demo_cv_created on demo_cv_versions(created_at);

-- ─── TABELA: demo_download_tokens ────────────────────────────
create table if not exists demo_download_tokens (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null,
    cv_version_id uuid references demo_cv_versions(id) on delete cascade,
    label text,
    hash text not null,
    expires_at timestamptz,
    max_uses int,
    use_count int default 0,
    revoked boolean default false,
    created_at timestamptz default now()
);
create index if not exists idx_demo_tok_session on demo_download_tokens(session_id);
create index if not exists idx_demo_tok_created on demo_download_tokens(created_at);

-- ─── TABELA: demo_download_logs ──────────────────────────────
create table if not exists demo_download_logs (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null,
    cv_version_id uuid references demo_cv_versions(id) on delete set null,
    cv_name_snapshot text,
    cv_id_snapshot uuid,
    token_id uuid references demo_download_tokens(id) on delete set null,
    ip_address text, -- LGPD: sempre hash, nunca IP real
    user_agent text,
    empresa text,
    vaga text,
    notas text,
    contato text,
    downloaded_at timestamptz default now(),
    created_at timestamptz default now()
);
create index if not exists idx_demo_log_session on demo_download_logs(session_id);
create index if not exists idx_demo_log_created on demo_download_logs(created_at);

-- ─── TABELA: demo_job_applications ───────────────────────────
create table if not exists demo_job_applications (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null,
    empresa text not null default 'N/A',
    vaga text,
    linkedin_empresa text,
    link_vaga text,
    observacoes text,
    gestor_nome text,
    gestor_email text,
    gestor_phone text,
    modalidade text,
    tipo_contratacao text,
    cv_version_id uuid references demo_cv_versions(id) on delete set null,
    stages jsonb default '[]'::jsonb,
    result text,
    source text default 'manual',
    archived boolean default false,
    data_envio timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
create index if not exists idx_demo_app_session on demo_job_applications(session_id);
create index if not exists idx_demo_app_created on demo_job_applications(created_at);
create index if not exists idx_demo_app_archived on demo_job_applications(archived);

-- ─── TRIGGER updated_at ──────────────────────────────────────
create or replace function demo_set_updated_at() returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists demo_apps_updated_at on demo_job_applications;
create trigger demo_apps_updated_at
    before update on demo_job_applications
    for each row execute function demo_set_updated_at();

-- ============================================================
-- RPC: cleanup diário (chamada pelo cron Vercel às 3h BRT)
-- Deleta tudo > 24h em todas as tabelas demo_*
-- ============================================================
create or replace function demo_cleanup_expired() returns int as $$
declare
    deleted int := 0;
    cnt int;
begin
    delete from demo_download_logs    where created_at < now() - interval '24 hours';
    get diagnostics cnt = row_count; deleted := deleted + cnt;
    delete from demo_download_tokens  where created_at < now() - interval '24 hours';
    get diagnostics cnt = row_count; deleted := deleted + cnt;
    delete from demo_job_applications where created_at < now() - interval '24 hours';
    get diagnostics cnt = row_count; deleted := deleted + cnt;
    delete from demo_cv_versions      where created_at < now() - interval '24 hours';
    get diagnostics cnt = row_count; deleted := deleted + cnt;
    return deleted;
end;
$$ language plpgsql security definer;

-- ============================================================
-- RPC: emergency cleanup (deleta tudo > 1h)
-- Acionada pelo circuit breaker quando banco infla
-- ============================================================
create or replace function demo_emergency_cleanup() returns int as $$
declare
    deleted int := 0;
    cnt int;
begin
    delete from demo_download_logs    where created_at < now() - interval '1 hour';
    get diagnostics cnt = row_count; deleted := deleted + cnt;
    delete from demo_download_tokens  where created_at < now() - interval '1 hour';
    get diagnostics cnt = row_count; deleted := deleted + cnt;
    delete from demo_job_applications where created_at < now() - interval '1 hour';
    get diagnostics cnt = row_count; deleted := deleted + cnt;
    delete from demo_cv_versions      where created_at < now() - interval '1 hour';
    get diagnostics cnt = row_count; deleted := deleted + cnt;
    return deleted;
end;
$$ language plpgsql security definer;

-- ============================================================
-- RPC: full wipe (último recurso — zera tudo)
-- ============================================================
create or replace function demo_full_wipe() returns int as $$
declare
    deleted int := 0;
    cnt int;
begin
    delete from demo_download_logs;    get diagnostics cnt = row_count; deleted := deleted + cnt;
    delete from demo_download_tokens;  get diagnostics cnt = row_count; deleted := deleted + cnt;
    delete from demo_job_applications; get diagnostics cnt = row_count; deleted := deleted + cnt;
    delete from demo_cv_versions;      get diagnostics cnt = row_count; deleted := deleted + cnt;
    return deleted;
end;
$$ language plpgsql security definer;

-- ============================================================
-- RPC: total de rows (circuit breaker)
-- ============================================================
create or replace function demo_total_rows() returns int as $$
declare total int;
begin
    select
        (select count(*) from demo_download_logs)
      + (select count(*) from demo_download_tokens)
      + (select count(*) from demo_job_applications)
      + (select count(*) from demo_cv_versions)
    into total;
    return total;
end;
$$ language plpgsql stable security definer;

-- ============================================================
-- RPC: check quota antes de inserir
-- Retorna NULL se OK, ou string com mensagem de erro
-- ============================================================
create or replace function demo_check_quota(p_session_id uuid, p_table text) returns text as $$
declare cnt int;
begin
    if p_table = 'demo_job_applications' then
        select count(*) into cnt from demo_job_applications where session_id = p_session_id;
        if cnt >= 30 then return 'Limite atingido: 30 candidaturas máx por sessão demo.'; end if;
    elsif p_table = 'demo_cv_versions' then
        select count(*) into cnt from demo_cv_versions where session_id = p_session_id;
        if cnt >= 15 then return 'Limite atingido: 15 CVs máx por sessão demo.'; end if;
    elsif p_table = 'demo_download_tokens' then
        select count(*) into cnt from demo_download_tokens where session_id = p_session_id;
        if cnt >= 25 then return 'Limite atingido: 25 tokens máx por sessão demo.'; end if;
    elsif p_table = 'demo_download_logs' then
        select count(*) into cnt from demo_download_logs where session_id = p_session_id;
        if cnt >= 100 then return 'Limite atingido: 100 logs máx por sessão demo.'; end if;
    end if;
    return null;
end;
$$ language plpgsql stable security definer;

-- ============================================================
-- RPC: seed inicial (chamada na 1ª request de cada sessão)
-- Idempotente: se já tem dados, não faz nada
-- TODOS OS DADOS COM TEMA GAME OF THRONES (PT-BR)
-- LGPD: IPs já vêm como hash anônimo (ip:xxxxxxxx)
-- ============================================================
create or replace function demo_seed(p_session_id uuid) returns void as $$
declare
    cv1 uuid; cv2 uuid; cv3 uuid; cv4 uuid; cv5 uuid;
begin
    -- Idempotente
    if exists (select 1 from demo_cv_versions where session_id = p_session_id limit 1) then
        return;
    end if;

    -- ── 5 CVs (personagens GoT como profissionais de TI) ──
    insert into demo_cv_versions (session_id, name, description, file_name, active, created_at) values
        (p_session_id, 'Jon Snow · QA Sênior',           'Lorde Comandante dos testes de regressão', 'cv-demo-jon-snow.pdf',           true,  now() - interval '35 days')
        returning id into cv1;
    insert into demo_cv_versions (session_id, name, description, file_name, active, created_at) values
        (p_session_id, 'Daenerys Targaryen · EM',        'Mãe dos Microsserviços',                   'cv-demo-daenerys-targaryen.pdf', true,  now() - interval '12 days')
        returning id into cv2;
    insert into demo_cv_versions (session_id, name, description, file_name, active, created_at) values
        (p_session_id, 'Tyrion Lannister · Arquiteto',   'Eu bebo e arquiteto coisas',               'cv-demo-tyrion-lannister.pdf',   true,  now() - interval '10 days')
        returning id into cv3;
    insert into demo_cv_versions (session_id, name, description, file_name, active, created_at) values
        (p_session_id, 'Arya Stark · Pentester',         'Uma garota não tem bugs',                  'cv-demo-arya-stark.pdf',         false, now() - interval '180 days')
        returning id into cv4;
    insert into demo_cv_versions (session_id, name, description, file_name, active, created_at) values
        (p_session_id, 'Bran Stark · Data Engineer',     'O Lago de Dados de Três Olhos',            'cv-demo-bran-stark.pdf',         true,  now() - interval '55 days')
        returning id into cv5;

    -- ── 8 Tokens (variedade de status) ──
    insert into demo_download_tokens (session_id, cv_version_id, label, hash, expires_at, max_uses, use_count, revoked, created_at) values
        (p_session_id, cv2, 'Targaryen Tech · Missandei · Sr QA',     'dragonglas', now() + interval '5 days',   5, 1, false, now() - interval '2 days'),
        (p_session_id, cv3, 'Iron Bank · Mindinho · Arquiteto',       'casterlyrk', now() + interval '3 days',   3, 2, false, now() - interval '4 days'),
        (p_session_id, cv1, 'Citadel · Maester Sam · QA Auto',        'oldtwnsage', now() - interval '1 day',    5, 5, false, now() - interval '10 days'),
        (p_session_id, cv5, 'Riverrun · Edmure · Data Eng',           'troutbnnr2', now() + interval '7 days', null, 0, false, now() - interval '1 day'),
        (p_session_id, cv2, 'Dragonstone · Davos · QA',               'oniknght5x', now() - interval '3 days',   1, 1, false, now() - interval '8 days'),
        (p_session_id, cv1, 'Lannister Cap · Tywin · Pleno',          'goldhandlx', now() + interval '2 days',   3, 0, true,  now() - interval '6 days'),
        (p_session_id, cv3, 'Highgarden · Olenna · Sr',               'qoftrnsdt', now() + interval '10 days', 10, 3, false, now() - interval '5 days'),
        (p_session_id, cv2, 'Stormlands · Stannis · QA Auto',         'azornthsh', now() + interval '1 day',    5, 2, false, now() - interval '3 days');

    -- ── 10 Candidaturas (empresas/recrutadores GoT) ──
    insert into demo_job_applications (session_id, empresa, vaga, gestor_nome, gestor_email, gestor_phone, linkedin_empresa, link_vaga, cv_version_id, modalidade, tipo_contratacao, observacoes, stages, result, data_envio, archived, created_at) values
        (p_session_id, 'Targaryen Tech',         'QA Engineer',         'Missandei',         'missandei@targaryentech.demo',     '99999990001', 'https://linkedin.com/company/targaryen-tech',     'https://targaryentech.demo/careers/qa', cv2, 'Remota',     'CLT', 'Missandei respondeu em 2h — Khaleesi must be impressed. Cultura: liberdade total.',                              '[{"name":"Enviado","status":"running","date":"2026-05-14"},{"name":"Entrevista RH","status":"pending"},{"name":"Teste Técnico","status":"pending"},{"name":"Proposta","status":"pending"}]'::jsonb, 'em_processo', now() - interval '1 day',  false, now() - interval '1 day'),
        (p_session_id, 'Winterfell Systems',     'SDET',                'Sansa Stark',       'sansa@winterfell.demo',            '99999990002', 'https://linkedin.com/company/winterfell-sys',     'https://winterfell.demo/jobs/sdet',     cv3, 'Híbrida',    'CLT', 'Cultura nórdica — o inverno está chegando, mas a stack é sólida. Sansa muito profissional.',                       '[{"name":"Enviado","status":"done","date":"2026-05-10"},{"name":"Entrevista RH","status":"done","date":"2026-05-13"},{"name":"Teste Técnico","status":"running","date":"2026-05-16"},{"name":"Proposta","status":"pending"}]'::jsonb, 'em_processo', now() - interval '5 days', false, now() - interval '5 days'),
        (p_session_id, 'Iron Bank of Braavos',   'Test Analyst',        'Petyr Baelish',     'p.baelish@ironbank.demo',          '99999990003', 'https://linkedin.com/company/iron-bank-braavos',  'https://ironbank.demo/jobs/ta',         cv1, 'Remota',     'CLT', 'Proposta aceita. Iron Bank paga bem — sempre paga suas dívidas. Salário acima da média.',                          '[{"name":"Enviado","status":"done","date":"2026-05-02"},{"name":"Entrevista RH","status":"done","date":"2026-05-06"},{"name":"Proposta","status":"done","date":"2026-05-09"}]'::jsonb, 'aprovado', now() - interval '13 days', false, now() - interval '13 days'),
        (p_session_id, 'The Citadel',            'Automation Engineer', 'Maester Samwell',   'maester.sam@citadel.demo',         null,          'https://linkedin.com/company/citadel-edtech',     'https://citadel.demo/automation',       cv1, 'Híbrida',    'PJ',  'Não passou no teste — exigiram conhecimento profundo em pergaminhos antigos (COBOL).',                              '[{"name":"Enviado","status":"done","date":"2026-04-28"},{"name":"Entrevista RH","status":"rejected","date":"2026-05-05"}]'::jsonb, 'recusado',    now() - interval '17 days', false, now() - interval '17 days'),
        (p_session_id, 'Dragonstone Cloud',      'QA Pleno',            'Davos Seaworth',    'd.seaworth@dragonstone.demo',      '99999990005', 'https://linkedin.com/company/dragonstone-cloud',  'https://dragonstone.demo/qa-pleno',     cv1, 'Presencial', 'CLT', 'Davos é direto, sem rodeios. Cavaleiro da Cebola valorizando candidatos honestos.',                                '[{"name":"Enviado","status":"running","date":"2026-05-15"},{"name":"Entrevista RH","status":"pending"},{"name":"Teste Técnico","status":"pending"}]'::jsonb, 'em_processo', now() - interval '0 days', false, now() - interval '0 days'),
        (p_session_id, 'Lannister Capital',      'QA Engineer',         'Tywin Lannister',   'tywin@lannister.demo',             '99999990006', 'https://linkedin.com/company/lannister-capital',  'https://lannister.demo/qa',             cv2, 'Remota',     'CLT', 'Processo rigoroso. Um Lannister sempre paga suas dívidas — mas exige excelência.',                                  '[{"name":"Enviado","status":"done","date":"2026-05-08"},{"name":"Entrevista RH","status":"done","date":"2026-05-12"},{"name":"Teste Técnico","status":"pending"}]'::jsonb, 'em_processo', now() - interval '7 days', false, now() - interval '7 days'),
        (p_session_id, 'Highgarden AgTech',      'Test Analyst Pleno',  'Olenna Tyrell',     'o.tyrell@highgarden.demo',         null,          'https://linkedin.com/company/highgarden-agtech',  'https://highgarden.demo/jobs/ta',       cv1, 'Híbrida',    'CLT', 'Olenna não tem papas na língua. Aguardando retorno do RH.',                                                        '[{"name":"Enviado","status":"running","date":"2026-05-09"},{"name":"Entrevista RH","status":"pending"}]'::jsonb, 'em_processo', now() - interval '6 days', false, now() - interval '6 days'),
        (p_session_id, 'Stormlands Logistics',   'SDET Sênior',         'Stannis Baratheon', 's.baratheon@stormlands.demo',      '99999990008', 'https://linkedin.com/company/stormlands-tech',    'https://stormlands.demo/sdet-sr',       cv3, 'Remota',     'CLT', 'Stannis é rigoroso com processos — "é it''s, não its". Cultura disciplinada.',                                      '[{"name":"Enviado","status":"done","date":"2026-05-04"},{"name":"Entrevista RH","status":"done","date":"2026-05-08"},{"name":"Teste Técnico","status":"done","date":"2026-05-11"},{"name":"Proposta","status":"running","date":"2026-05-15"}]'::jsonb, 'em_processo', now() - interval '11 days', false, now() - interval '11 days'),
        (p_session_id, 'Riverrun Streaming',     'QA Automation',       'Edmure Tully',      'e.tully@riverrun.demo',            '99999990009', 'https://linkedin.com/company/riverrun-streaming', 'https://riverrun.demo/qa-auto',         cv2, 'Remota',     'PJ',  'Família forte mas processos ainda em formação. Vale a pena pelo desafio.',                                          '[{"name":"Enviado","status":"done","date":"2026-05-11"},{"name":"Entrevista RH","status":"running","date":"2026-05-14"}]'::jsonb, 'em_processo', now() - interval '4 days', false, now() - interval '4 days'),
        (p_session_id, 'Castle Black Defense',   'QA Pleno',            'Eddison Tollett',   'e.tollett@castleblack.demo',       null,          'https://linkedin.com/company/castle-black',       'https://castleblack.demo/qa',           cv4, 'Presencial', 'CLT', 'Candidatei em dezembro/2025 e perdi contato. Patrulha da Noite tem cultura própria.',                              '[{"name":"Enviado","status":"running","date":"2025-12-20"}]'::jsonb, 'em_processo', now() - interval '146 days', true, now() - interval '146 days');

    -- ── 4 Logs (downloads + envios) ──
    -- LGPD: ip_address sempre hash, nunca IP real
    insert into demo_download_logs (session_id, cv_version_id, cv_name_snapshot, ip_address, user_agent, empresa, vaga, downloaded_at, created_at) values
        (p_session_id, cv2, 'Daenerys Targaryen · EM',     'ip:a3f2b8c1',                'Mozilla/5.0 (Macintosh; Intel Mac OS X)',                 'Targaryen Tech',       'QA Engineer', now() - interval '20 hours', now() - interval '20 hours'),
        (p_session_id, cv3, 'Tyrion Lannister · Arquiteto','ip:e5f6g7h8',                'Mozilla/5.0 (Windows NT 10.0)',                            'Winterfell Systems',   'SDET',        now() - interval '4 days',   now() - interval '4 days'),
        (p_session_id, cv2, 'Daenerys Targaryen · EM',     'admin-send-email',           'Send to Missandei <missandei@targaryentech.demo>',         'Targaryen Tech',       'QA Engineer', now() - interval '1 day',    now() - interval '1 day'),
        (p_session_id, cv3, 'Tyrion Lannister · Arquiteto','admin-send-whatsapp-link',   'Send to Sansa Stark via whatsapp-link',                    'Winterfell Systems',   'SDET',        now() - interval '5 days',   now() - interval '5 days');

end;
$$ language plpgsql security definer;
