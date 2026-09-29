/**
 * SaludSystem12 — adaptador MANUAL.
 *
 * No existe integración: no hay conexión a su base de datos ni se asume ninguna API.
 * El admisionista registra la cita directamente en SaludSystem12 y luego, en este sistema,
 * pulsa "Registrar en SaludSystem12" (opcionalmente digitando el número de cita que le dio
 * SaludSystem12). Este adaptador solo documenta ese hecho.
 *
 * Cuando INFOTEC confirme un mecanismo oficial (API, servicio web, archivo plano, HL7/FHIR, etc.),
 * se implementará aquí un adaptador automático con la misma interfaz `register(appointment)`,
 * sin cambiar el resto de la aplicación.
 */
export const saludSystem12 = {
  mode: 'MANUAL',
  async register(appointment, { externalRef } = {}) {
    return { mode: 'MANUAL', externalRef: externalRef || null, appointmentCode: appointment.code };
  },
};
