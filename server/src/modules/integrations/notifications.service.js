/**
 * Preparación para la futura integración con WhatsApp — NO ENVÍA MENSAJES.
 *
 * Cada evento relevante de una cita se guarda en `notification_outbox` con estado SIMULADO.
 * Cuando exista una integración oficial (WhatsApp Business Platform / proveedor BSP aprobado),
 * un proceso independiente leerá los registros PENDIENTE, enviará la plantilla aprobada y
 * actualizará el estado a ENVIADO/FALLIDO. El resto del sistema no necesita cambiar.
 */
export const NotificationEvent = Object.freeze({
  SOLICITUD_RECIBIDA: 'SOLICITUD_RECIBIDA',
  CITA_CONFIRMADA: 'CITA_CONFIRMADA',
  CITA_REPROGRAMADA: 'CITA_REPROGRAMADA',
  CITA_CANCELADA: 'CITA_CANCELADA',
});

export async function enqueueNotification(db, { appointmentId, eventType, payload }) {
  await db.query(
    `INSERT INTO notification_outbox (appointment_id, channel, event_type, payload, status)
     VALUES ($1, 'WHATSAPP', $2, $3, 'SIMULADO')`,
    [appointmentId, eventType, JSON.stringify(payload)],
  );
}
