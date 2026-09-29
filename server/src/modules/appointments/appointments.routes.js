import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse } from '../../lib/errors.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { audit } from '../audit/audit.service.js';
import * as svc from './appointments.service.js';
import { Status } from './status.js';

// Panel de Admisiones. Todas las rutas exigen sesión de personal + permiso.
const router = Router();
router.use(requireAuth);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const statusList = z
  .string()
  .transform((s) => s.split(',').filter(Boolean))
  .pipe(z.array(z.enum(Object.values(Status))))
  .optional();
const idParam = z.object({ id: z.coerce.number().int().positive() });
const optionalNote = z.string().trim().max(300).optional().transform((v) => v || null);

router.get('/dashboard', requirePermission('appointments:read'), asyncHandler(async (_req, res) => {
  res.json(await svc.dashboard());
}));

router.get('/calendar', requirePermission('calendar:read'), asyncHandler(async (req, res) => {
  const filters = parse(z.object({
    from: z.string().datetime({ offset: true }).or(dateStr),
    to: z.string().datetime({ offset: true }).or(dateStr),
    specialtyId: z.coerce.number().int().positive().optional(),
    professionalId: z.coerce.number().int().positive().optional(),
    status: statusList,
  }), req.query);
  res.json(await svc.calendarEvents(filters));
}));

router.get('/appointments', requirePermission('appointments:read'), asyncHandler(async (req, res) => {
  const filters = parse(z.object({
    q: z.string().trim().max(60).optional(),
    status: statusList,
    specialtyId: z.coerce.number().int().positive().optional(),
    professionalId: z.coerce.number().int().positive().optional(),
    dateFrom: dateStr.optional(),
    dateTo: dateStr.optional(),
    sort: z.enum(['created', 'start']).default('created'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(5).max(100).default(20),
  }), req.query);
  res.json(await svc.listAppointments(filters));
}));

router.get('/appointments/:id', requirePermission('appointments:read'), asyncHandler(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const detail = await svc.getAppointmentDetail(id);
  // Se audita la consulta de datos personales del paciente.
  await audit(req, { action: 'VER_DETALLE', module: 'appointments', entity: 'appointment', entityId: detail.code });
  res.json(detail);
}));

const manage = requirePermission('appointments:manage');

router.post('/appointments/:id/take', manage, asyncHandler(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { note } = parse(z.object({ note: optionalNote }), req.body ?? {});
  res.json(await svc.takeAppointment(req, id, { note }));
}));

router.post('/appointments/:id/confirm', manage, asyncHandler(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { note } = parse(z.object({ note: optionalNote }), req.body ?? {});
  res.json(await svc.confirmAppointment(req, id, { note }));
}));

router.post('/appointments/:id/reschedule', manage, asyncHandler(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const body = parse(z.object({
    professionalId: z.coerce.number().int().positive(),
    date: dateStr,
    time: z.string().regex(/^\d{2}:\d{2}$/),
    note: optionalNote,
  }), req.body);
  res.json(await svc.rescheduleAppointment(req, id, body));
}));

router.post('/appointments/:id/cancel', manage, asyncHandler(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { reason } = parse(z.object({
    reason: z.string().trim().min(3, 'Indique el motivo de la cancelación').max(200),
  }), req.body);
  res.json(await svc.cancelAppointment(req, id, { reason }));
}));

router.post('/appointments/:id/register-saludsystem12', manage, asyncHandler(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const body = parse(z.object({
    externalRef: z.string().trim().max(50).optional().transform((v) => v || null),
    note: optionalNote,
  }), req.body ?? {});
  res.json(await svc.registerInSaludSystem12(req, id, body));
}));

export default router;
