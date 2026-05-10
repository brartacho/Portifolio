-- ============================================================
-- Migration 005 — Tabela de candidaturas (Gestão de Vagas)
-- Executar no SQL Editor do Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS job_applications (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa          TEXT        NOT NULL,
  vaga             TEXT,
  linkedin_empresa TEXT,
  link_vaga        TEXT,
  observacoes      TEXT,
  gestor_nome      TEXT,
  gestor_email     TEXT,
  data_envio       TIMESTAMPTZ,
  source           TEXT        NOT NULL DEFAULT 'manual',
  stages           JSONB       NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role only"
  ON job_applications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
