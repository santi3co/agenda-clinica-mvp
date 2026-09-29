import { config } from '../../config.js';
import { query, withTransaction } from '../../db/pool.js';
import { conflict, HttpError, notFound, badRequest } from '../../lib/errors.js';
import { localDate, localTime, toInstant } from '../../lib/time.js';
import { audit } from '../audit/audit.service.js';
import { getAvailability, assertBookableDate } from '../catalog/availability.service.js';
import { enqueueNotification, NotificationEvent } from '../integrations/notifications.service.js';
import { saludSystem12 } from '../integrations/saludsystem12.adapter.js';
import { allowedActions, TRANSITIONS, Status } from './status.js';

const SELECT_APPOINTMENT = `
  SELECT a.id, a.code, a.status, a.start_at AS "startAt", a.end_at AS "endAt", a.reason, a.channel,
         a.created_at AS "createdAt", a.updated_at AS "updatedAt", a.cancel_reason AS "cancelReason",
         a.saludsystem_ref AS "saludsystemRef", a.saludsystem_reg_at AS "saludsystemRegAt",
         a.specialty_id AS "specialtyId", sp.name AS "specialtyName",
         a.professional_id AS "professionalId", pr.full_name AS "professionalName",
         a.patient_id AS "patientId", pa.full_name AS "patientName",
         pa.document_type AS "documentType", pa.document_number AS "documentNumber",
         pa.phone, pa.email,
         a.assigned_to AS "assignedTo", au.username AS "assignedUsername"
    FROM appointments a
    JOIN patients pa ON pa.id = a.patient_id
    JOIN specialties sp ON sp.id = a.specialty_id
    JOIN professionals pr ON pr.id = a.professional_id
    LEFT JOIN users au ON au.id = a.assigned_to`;

function isUniqueViolation(err) {
  return err.code === '23505';
}

// ---------------------------------------------------------------- consultas

