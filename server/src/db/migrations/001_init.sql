-- =====================================================================
-- Portal de Agendamiento — PROTOTIPO. Esquema inicial.
-- Solo gestión de citas. NO contiene ni debe contener información clínica.
-- =====================================================================

-- ---------- RBAC ----------
CREATE TABLE roles (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(30)  NOT NULL UNIQUE,          -- ADMISIONISTA, ADMINISTRADOR
  name        VARCHAR(80)  NOT NULL
);

CREATE TABLE permissions (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(60)  NOT NULL UNIQUE,          -- p.ej. appointments:manage
  description VARCHAR(200) NOT NULL
);

CREATE TABLE role_permissions (
  role_id       INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Personal de la clínica. Los pacientes NO son usuarios del sistema.
CREATE TABLE users (
  id             SERIAL PRIMARY KEY,
  username       VARCHAR(40)  NOT NULL UNIQUE,
  full_name      VARCHAR(120) NOT NULL,
  password_hash  VARCHAR(100) NOT NULL,              -- bcrypt, nunca texto plano
  role_id        INT          NOT NULL REFERENCES roles(id),
  active         BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT users_username_format CHECK (username ~ '^[a-z0-9._-]{3,40}$')
);

-- ---------- Catálogo ----------
CREATE TABLE specialties (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(30)  NOT NULL UNIQUE,
  name            VARCHAR(100) NOT NULL,
  slot_minutes    SMALLINT     NOT NULL DEFAULT 20 CHECK (slot_minutes BETWEEN 10 AND 120),
  requires_reason BOOLEAN      NOT NULL DEFAULT FALSE,
  active          BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE professionals (
  id           SERIAL PRIMARY KEY,
  full_name    VARCHAR(120) NOT NULL,
  specialty_id INT          NOT NULL REFERENCES specialties(id),
  active       BOOLEAN      NOT NULL DEFAULT TRUE
);
CREATE INDEX professionals_specialty_idx ON professionals(specialty_id);

-- Agenda semanal recurrente. weekday: 1 = lunes ... 7 = domingo (ISO).
CREATE TABLE schedules (
  id              SERIAL PRIMARY KEY,
  professional_id INT      NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  weekday         SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time      TIME     NOT NULL,
  end_time        TIME     NOT NULL,
  CONSTRAINT schedules_time_order CHECK (end_time > start_time)
);
CREATE INDEX schedules_professional_idx ON schedules(professional_id, weekday);

-- ---------- Pacientes (solo identificación y contacto) ----------
CREATE TABLE patients (
  id               SERIAL PRIMARY KEY,
  document_type    VARCHAR(3)   NOT NULL CHECK (document_type IN ('CC','TI','CE','PA','RC','PT')),
  document_number  VARCHAR(20)  NOT NULL CHECK (document_number ~ '^[A-Za-z0-9]{3,20}$'),
  full_name        VARCHAR(120) NOT NULL,
  phone            VARCHAR(20)  NOT NULL,
  email            VARCHAR(120),
  data_consent_at  TIMESTAMPTZ  NOT NULL,            -- aceptación de tratamiento de datos
  consent_version  VARCHAR(20)  NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT patients_document_unique UNIQUE (document_type, document_number)
);

-- ---------- Solicitudes / citas ----------
CREATE SEQUENCE appointment_code_seq START 1;

CREATE TABLE appointments (
  id                  SERIAL PRIMARY KEY,
  code                VARCHAR(20)  NOT NULL UNIQUE
                        DEFAULT ('SOL-' || lpad(nextval('appointment_code_seq')::text, 6, '0')),
  patient_id          INT          NOT NULL REFERENCES patients(id),
  specialty_id        INT          NOT NULL REFERENCES specialties(id),
  professional_id     INT          NOT NULL REFERENCES professionals(id),
  start_at            TIMESTAMPTZ  NOT NULL,
  end_at              TIMESTAMPTZ  NOT NULL,
  status              VARCHAR(40)  NOT NULL DEFAULT 'PENDIENTE',
  reason              VARCHAR(200),                  -- motivo administrativo corto, opcional
  channel             VARCHAR(20)  NOT NULL DEFAULT 'PORTAL',
  assigned_to         INT          REFERENCES users(id),
  saludsystem_ref     VARCHAR(50),                   -- nº de cita digitado manualmente desde SaludSystem12
  saludsystem_reg_at  TIMESTAMPTZ,
  saludsystem_reg_by  INT          REFERENCES users(id),
  cancel_reason       VARCHAR(200),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT appointments_time_order CHECK (end_at > start_at),
  CONSTRAINT appointments_status_valid CHECK (status IN (
    'PENDIENTE','EN_GESTION','CONFIRMADA','REPROGRAMADA','CANCELADA','REGISTRADA_EN_SALUDSYSTEM12')),
  CONSTRAINT appointments_channel_valid CHECK (channel IN ('PORTAL','ADMISIONES'))
);

-- Regla de negocio en la BD: un profesional no puede tener dos citas activas a la misma hora.
CREATE UNIQUE INDEX appointments_no_double_booking
  ON appointments(professional_id, start_at) WHERE status <> 'CANCELADA';
CREATE INDEX appointments_status_idx  ON appointments(status);
CREATE INDEX appointments_start_idx   ON appointments(start_at);
CREATE INDEX appointments_patient_idx ON appointments(patient_id);

-- Trazabilidad funcional de cada cambio de estado.
CREATE TABLE appointment_status_history (
  id              BIGSERIAL PRIMARY KEY,
  appointment_id  INT          NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  action          VARCHAR(40)  NOT NULL,             -- CREAR, TOMAR, CONFIRMAR, REPROGRAMAR, CANCELAR, REGISTRAR_SALUDSYSTEM12
  from_status     VARCHAR(40),
  to_status       VARCHAR(40)  NOT NULL,
  changed_by      INT          REFERENCES users(id), -- NULL = paciente vía portal
  note            VARCHAR(300),
  previous_start_at TIMESTAMPTZ,
  new_start_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX status_history_appointment_idx ON appointment_status_history(appointment_id, created_at);

-- ---------- Auditoría técnica ----------
CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INT          REFERENCES users(id),     -- NULL = anónimo / portal del paciente
  username    VARCHAR(40),                           -- copia para lectura aunque el usuario cambie
  action      VARCHAR(60)  NOT NULL,
  module      VARCHAR(30)  NOT NULL,
  entity      VARCHAR(40),
  entity_id   VARCHAR(40),
  result      VARCHAR(10)  NOT NULL CHECK (result IN ('EXITO','FALLO','DENEGADO')),
  ip          VARCHAR(64),
  detail      JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at DESC);
CREATE INDEX audit_logs_entity_idx  ON audit_logs(entity, entity_id);

-- ---------- Preparación para WhatsApp (sin envío real) ----------
-- Patrón "outbox": cada evento relevante deja aquí el mensaje que se enviaría.
-- Un futuro worker con el proveedor oficial (WhatsApp Business Platform) los procesará.
CREATE TABLE notification_outbox (
  id              BIGSERIAL PRIMARY KEY,
  appointment_id  INT          NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  channel         VARCHAR(20)  NOT NULL DEFAULT 'WHATSAPP',
  event_type      VARCHAR(40)  NOT NULL,             -- SOLICITUD_RECIBIDA, CITA_CONFIRMADA, CITA_REPROGRAMADA, CITA_CANCELADA
  payload         JSONB        NOT NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'SIMULADO'
                    CHECK (status IN ('SIMULADO','PENDIENTE','ENVIADO','FALLIDO')),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX notification_outbox_appointment_idx ON notification_outbox(appointment_id);

-- ---------- Endurecimiento para Supabase ----------
-- El frontend nunca accede a la BD. Se activa RLS sin políticas y se revocan permisos a los
-- roles públicos de Supabase para que la Data API (PostgREST) no exponga estas tablas.
-- El backend se conecta como propietario de las tablas, por lo que no le afecta RLS.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['roles','permissions','role_permissions','users','specialties',
    'professionals','schedules','patients','appointments','appointment_status_history',
    'audit_logs','notification_outbox']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
  END IF;
END $$;
