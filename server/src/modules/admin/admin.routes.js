import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { asyncHandler, parse, conflict, notFound, badRequest } from '../../lib/errors.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { audit } from '../audit/audit.service.js';

// Administración: exclusivo del rol ADMINISTRADOR (permisos users:manage y audit:read).
const router = Router();
router.use(requireAuth);

const password = z.string().min(10, 'La contraseña debe tener al menos 10 caracteres').max(100);

router.get('/roles', requirePermission('users:manage'), asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT r.id, r.code, r.name, COALESCE(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
       FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id LEFT JOIN permissions p ON p.id = rp.permission_id
      GROUP BY r.id ORDER BY r.id`,
  );
  res.json(rows);
}));

router.get('/users', requirePermission('users:manage'), asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.username, u.full_name AS "fullName", u.active, r.code AS role,
            u.last_login_at AS "lastLoginAt", u.created_at AS "createdAt"
       FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.username`,
  );
  res.json(rows);
}));

router.post('/users', requirePermission('users:manage'), asyncHandler(async (req, res) => {
  const body = parse(z.object({
    username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, 'Usuario: 3-40 caracteres a-z, 0-9, . _ -'),
    fullName: z.string().trim().min(3).max(120),
    role: z.enum(['ADMISIONISTA', 'ADMINISTRADOR']),
    password,
  }), req.body);
  const hash = await bcrypt.hash(body.password, 12);
  try {
    const { rows } = await query(
      `INSERT INTO users (username, full_name, password_hash, role_id)
       VALUES ($1, $2, $3, (SELECT id FROM roles WHERE code = $4)) RETURNING id`,
      [body.username, body.fullName, hash, body.role],
    );
    await audit(req, { action: 'CREAR_USUARIO', module: 'admin', entity: 'user', entityId: body.username, detail: { role: body.role } });
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') throw conflict('Ese nombre de usuario ya existe');
    throw err;
  }
}));

router.patch('/users/:id', requirePermission('users:manage'), asyncHandler(async (req, res) => {
  const { id } = parse(z.object({ id: z.coerce.number().int().positive() }), req.params);
  const body = parse(z.object({
    active: z.boolean().optional(),
    role: z.enum(['ADMISIONISTA', 'ADMINISTRADOR']).optional(),
    password: password.optional(),
  }), req.body);
  if (id === req.user.id && (body.active === false || (body.role && body.role !== req.user.role))) {
    throw badRequest('No puede desactivarse ni cambiar su propio rol');
  }
  const sets = [];
  const params = [id];
  if (body.active !== undefined) { params.push(body.active); sets.push(`active = $${params.length}`); }
  if (body.role) { params.push(body.role); sets.push(`role_id = (SELECT id FROM roles WHERE code = $${params.length})`); }
  if (body.password) { params.push(await bcrypt.hash(body.password, 12)); sets.push(`password_hash = $${params.length}`); }
  if (!sets.length) throw badRequest('Nada que actualizar');

  const { rows } = await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING username`, params);
  if (!rows[0]) throw notFound('Usuario no encontrado');
  await audit(req, {
    action: 'ACTUALIZAR_USUARIO', module: 'admin', entity: 'user', entityId: rows[0].username,
    detail: { active: body.active, role: body.role, passwordChanged: Boolean(body.password) },
  });
  res.json({ ok: true });
}));

router.get('/audit-logs', requirePermission('audit:read'), asyncHandler(async (req, res) => {
  const f = parse(z.object({
    q: z.string().trim().max(60).optional(),
    module: z.string().max(30).optional(),
    result: z.enum(['EXITO', 'FALLO', 'DENEGADO']).optional(),
    page: z.coerce.number().int().min(1).default(1),
  }), req.query);
  const pageSize = 50;
  const { rows } = await query(
    `SELECT id, username, action, module, entity, entity_id AS "entityId", result, ip, detail, created_at AS "createdAt",
            count(*) OVER()::int AS total
       FROM audit_logs
      WHERE ($1::text IS NULL OR username ILIKE $1 OR action ILIKE $1 OR entity_id ILIKE $1)
        AND ($2::text IS NULL OR module = $2) AND ($3::text IS NULL OR result = $3)
      ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5`,
    [f.q ? `%${f.q}%` : null, f.module || null, f.result || null, pageSize, (f.page - 1) * pageSize],
  );
  res.json({ items: rows, total: rows[0]?.total ?? 0, page: f.page, pageSize });
}));

export default router;
