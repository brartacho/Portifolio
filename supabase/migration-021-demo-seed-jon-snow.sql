-- ============================================================
-- Migration 021 - Reformula seed da demo
-- Antes: 5 personagens GoT diferentes como candidatos distintos
-- Agora: 1 candidato fictício (Jon Snow) com 5 variações de CV (QA)
-- Empresas reais tech brasileiras, gestores fictícios realistas.
-- ============================================================

create or replace function demo_seed(p_session_id uuid) returns void as $$
declare
    cv1 uuid; cv2 uuid; cv3 uuid; cv4 uuid; cv5 uuid;
begin
    -- Idempotente
    if exists (select 1 from demo_cv_versions where session_id = p_session_id limit 1) then
        return;
    end if;

    -- ── 5 variações de currículo do mesmo candidato (Jon Snow) ──
    insert into demo_cv_versions (session_id, name, description, file_name, active, created_at) values
        (p_session_id, 'QA Sênior — Padrão',         'Versão geral para candidaturas sênior',                 'cv-jon-snow-qa-senior.pdf',    true,  now() - interval '35 days')
        returning id into cv1;
    insert into demo_cv_versions (session_id, name, description, file_name, active, created_at) values
        (p_session_id, 'QA Automation — Remoto',     'Foco em Playwright/Selenium, vagas remotas',            'cv-jon-snow-qa-auto.pdf',      true,  now() - interval '12 days')
        returning id into cv2;
    insert into demo_cv_versions (session_id, name, description, file_name, active, created_at) values
        (p_session_id, 'SDET — Mercado Financeiro', 'Adaptado para fintechs',                                 'cv-jon-snow-sdet.pdf',         true,  now() - interval '10 days')
        returning id into cv3;
    insert into demo_cv_versions (session_id, name, description, file_name, active, created_at) values
        (p_session_id, 'Test Analyst — Pleno',       'Versão para vagas pleno',                               'cv-jon-snow-test-analyst.pdf', false, now() - interval '180 days')
        returning id into cv4;
    insert into demo_cv_versions (session_id, name, description, file_name, active, created_at) values
        (p_session_id, 'QA Bilíngue — EN',           'Versão bilíngue para empresas internacionais',          'cv-jon-snow-bilingue.pdf',     true,  now() - interval '55 days')
        returning id into cv5;

    -- ── 8 Tokens (variedade de status: ativos, expirados, esgotados, revogados) ──
    insert into demo_download_tokens (session_id, cv_version_id, label, hash, expires_at, max_uses, use_count, revoked, created_at) values
        (p_session_id, cv2, 'Nubank · Ana Costa · Sr QA',        'a1b2c3d4', now() + interval '5 days',    5, 1, false, now() - interval '2 days'),
        (p_session_id, cv3, 'iFood · Camila Rocha · SDET',       'e5f6g7h8', now() + interval '3 days',    3, 2, false, now() - interval '4 days'),
        (p_session_id, cv1, 'CI&T · Rafael Dias · Automation',   'i9j0k1l2', now() - interval '1 day',     5, 5, false, now() - interval '10 days'),
        (p_session_id, cv5, 'Globant · Pedro Almeida · QA EN',   'm3n4o5p6', now() + interval '7 days', null, 0, false, now() - interval '1 day'),
        (p_session_id, cv2, 'Stone · Marina Souza · QA',         'q7r8s9t0', now() - interval '3 days',    1, 1, false, now() - interval '8 days'),
        (p_session_id, cv1, 'PagSeguro · Lucas Mendes · Pleno',  'u1v2w3x4', now() + interval '2 days',    3, 0, true,  now() - interval '6 days'),
        (p_session_id, cv3, 'MercadoLivre · João Almeida · SDET','y5z6a7b8', now() + interval '10 days',  10, 3, false, now() - interval '5 days'),
        (p_session_id, cv2, 'Magalu · Lia Pereira · QA Auto',    'c9d0e1f2', now() + interval '1 day',     5, 2, false, now() - interval '3 days');

    -- ── 10 Candidaturas em empresas tech brasileiras ──
    insert into demo_job_applications (session_id, empresa, vaga, gestor_nome, gestor_email, gestor_phone, linkedin_empresa, link_vaga, cv_version_id, modalidade, tipo_contratacao, observacoes, stages, result, data_envio, archived, created_at) values
        (p_session_id, 'Nubank',        'QA Engineer',         'Ana Costa',       'a.costa@nubank.com.br',        '11987654321', 'https://linkedin.com/company/nubank',         'https://nubank.com.br/careers/qa',     cv2, 'Remota',     'CLT', 'Recrutadora respondeu rápido. Processo bem estruturado.',                       '[{"name":"Enviado","status":"running","date":"2026-05-14"},{"name":"Entrevista RH","status":"pending"},{"name":"Teste Técnico","status":"pending"},{"name":"Proposta","status":"pending"}]'::jsonb, 'em_processo', now() - interval '1 day',  false, now() - interval '1 day'),
        (p_session_id, 'iFood',         'SDET',                'Camila Rocha',    'c.rocha@ifood.com.br',         '11912345678', 'https://linkedin.com/company/ifood',          'https://ifood.com.br/jobs/sdet',       cv3, 'Híbrida',    'CLT', 'Excelente cultura. Time muito técnico.',                                         '[{"name":"Enviado","status":"done","date":"2026-05-10"},{"name":"Entrevista RH","status":"done","date":"2026-05-13"},{"name":"Teste Técnico","status":"running","date":"2026-05-16"},{"name":"Proposta","status":"pending"}]'::jsonb, 'em_processo', now() - interval '5 days', false, now() - interval '5 days'),
        (p_session_id, 'Conta Azul',    'Test Analyst',        'Rafael Dias',     'r.dias@contaazul.com',         '47999887766', 'https://linkedin.com/company/conta-azul',     'https://contaazul.com/careers/qa',     cv1, 'Remota',     'CLT', 'Proposta aceita! Salário acima da média, ambiente colaborativo.',               '[{"name":"Enviado","status":"done","date":"2026-05-02"},{"name":"Entrevista RH","status":"done","date":"2026-05-06"},{"name":"Proposta","status":"done","date":"2026-05-09"}]'::jsonb, 'aprovado', now() - interval '13 days', false, now() - interval '13 days'),
        (p_session_id, 'CI&T',          'Automation Engineer', 'Ana Lima',        'a.lima@ciandt.com',            null,          'https://linkedin.com/company/ciandt',         'https://ciandt.com/jobs/automation',   cv1, 'Híbrida',    'PJ',  'Não passou no técnico — exigiram muita experiência em frameworks legados.',     '[{"name":"Enviado","status":"done","date":"2026-04-28"},{"name":"Entrevista RH","status":"rejected","date":"2026-05-05"}]'::jsonb, 'recusado',    now() - interval '17 days', false, now() - interval '17 days'),
        (p_session_id, 'Totvs',         'QA Pleno',            'Pedro Almeida',   'p.almeida@totvs.com.br',       '41988776655', 'https://linkedin.com/company/totvs',          'https://totvs.com/jobs/qa-pleno',      cv1, 'Presencial', 'CLT', null,                                                                            '[{"name":"Enviado","status":"running","date":"2026-05-15"},{"name":"Entrevista RH","status":"pending"},{"name":"Teste Técnico","status":"pending"}]'::jsonb, 'em_processo', now() - interval '0 days', false, now() - interval '0 days'),
        (p_session_id, 'Stone',         'QA Engineer',         'Marina Souza',    'm.souza@stone.com.br',         '21988112233', 'https://linkedin.com/company/stone-co',       'https://stone.com.br/careers/qa',      cv2, 'Remota',     'CLT', 'Fintech sólida. Processo seletivo bem técnico.',                                '[{"name":"Enviado","status":"done","date":"2026-05-08"},{"name":"Entrevista RH","status":"done","date":"2026-05-12"},{"name":"Teste Técnico","status":"pending"}]'::jsonb, 'em_processo', now() - interval '7 days', false, now() - interval '7 days'),
        (p_session_id, 'PagSeguro',     'Test Analyst Pleno',  'Lucas Mendes',    'l.mendes@pagseguro.com',       null,          'https://linkedin.com/company/pagseguro',      'https://pagseguro.uol.com.br/jobs/ta', cv1, 'Híbrida',    'CLT', 'Aguardando retorno do RH há 3 dias.',                                            '[{"name":"Enviado","status":"running","date":"2026-05-09"},{"name":"Entrevista RH","status":"pending"}]'::jsonb, 'em_processo', now() - interval '6 days', false, now() - interval '6 days'),
        (p_session_id, 'MercadoLivre',  'SDET Sênior',         'João Almeida',    'j.almeida@mercadolivre.com',   '11955443322', 'https://linkedin.com/company/mercadolivre',   'https://mercadolivre.com/jobs/sdet-sr',cv3, 'Remota',     'CLT', 'Proposta em discussão. Pacote competitivo.',                                    '[{"name":"Enviado","status":"done","date":"2026-05-04"},{"name":"Entrevista RH","status":"done","date":"2026-05-08"},{"name":"Teste Técnico","status":"done","date":"2026-05-11"},{"name":"Proposta","status":"running","date":"2026-05-15"}]'::jsonb, 'em_processo', now() - interval '11 days', false, now() - interval '11 days'),
        (p_session_id, 'Magalu',        'QA Automation',       'Lia Pereira',     'l.pereira@magazineluiza.com',  '11944332211', 'https://linkedin.com/company/magazine-luiza', 'https://magalu.com/jobs/qa-auto',      cv2, 'Remota',     'PJ',  'Time enxuto mas muito produtivo. PJ com bom desconto.',                          '[{"name":"Enviado","status":"done","date":"2026-05-11"},{"name":"Entrevista RH","status":"running","date":"2026-05-14"}]'::jsonb, 'em_processo', now() - interval '4 days', false, now() - interval '4 days'),
        (p_session_id, 'Banco Inter',   'QA Pleno',            'Carlos Vidal',    'c.vidal@bancointer.com.br',    null,          'https://linkedin.com/company/banco-inter',    'https://bancointer.com.br/jobs/qa',    cv4, 'Presencial', 'CLT', 'Vaga antiga (dez/2025). Perdi contato, candidatura arquivada.',                  '[{"name":"Enviado","status":"running","date":"2025-12-20"}]'::jsonb, 'em_processo', now() - interval '146 days', true, now() - interval '146 days');

    -- ── 4 Logs (downloads + envios) — LGPD: IPs sempre hash ──
    insert into demo_download_logs (session_id, cv_version_id, cv_name_snapshot, ip_address, user_agent, empresa, vaga, downloaded_at, created_at) values
        (p_session_id, cv2, 'QA Automation — Remoto',     'ip:a3f2b8c1',                'Mozilla/5.0 (Macintosh; Intel Mac OS X)',           'Nubank',  'QA Engineer', now() - interval '20 hours', now() - interval '20 hours'),
        (p_session_id, cv3, 'SDET — Mercado Financeiro',  'ip:e5f6g7h8',                'Mozilla/5.0 (Windows NT 10.0)',                      'iFood',   'SDET',        now() - interval '4 days',   now() - interval '4 days'),
        (p_session_id, cv2, 'QA Automation — Remoto',     'admin-send-email',           'Send to Ana Costa <a.costa@nubank.com.br>',         'Nubank',  'QA Engineer', now() - interval '1 day',    now() - interval '1 day'),
        (p_session_id, cv3, 'SDET — Mercado Financeiro',  'admin-send-whatsapp-link',   'Send to Camila Rocha via whatsapp-link',            'iFood',   'SDET',        now() - interval '5 days',   now() - interval '5 days');

end;
$$ language plpgsql security definer;
