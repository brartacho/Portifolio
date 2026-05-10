-- ============================================================
-- Migration 003 — cv_name_snapshot em download_logs
-- Executar no SQL Editor do Supabase
-- ============================================================
--
-- Problema: quando um cv_version é excluído, cv_version_id em download_logs
-- vira NULL (on delete set null) e o nome do currículo se perde para sempre.
--
-- Solução: gravar o nome do CV como snapshot de texto no momento do log.
-- Essa coluna nunca é alterada após a inserção — é imutável por design.
-- ============================================================

alter table download_logs
    add column if not exists cv_name_snapshot text;

comment on column download_logs.cv_name_snapshot is
    'Nome do CV no momento do log. Imutável — preservado mesmo após exclusão do cv_version.';
