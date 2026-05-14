-- ============================================================
-- Migration 009 — Campo archived na tabela de candidaturas
-- Executar no SQL Editor do Supabase
-- ============================================================

ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
