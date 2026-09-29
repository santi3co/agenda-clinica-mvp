export const TZ = 'America/Bogota';

export const STATUS = {
  PENDIENTE: { label: 'Pendiente', tone: 'amber', color: '#b45309' },
  EN_GESTION: { label: 'En gestión', tone: 'blue', color: '#1d4ed8' },
  CONFIRMADA: { label: 'Confirmada', tone: 'green', color: '#15803d' },
  REPROGRAMADA: { label: 'Reprogramada', tone: 'violet', color: '#7c3aed' },
  CANCELADA: { label: 'Cancelada', tone: 'gray', color: '#6b7280' },
  REGISTRADA_EN_SALUDSYSTEM12: { label: 'Registrada en SaludSystem12', tone: 'teal', color: '#0f766e' },
};

export const ACTION_LABEL = {
  CREAR: 'Solicitud creada',
  TOMAR: 'Tomada para gestión',
  CONFIRMAR: 'Cita confirmada',
  REPROGRAMAR: 'Cita reprogramada',
  CANCELAR: 'Cita cancelada',
  REGISTRAR_SALUDSYSTEM12: 'Registrada en SaludSystem12',
};

export const DOC_TYPES = [
  ['CC', 'Cédula de ciudadanía'],
  ['TI', 'Tarjeta de identidad'],
  ['CE', 'Cédula de extranjería'],
  ['PA', 'Pasaporte'],
  ['RC', 'Registro civil'],
  ['PT', 'Permiso por protección temporal'],
];

const fmt = (opts) => new Intl.DateTimeFormat('es-CO', { timeZone: TZ, ...opts });
const dateTimeF = fmt({ day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const dateF = fmt({ weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const timeF = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });
const isoDateF = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export const fmtDateTime = (v) => (v ? dateTimeF.format(new Date(v)) : '—');
export const fmtDate = (v) => (v ? dateF.format(new Date(v)) : '—');
export const fmtTime = (v) => (v ? timeF.format(new Date(v)) : '—');

/** Fecha local de Bogotá en formato YYYY-MM-DD. */
export const isoDate = (d = new Date()) => isoDateF.format(d);

export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "2026-10-02" → "vie 02 oct" (fecha pura, sin conversión de zona). */
export function fmtPlainDate(date, opts = { weekday: 'short', day: '2-digit', month: 'short' }) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', ...opts }).format(new Date(`${date}T12:00:00Z`));
}
