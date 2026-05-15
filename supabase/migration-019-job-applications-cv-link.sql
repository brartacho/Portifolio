-- ============================================================
-- ARTACHO.dev — Vincula currículo e phone à candidatura
-- cv_version_id: qual CV foi enviado (auto via fluxos de envio ou manual)
-- gestor_phone: WhatsApp do recrutador
-- ============================================================

alter table job_applications
  add column if not exists cv_version_id uuid references cv_versions(id) on delete set null;

alter table job_applications
  add column if not exists gestor_phone text;
