import { z } from 'zod';

// Validación compartida por el portal del paciente y por Admisiones.
export const documentType = z.enum(['CC', 'TI', 'CE', 'PA', 'RC', 'PT']);
export const documentNumber = z.string().trim().regex(/^[A-Za-z0-9]{3,20}$/, 'Número de documento inválido');

export const appointmentRequestFields = {
  documentType,
  documentNumber,
  fullName: z.string().trim().min(5, 'Escriba nombre y apellido').max(120),
  phone: z.string().trim().regex(/^\+?\d{7,15}$/, 'Teléfono inválido (solo números)'),
  email: z.string().trim().email('Correo inválido').max(120).optional().or(z.literal('')),
  specialtyId: z.number().int().positive(),
  professionalId: z.number().int().positive().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  reason: z.string().trim().max(200).optional(),
  dataConsent: z.literal(true, { errorMap: () => ({ message: 'Debe aceptar el tratamiento de datos personales' }) }),
};
