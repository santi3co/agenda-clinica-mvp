import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../../config.js';
import { asyncHandler, parse } from '../../lib/errors.js';
import { createPublicRequest, lookupPublic } from '../appointments/appointments.service.js';
import { appointmentRequestFields, documentNumber } from '../appointments/schemas.js';
import { cancelByLink, rescheduleByLink, viewByLink } from '../patient-links/patient-links.service.js';

// Portal del paciente: sin sesión. Solo puede crear una solicitud y consultar la suya.
const router = Router();

const limiter = (limit) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes desde este equipo. Intente de nuevo en unos minutos.' },
});

const requestSchema = z.object(appointmentRequestFields);

router.post('/requests', limiter(10), asyncHandler(async (req, res) => {
  const input = parse(requestSchema, req.body);
  const result = await createPublicRequest(req, { ...input, consentVersion: config.consentVersion });
  res.status(201).json(result);
}));

const lookupSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^SOL-\d{6}$/, 'Código con formato SOL-000000'),
  documentNumber,
});

router.post('/requests/lookup', limiter(20), asyncHandler(async (req, res) => {
  res.json(await lookupPublic(req, parse(lookupSchema, req.body)));
}));

// Enlace privado de gestión (/cita/<token>): cada petición exige token + documento del paciente.
const manageLimiter = limiter(30);
const manageAuth = {
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Enlace inválido'),
  documentNumber,
};

router.post('/manage/view', manageLimiter, asyncHandler(async (req, res) => {
  res.json(await viewByLink(req, parse(z.object(manageAuth), req.body)));
}));

router.post('/manage/cancel', manageLimiter, asyncHandler(async (req, res) => {
  const input = parse(z.object({
    ...manageAuth,
    reason: z.string().trim().min(3, 'Cuéntenos brevemente el motivo').max(150),
  }), req.body);
  res.json(await cancelByLink(req, input));
}));

router.post('/manage/reschedule', manageLimiter, asyncHandler(async (req, res) => {
  const input = parse(z.object({
    ...manageAuth,
    professionalId: z.number().int().positive().nullable().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
  }), req.body);
  res.json(await rescheduleByLink(req, input));
}));

export default router;
