-- ============================================================
-- Migration 006 — Separar `result` de stages em candidaturas
-- Executar no SQL Editor do Supabase
-- ============================================================
--
-- Contexto: "Aprovado" e "Recusado" eram tanto etapas quanto resultado
-- final da candidatura. Esta migração separa os conceitos:
--   - stages: array de passos do processo seletivo (Triagem, Entrevistas, etc.)
--   - result: desfecho final ('em_processo' | 'aprovado' | 'recusado')
-- ============================================================

ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS result TEXT NOT NULL DEFAULT 'em_processo'
  CHECK (result IN ('em_processo', 'aprovado', 'recusado'));

-- Backfill: deriva result a partir do estado atual das stages "Aprovado"/"Recusado"
UPDATE job_applications
   SET result = 'aprovado'
 WHERE result = 'em_processo'
   AND stages @> '[{"name":"Aprovado","done":true}]'::jsonb;

UPDATE job_applications
   SET result = 'recusado'
 WHERE result = 'em_processo'
   AND (
        stages @> '[{"name":"Recusado","done":true}]'::jsonb
     OR stages @> '[{"name":"Recusado","current":true}]'::jsonb
   );
