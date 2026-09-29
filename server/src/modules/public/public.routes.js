import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../../config.js';
import { asyncHandler, parse } from '../../lib/errors.js';
import { createPublicRequest, lookupPublic } from '../appointments/appointments.service.js';

// Portal del paciente: sin sesión. Solo puede crear una solicitud y consultar la suya.
const router = Router();

const limiter = (limit) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes desde este equipo. Intente de nuevo en unos minutos.' },
});

const requestSchema = z.object({
  documentType: z.enum(['CC', 'TI', 'CE', 'PA', 'RC', 'PT']),
  documentNumber: z.string().trim().regex(/^[A-Za-z0-9]{3,20}$/, 'Número de documento inválido'),
  fullName: z.string().trim().min(5, 'Escriba nombre y apellido').max(120),
  phone: z.string().trim().regex(/^\+?\d{7,15}$/, 'Teléfono inválido (solo números)'),
  email: z.string().trim().email('Correo inválido').max(120).optional().or(z.literal('')),
  specialtyId: z.number().int().positive(),
  professionalId: z.number().int().positive().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  reason: z.string().trim().max(200).optional(),
  dataConsent: z.literal(true, { errorMap: () => ({ message: 'Debe aceptar el tratamiento de datos personales' }) }),
});

router.post('/requests', limiter(10), asyncHandler(async (req, res) => {
  const input = parse(requestSchema, req.body);
  const result = await createPublicRequest(req, { ...input, consentVersion: config.consentVersion });
  res.status(201).json(result);
}));

const lookupSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^SOL-\d{6}$/, 'Código con formato SOL-000000'),
  documentNumber: z.string().trim().regex(/^[A-Za-z0-9]{3,20}$/, 'Número de documento inválido'),
});

router.post('/requests/lookup', limiter(20), asyncHandler(async (req, res) => {
  res.json(await lookupPublic(req, parse(lookupSchema, req.body)));
}));

export default router;
