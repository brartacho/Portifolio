-- migration-004-token-metadata.sql
-- Adiciona campos de contexto/rastreio nos tokens (link rastreado)
-- e nos logs de envio (arquivo/email)

ALTER TABLE download_tokens
    ADD COLUMN IF NOT EXISTS empresa text,
    ADD COLUMN IF NOT EXISTS vaga    text,
    ADD COLUMN IF NOT EXISTS notas   text,
    ADD COLUMN IF NOT EXISTS contato text;

ALTER TABLE download_logs
    ADD COLUMN IF NOT EXISTS empresa text,
    ADD COLUMN IF NOT EXISTS vaga    text,
    ADD COLUMN IF NOT EXISTS notas   text,
    ADD COLUMN IF NOT EXISTS contato text;
