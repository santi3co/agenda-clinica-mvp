export const Status = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  EN_GESTION: 'EN_GESTION',
  CONFIRMADA: 'CONFIRMADA',
  REPROGRAMADA: 'REPROGRAMADA',
  CANCELADA: 'CANCELADA',
  REGISTRADA_EN_SALUDSYSTEM12: 'REGISTRADA_EN_SALUDSYSTEM12',
});

/** Estados que ocupan un turno y cuentan como solicitud activa del paciente. */
export const ACTIVE_STATUSES = [
  Status.PENDIENTE, Status.EN_GESTION, Status.CONFIRMADA, Status.REPROGRAMADA, Status.REGISTRADA_EN_SALUDSYSTEM12,
];

/** Máquina de estados: acción → estados de origen permitidos → estado destino. */
export const TRANSITIONS = Object.freeze({
  TOMAR: { from: [Status.PENDIENTE], to: Status.EN_GESTION },
  CONFIRMAR: { from: [Status.EN_GESTION, Status.REPROGRAMADA], to: Status.CONFIRMADA },
  REPROGRAMAR: {
    from: [Status.EN_GESTION, Status.CONFIRMADA, Status.REPROGRAMADA, Status.REGISTRADA_EN_SALUDSYSTEM12],
    to: Status.REPROGRAMADA,
  },
  CANCELAR: { from: ACTIVE_STATUSES, to: Status.CANCELADA },
  REGISTRAR_SALUDSYSTEM12: { from: [Status.CONFIRMADA], to: Status.REGISTRADA_EN_SALUDSYSTEM12 },
});

export function allowedActions(status) {
  return Object.entries(TRANSITIONS).filter(([, t]) => t.from.includes(status)).map(([action]) => action);
}

/**
 * Reglas para el paciente que gestiona su cita desde el enlace privado.
 * Una solicitud PENDIENTE se mueve de horario y sigue PENDIENTE; las demás quedan REPROGRAMADA
 * para que Admisiones las reconfirme.
 */
export const PATIENT_TRANSITIONS = Object.freeze({
  REPROGRAMAR: {
    from: [Status.PENDIENTE, ...TRANSITIONS.REPROGRAMAR.from],
    to: (current) => (current === Status.PENDIENTE ? Status.PENDIENTE : Status.REPROGRAMADA),
  },
});
