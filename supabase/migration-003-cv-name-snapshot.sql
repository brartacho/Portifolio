-- ============================================================
-- Migration 003 — snapshots de CV em download_logs
-- Executar no SQL Editor do Supabase
-- ============================================================
--
-- Problema: quando um cv_version é excluído, cv_version_id em download_logs
-- vira NULL (on delete set null) e tanto o nome quanto o ID do CV se perdem.
--
-- Solução: gravar nome e UUID do CV como colunas de texto imutáveis no log.
-- Mesmo que o CV seja excluído ou outro CV receba o mesmo nome no futuro,
-- o log sempre saberá exatamente qual versão foi referenciada.
-- ============================================================

alter table download_logs
    add column if not exists cv_name_snapshot text;

alter table download_logs
    add column if not exists cv_id_snapshot text;

comment on column download_logs.cv_name_snapshot is
    'Nome do CV no momento do log. Imutável — preservado mesmo após exclusão do cv_version.';

comment on column download_logs.cv_id_snapshot is
    'UUID do CV no momento do log (como texto). Imutável — não vira NULL como a FK cv_version_id.';
