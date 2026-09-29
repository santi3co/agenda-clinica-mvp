import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { asyncHandler, parse } from '../../lib/errors.js';
import { assertBookableDate, getAvailability } from './availability.service.js';

// Catálogo público: especialidades, profesionales y disponibilidad. Sin datos personales.
const router = Router();

router.get('/specialties', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT id, name, slot_minutes AS "slotMinutes", requires_reason AS "requiresReason"
       FROM specialties WHERE active ORDER BY name`,
  );
  res.json(rows);
}));

router.get('/professionals', asyncHandler(async (req, res) => {
  const { specialtyId } = parse(z.object({ specialtyId: z.coerce.number().int().positive().optional() }), req.query);
  const { rows } = await query(
    `SELECT id, full_name AS "fullName", specialty_id AS "specialtyId"
       FROM professionals WHERE active AND ($1::int IS NULL OR specialty_id = $1) ORDER BY full_name`,
    [specialtyId ?? null],
  );
  res.json(rows);
}));

const availabilitySchema = z.object({
  specialtyId: z.coerce.number().int().positive(),
  professionalId: z.coerce.number().int().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha AAAA-MM-DD'),
});

router.get('/availability', asyncHandler(async (req, res) => {
  const params = parse(availabilitySchema, req.query);
  assertBookableDate(params.date);
  res.json(await getAvailability(params));
}));

export default router;