export async function listAppointments(f) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (f.status?.length) add('a.status = ANY(?::text[])', f.status);
  if (f.specialtyId) add('a.specialty_id = ?', f.specialtyId);
  if (f.professionalId) add('a.professional_id = ?', f.professionalId);
  if (f.dateFrom) add('a.start_at >= ?', toInstant(f.dateFrom, '00:00'));
  if (f.dateTo) add("a.start_at < (?::timestamptz + interval '1 day')", toInstant(f.dateTo, '00:00'));
  if (f.q) {
    params.push(`%${f.q}%`);
    const p = `$${params.length}`;
    where.push(`(pa.full_name ILIKE ${p} OR pa.document_number ILIKE ${p} OR a.code ILIKE ${p})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = f.sort === 'start' ? 'a.start_at ASC' : 'a.created_at DESC';

  const count = await query(
    `SELECT count(*)::int AS total FROM appointments a JOIN patients pa ON pa.id = a.patient_id ${whereSql}`,
    params,
  );
  params.push(f.pageSize, (f.page - 1) * f.pageSize);
  const { rows } = await query(
    `${SELECT_APPOINTMENT} ${whereSql} ORDER BY ${order} LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { items: rows, total: count.rows[0].total, page: f.page, pageSize: f.pageSize };
}

export async function getAppointmentDetail(id) {
  const { rows } = await query(`${SELECT_APPOINTMENT} WHERE a.id = $1`, [id]);
  const appointment = rows[0];
  if (!appointment) throw notFound('Solicitud no encontrada');

  const [history, notifications] = await Promise.all([
    query(
      `SELECT h.id, h.action, h.from_status AS "fromStatus", h.to_status AS "toStatus", h.note,
              h.previous_start_at AS "previousStartAt", h.new_start_at AS "newStartAt",
              h.created_at AS "createdAt", u.username, u.full_name AS "userFullName"
         FROM appointment_status_history h LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.appointment_id = $1 ORDER BY h.created_at, h.id`,
      [id],
    ),
    query(
      `SELECT id, channel, event_type AS "eventType", status, payload, created_at AS "createdAt"
         FROM notification_outbox WHERE appointment_id = $1 ORDER BY created_at, id`,
      [id],
    ),
  ]);
  return {
    ...appointment,
    allowedActions: allowedActions(appointment.status),
    history: history.rows,
    notifications: notifications.rows,
  };
}

export async function calendarEvents({ from, to, specialtyId, professionalId, status }) {
  const statuses = status?.length ? status : Object.values(Status).filter((s) => s !== Status.CANCELADA);
  const { rows } = await query(
    `SELECT a.id, a.code, a.status, a.start_at AS "startAt", a.end_at AS "endAt",
            pa.full_name AS "patientName", sp.name AS "specialtyName", pr.full_name AS "professionalName",
            a.professional_id AS "professionalId", a.specialty_id AS "specialtyId"
       FROM appointments a
       JOIN patients pa ON pa.id = a.patient_id
       JOIN specialties sp ON sp.id = a.specialty_id
       JOIN professionals pr ON pr.id = a.professional_id
      WHERE a.start_at >= $1 AND a.start_at < $2 AND a.status = ANY($3::text[])
        AND ($4::int IS NULL OR a.specialty_id = $4) AND ($5::int IS NULL OR a.professional_id = $5)
      ORDER BY a.start_at`,
    [new Date(from), new Date(to), statuses, specialtyId ?? null, professionalId ?? null],
  );
  return rows;
}

export async function dashboard() {
  const today = localDate();
  const dayStart = toInstant(today, '00:00');
  const [counts, todayList, pending, upcoming, specialties] = await Promise.all([
    query('SELECT status, count(*)::int AS total FROM appointments GROUP BY status'),
    query(
      `${SELECT_APPOINTMENT}
        WHERE a.start_at >= $1 AND a.start_at < $1::timestamptz + interval '1 day' AND a.status <> 'CANCELADA'
        ORDER BY a.start_at`,
      [dayStart],
    ),
    query(`${SELECT_APPOINTMENT} WHERE a.status = 'PENDIENTE' ORDER BY a.created_at LIMIT 8`),
    query(
      `${SELECT_APPOINTMENT}
        WHERE a.start_at >= $1::timestamptz + interval '1 day' AND a.start_at < $1::timestamptz + interval '8 days'
          AND a.status IN ('CONFIRMADA','REGISTRADA_EN_SALUDSYSTEM12','REPROGRAMADA')
        ORDER BY a.start_at LIMIT 8`,
      [dayStart],
    ),
    query('SELECT id, name FROM specialties WHERE active ORDER BY name'),
  ]);
  const availabilityToday = await Promise.all(
    specialties.rows.map(async (s) => ({
      specialtyId: s.id,
      specialtyName: s.name,
      freeSlots: (await getAvailability({ specialtyId: s.id, date: today })).length,
    })),
  );
  return {
    today,
    counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.total])),
    todayAppointments: todayList.rows,
    pending: pending.rows,
    upcoming: upcoming.rows,
    availabilityToday,
  };
}

// ---------------------------------------------------------------- cambios de estado

/**
 * Aplica una acción de la máquina de estados dentro de una transacción:
 * bloquea la fila, valida la transición, actualiza, escribe historial, cola de notificación y auditoría.
 */
