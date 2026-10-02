-- =====================================================================
-- Enlace privado para que el paciente gestione su cita (ver, cancelar, reprogramar).
-- Solo se guarda el hash SHA-256 del token: el enlace completo no se puede reconstruir desde la BD.
-- =====================================================================
CREATE TABLE appointment_access_links (
  id              SERIAL PRIMARY KEY,
  appointment_id  INT          NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  token_hash      CHAR(64)     NOT NULL UNIQUE,
  created_by      INT          REFERENCES users(id),  -- NULL = generado al crear la cita en el portal
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ,                      -- se revoca al generar uno nuevo
  last_used_at    TIMESTAMPTZ
);
-- Un solo enlace vigente por cita.
CREATE UNIQUE INDEX appointment_access_links_one_active
  ON appointment_access_links(appointment_id) WHERE revoked_at IS NULL;

ALTER TABLE appointment_access_links ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON appointment_access_links FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON SEQUENCE appointment_access_links_id_seq FROM anon, authenticated';
  END IF;
END $$;
