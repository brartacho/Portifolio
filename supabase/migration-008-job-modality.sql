-- ============================================================
-- Migration 008 — Modalidade e Tipo de Contratação por Vaga
-- Executar no SQL Editor do Supabase
-- ============================================================

ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS modalidade       TEXT CHECK (modalidade IN ('Presencial','Híbrida','Remota')),
  ADD COLUMN IF NOT EXISTS tipo_contratacao TEXT CHECK (tipo_contratacao IN ('CLT','PJ','Freelancer'));