async function transition(req, id, action, { note = null, extraUpdate, historyExtra = {}, notification } = {}) {
  const rule = TRANSITIONS[action];
  try {
    await withTransaction(async (db) => {
      const { rows } = await db.query('SELECT * FROM appointments WHERE id = $1 FOR UPDATE', [id]);
      const current = rows[0];
      if (!current) throw notFound('Solicitud no encontrada');
      if (!rule.from.includes(current.status)) {
        throw conflict(`No se puede ${action.toLowerCase().replaceAll('_', ' ')} una solicitud en estado ${current.status}`);
      }

      const sets = ['status = $2', 'updated_at = now()', 'assigned_to = COALESCE(assigned_to, $3)'];
      const params = [id, rule.to, req.user.id];
      if (action === 'TOMAR') sets[2] = 'assigned_to = $3';
      if (extraUpdate) {
        for (const [col, value] of Object.entries(await extraUpdate(db, current))) {
          params.push(value);
          sets.push(`${col} = $${params.length}`);
        }
      }
      await db.query(`UPDATE appointments SET ${sets.join(', ')} WHERE id = $1`, params);

      await db.query(
        `INSERT INTO appointment_status_history
           (appointment_id, action, from_status, to_status, changed_by, note, previous_start_at, new_start_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, action, current.status, rule.to, req.user.id, note,
          historyExtra.previousStartAt ?? null, historyExtra.newStartAt ?? null],
      );
      if (notification) {
        await enqueueNotification(db, { appointmentId: id, eventType: notification, payload: { code: current.code, ...historyExtra } });
      }
      await audit(req, {
        action, module: 'appointments', entity: 'appointment', entityId: current.code,
        detail: { from: current.status, to: rule.to, note, ...historyExtra },
      }, db);
    });
    return await getAppointmentDetail(id);
  } catch (err) {
    const httpErr = isUniqueViolation(err) ? conflict('El horario seleccionado ya está ocupado') : err;
    await audit(req, {
      action, module: 'appointments', entity: 'appointment', entityId: id, result: 'FALLO',
      detail: { error: httpErr.message },
    });
    throw httpErr;
  }
}

export const takeAppointment = (req, id, { note }) => transition(req, id, 'TOMAR', { note });

export const confirmAppointment = (req, id, { note }) =>
  transition(req, id, 'CONFIRMAR', { note, notification: NotificationEvent.CITA_CONFIRMADA });

export const cancelAppointment = (req, id, { reason }) =>
  transition(req, id, 'CANCELAR', {
    note: reason,
    extraUpdate: () => ({ cancel_reason: reason }),
    notification: NotificationEvent.CITA_CANCELADA,
  });

export const registerInSaludSystem12 = (req, id, { externalRef, note }) =>
  transition(req, id, 'REGISTRAR_SALUDSYSTEM12', {
    note: note || (externalRef ? `Nº en SaludSystem12: ${externalRef}` : null),
    extraUpdate: async (_db, current) => {
      const result = await saludSystem12.register(current, { externalRef });
      return { saludsystem_ref: result.externalRef, saludsystem_reg_at: new Date(), saludsystem_reg_by: req.user.id };
    },
  });

export async function rescheduleAppointment(req, id, { professionalId, date, time, note }) {
  assertBookableDate(date);
  const historyExtra = {};
  return transition(req, id, 'REPROGRAMAR', {
    note,
    historyExtra,
    notification: NotificationEvent.CITA_REPROGRAMADA,
    extraUpdate: async (db, current) => {
      const slots = await getAvailability(
        { specialtyId: current.specialty_id, professionalId, date, excludeAppointmentId: current.id }, db,
      );
      const slot = slots.find((s) => s.time === time);
      if (!slot) throw conflict('El horario seleccionado no está disponible para ese profesional');
      if (new Date(slot.startAt).getTime() === new Date(current.start_at).getTime()
        && slot.professionalId === current.professional_id) {
        throw badRequest('La nueva fecha/hora es igual a la actual');
      }
      historyExtra.previousStartAt = new Date(current.start_at).toISOString();
      historyExtra.newStartAt = slot.startAt;
      return { professional_id: slot.professionalId, start_at: slot.startAt, end_at: slot.endAt };
    },
  });
}

// ---------------------------------------------------------------- portal del paciente

export async function createPublicRequest(req, input) {
  const { specialtyId, professionalId, date, time } = input;
  assertBookableDate(date);
  try {
    return await withTransaction(async (db) => {
      const slots = await getAvailability({ specialtyId, professionalId: professionalId ?? null, date }, db);
      const slot = slots.find((s) => s.time === time); // si no eligió profesional: el primero libre
      if (!slot) throw conflict('El horario seleccionado ya no está disponible. Por favor elija otro.');

      const { rows: specialtyRows } = await db.query('SELECT requires_reason FROM specialties WHERE id = $1', [specialtyId]);
      if (specialtyRows[0]?.requires_reason && !input.reason) {
        throw badRequest('Esta especialidad requiere indicar el motivo de la consulta');
      }

      // Paciente: se identifica por tipo + número de documento. Se actualizan datos de contacto.
      const { rows: patientRows } = await db.query(
        `INSERT INTO patients (document_type, document_number, full_name, phone, email, data_consent_at, consent_version)
         VALUES ($1,$2,$3,$4,$5, now(), $6)
         ON CONFLICT (document_type, document_number) DO UPDATE
           SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, email = EXCLUDED.email,
               data_consent_at = now(), consent_version = EXCLUDED.consent_version, updated_at = now()
         RETURNING id, (xmax = 0) AS inserted`,
        [input.documentType, input.documentNumber, input.fullName, input.phone, input.email || null, input.consentVersion],
      );
      const patient = patientRows[0];

      const { rows: activeRows } = await db.query(
        `SELECT count(*)::int AS n FROM appointments
          WHERE patient_id = $1 AND status <> 'CANCELADA' AND start_at > now()`,
        [patient.id],
      );
      if (activeRows[0].n >= config.maxActiveRequestsPerPatient) {
        throw conflict('Ya tiene el máximo de solicitudes activas. Comuníquese con Admisiones para gestionarlas.');
      }

      const { rows } = await db.query(
        `INSERT INTO appointments (patient_id, specialty_id, professional_id, start_at, end_at, status, reason, channel)
         VALUES ($1,$2,$3,$4,$5,'PENDIENTE',$6,'PORTAL') RETURNING id, code, start_at`,
        [patient.id, specialtyId, slot.professionalId, slot.startAt, slot.endAt, input.reason || null],
      );
      const appt = rows[0];
      await db.query(
        `INSERT INTO appointment_status_history (appointment_id, action, from_status, to_status, changed_by, note)
         VALUES ($1, 'CREAR', NULL, 'PENDIENTE', NULL, 'Solicitud creada por el paciente desde el portal')`,
        [appt.id],
      );
      await enqueueNotification(db, {
        appointmentId: appt.id, eventType: NotificationEvent.SOLICITUD_RECIBIDA, payload: { code: appt.code },
      });
      await audit(req, {
        action: 'CREAR_SOLICITUD', module: 'portal', entity: 'appointment', entityId: appt.code,
        detail: { pacienteNuevo: patient.inserted, datosContactoActualizados: !patient.inserted },
      }, db);

      return {
        code: appt.code,
        status: Status.PENDIENTE,
        date: localDate(appt.start_at),
        time: localTime(appt.start_at),
        professionalName: slot.professionalName,
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('El horario seleccionado acaba de ser tomado. Por favor elija otro.');
    throw err;
  }
}

/** Consulta pública: exige código + documento y devuelve solo datos mínimos. */
export async function lookupPublic(req, { code, documentNumber }) {
  const { rows } = await query(
    `SELECT a.code, a.status, a.start_at, sp.name AS specialty, pr.full_name AS professional, pa.full_name
       FROM appointments a
       JOIN patients pa ON pa.id = a.patient_id
       JOIN specialties sp ON sp.id = a.specialty_id
       JOIN professionals pr ON pr.id = a.professional_id
      WHERE a.code = $1 AND pa.document_number = $2`,
    [code, documentNumber],
  );
  const found = rows[0];
  await audit(req, {
    action: 'CONSULTAR_ESTADO', module: 'portal', entity: 'appointment', entityId: code,
    result: found ? 'EXITO' : 'FALLO',
  });
  // Mismo mensaje si el código no existe o el documento no coincide (no revela cuál falló).
  if (!found) throw new HttpError(404, 'No encontramos una solicitud con esos datos');
  const [first, ...rest] = found.full_name.split(' ');
  return {
    code: found.code,
    status: found.status,
    date: localDate(found.start_at),
    time: localTime(found.start_at),
    specialty: found.specialty,
    professional: found.professional,
    patientName: `${first} ${rest.map((w) => `${w[0]}.`).join(' ')}`.trim(),
  };
}
