import { config } from '../config.js';

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
});
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: config.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Fecha local de Bogotá (YYYY-MM-DD) de un instante. */
export function localDate(d = new Date()) {
  return dateFmt.format(d);
}

/** Hora local de Bogotá (HH:MM) de un instante. */
export function localTime(d) {
  return timeFmt.format(d);
}

/** Instante correspondiente a una fecha y hora locales de Bogotá. */
export function toInstant(date, time) {
  return new Date(`${date}T${time.slice(0, 5)}:00${config.tzOffset}`);
}

/** Día ISO de la semana (1 = lunes ... 7 = domingo) de una fecha YYYY-MM-DD. */
export function isoWeekday(date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function minutesToTime(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
