import { query } from '../../db/pool.js';
import { config } from '../../config.js';
import { badRequest } from '../../lib/errors.js';
import { addDays, isoWeekday, localDate, minutesToTime, timeToMinutes, toInstant } from '../../lib/time.js';

/** Verifica que la fecha esté dentro de la ventana de agendamiento (hoy .. hoy + N días). */
export function assertBookableDate(date) {
  const today = localDate();
  if (date < today || date > addDays(today, config.bookingWindowDays)) {
    throw badRequest(`La fecha debe estar entre hoy y los próximos ${config.bookingWindowDays} días`);
  }
}

/**
 * Calcula los turnos libres de una especialidad (y opcionalmente de un profesional) en una fecha.
 * Turnos = agenda semanal del profesional dividida en bloques de `slot_minutes`,
 * menos citas activas (no canceladas), menos horas ya pasadas.
 * `excludeAppointmentId` permite que una cita que se está reprogramando no se bloquee a sí misma.
 */
export async function getAvailability({ specialtyId, professionalId = null, date, excludeAppointmentId = null }, db = { query }) {
  const weekday = isoWeekday(date);
  const { rows: blocks } = await db.query(
    `SELECT p.id AS professional_id, p.full_name, s.start_time, s.end_time, sp.slot_minutes
       FROM professionals p
       JOIN specialties sp ON sp.id = p.specialty_id AND sp.active
       JOIN schedules s ON s.professional_id = p.id AND s.weekday = $2
      WHERE p.active AND p.specialty_id = $1 AND ($3::int IS NULL OR p.id = $3)
      ORDER BY s.start_time, p.full_name`,
    [specialtyId, weekday, professionalId],
  );
  if (blocks.length === 0) return [];

  const dayStart = toInstant(date, '00:00');
  const dayEnd = toInstant(addDays(date, 1), '00:00');
  const { rows: taken } = await db.query(
    `SELECT professional_id, start_at FROM appointments
      WHERE status <> 'CANCELADA' AND start_at >= $1 AND start_at < $2
        AND professional_id = ANY($3::int[]) AND ($4::int IS NULL OR id <> $4)`,
    [dayStart, dayEnd, [...new Set(blocks.map((b) => b.professional_id))], excludeAppointmentId],
  );
  const takenKeys = new Set(taken.map((t) => `${t.professional_id}|${new Date(t.start_at).getTime()}`));

  const now = Date.now();
  const slots = [];
  for (const b of blocks) {
    for (let m = timeToMinutes(b.start_time); m + b.slot_minutes <= timeToMinutes(b.end_time); m += b.slot_minutes) {
      const time = minutesToTime(m);
      const start = toInstant(date, time);
      if (start.getTime() <= now) continue;
      if (takenKeys.has(`${b.professional_id}|${start.getTime()}`)) continue;
      slots.push({
        time,
        startAt: start.toISOString(),
        endAt: new Date(start.getTime() + b.slot_minutes * 60_000).toISOString(),
        professionalId: b.professional_id,
        professionalName: b.full_name,
      });
    }
  }
  return slots.sort((a, b) => a.time.localeCompare(b.time) || a.professionalName.localeCompare(b.professionalName));
}
