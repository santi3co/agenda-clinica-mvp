import crypto from 'node:crypto';
import { config } from '../../config.js';
import { query, withTransaction } from '../../db/pool.js';
import { conflict, HttpError, notFound } from '../../lib/errors.js';
import { localDate, localTime } from '../../lib/time.js';
import { audit } from '../audit/audit.service.js';
import { cancelAppointment, maskName, rescheduleAppointment } from '../appointments/appointments.service.js';
import { ACTIVE_STATUSES, PATIENT_TRANSITIONS, Status } from '../appointments/status.js';

/**
 * Enlace privado para que el paciente gestione su cita sin usuario ni contraseña.
 * - El token (32 bytes aleatorios) solo viaja en el enlace; en la BD se guarda su hash SHA-256.
 * - Cada acción exige además el número de documento del paciente (por si el enlace se reenvía).
 * - Un solo enlace vigente por cita: generar uno nuevo revoca el anterior.
 * - Deja de funcionar cuando la cita ya pasó.
 */
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const INVALID = 'El enlace no es válido o el documento no coincide';

/** Crea un enlace nuevo (revocando el anterior) dentro de la transacción `db`. Devuelve la ruta /cita/<token>. */
export async function issuePatientLink(db, appointmentId, userId = null) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(
    'UPDATE appointment_access_links SET revoked_at = now() WHERE appointment_id = $1 AND revoked_at IS NULL',
    [appointmentId],
  );
  await db.query(
    'INSERT INTO appointment_access_links (appointment_id, token_hash, created_by) VALUES ($1,$2,$3)',
    [appointmentId, hashToken(token), userId],
  );
  return `/cita/${token}`;
}

/** Admisiones genera (o regenera) el enlace para enviárselo al paciente. */
export async function generatePatientLink(req, appointmentId) {
  return withTransaction(async (db) => {
    const { rows } = await db.query('SELECT code, status, start_at FROM appointments WHERE id = $1 FOR UPDATE', [appointmentId]);
    const appt = rows[0];
    if (!appt) throw notFound('Solicitud no encontrada');
    if (appt.status === Status.CANCELADA || new Date(appt.start_at) <= new Date()) {
      throw conflict('Solo se generan enlaces para citas activas y futuras');
    }
    const path = await issuePatientLink(db, appointmentId, req.user.id);
    await audit(req, { action: 'GENERAR_ENLACE_PACIENTE', module: 'appointments', entity: 'appointment', entityId: appt.code }, db);
    return { path };
  });
}

/** Estado del enlace vigente de una cita (para el detalle de Admisiones). Nunca devuelve el token. */
export async function activeLinkInfo(appointmentId) {
  const { rows } = await query(
    `SELECT l.created_at AS "createdAt", l.last_used_at AS "lastUsedAt", u.username AS "createdBy"
       FROM appointment_access_links l LEFT JOIN users u ON u.id = l.created_by
      WHERE l.appointment_id = $1 AND l.revoked_at IS NULL`,
    [appointmentId],
  );
  return rows[0] ?? null;
}

/** Valida token + documento. Audita los intentos fallidos. */
async function resolve(req, { token, documentNumber }, action) {
  const { rows } = await query(
    `SELECT l.id AS "linkId", a.id, a.code, a.status, a.start_at, a.specialty_id, a.professional_id,
            sp.name AS specialty, pr.full_name AS professional, pa.full_name, pa.document_number
       FROM appointment_access_links l
       JOIN appointments a ON a.id = l.appointment_id
       JOIN patients pa ON pa.id = a.patient_id
       JOIN specialties sp ON sp.id = a.specialty_id
       JOIN professionals pr ON pr.id = a.professional_id
      WHERE l.token_hash = $1 AND l.revoked_at IS NULL`,
    [hashToken(token)],
  );
  const found = rows[0];
  const fail = async (status, message, motivo) => {
    await audit(req, {
      action, module: 'portal', entity: 'appointment', entityId: found?.code ?? null, result: 'FALLO', detail: { motivo },
    });
    throw new HttpError(status, message);
  };
  // Mismo mensaje si el enlace no existe o el documento no coincide (no revela cuál falló).
  if (!found) await fail(404, INVALID, 'enlace inexistente o revocado');
  if (found.document_number.toUpperCase() !== documentNumber.toUpperCase()) await fail(404, INVALID, 'documento no coincide');
  if (new Date(found.start_at) <= new Date()) await fail(410, 'Esta cita ya pasó: el enlace ya no está disponible', 'cita pasada');

  await query('UPDATE appointment_access_links SET last_used_at = now() WHERE id = $1', [found.linkId]);
  return found;
}

function view(a) {
  const hoursLeft = (new Date(a.start_at).getTime() - Date.now()) / 3_600_000;
  const tooLate = hoursLeft < config.patientChangeMinHours;
  return {
    code: a.code,
    status: a.status,
    date: localDate(a.start_at),
    time: localTime(a.start_at),
    specialtyId: a.specialty_id,
    specialty: a.specialty,
    professionalId: a.professional_id,
    professional: a.professional,
    patientName: maskName(a.full_name),
    canCancel: !tooLate && ACTIVE_STATUSES.includes(a.status),
    canReschedule: !tooLate && PATIENT_TRANSITIONS.REPROGRAMAR.from.includes(a.status),
    tooLate: tooLate && a.status !== Status.CANCELADA,
    minHours: config.patientChangeMinHours,
  };
}

export async function viewByLink(req, input) {
  const a = await resolve(req, input, 'VER_CITA_ENLACE');
  await audit(req, { action: 'VER_CITA_ENLACE', module: 'portal', entity: 'appointment', entityId: a.code });
  return view(a);
}

function assertAllowed(v, allowed) {
  if (allowed) return;
  if (v.tooLate) {
    throw conflict(`Faltan menos de ${v.minHours} horas para la cita: comuníquese con Admisiones por WhatsApp`);
  }
  throw conflict('Esta cita ya no se puede modificar desde el enlace');
}

export async function cancelByLink(req, { reason, ...input }) {
  const a = await resolve(req, input, 'CANCELAR');
  assertAllowed(view(a), view(a).canCancel);
  await cancelAppointment(req, a.id, { reason: `Cancelada por el paciente: ${reason}` }, { auditModule: 'portal' });
  return view(await resolve(req, input, 'CANCELAR'));
}

export async function rescheduleByLink(req, { professionalId, date, time, ...input }) {
  const a = await resolve(req, input, 'REPROGRAMAR');
  assertAllowed(view(a), view(a).canReschedule);
  await rescheduleAppointment(
    req, a.id,
    { professionalId: professionalId ?? null, date, time, note: 'Reprogramada por el paciente desde su enlace' },
    { rule: PATIENT_TRANSITIONS.REPROGRAMAR, auditModule: 'portal' },
  );
  return view(await resolve(req, input, 'REPROGRAMAR'));
}
