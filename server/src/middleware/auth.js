import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { HttpError } from '../lib/errors.js';
import { audit } from '../modules/audit/audit.service.js';

export const SESSION_COOKIE = 'agenda_session';

export function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.env === 'production',
    maxAge: config.sessionHours * 3600 * 1000,
    path: '/api',
  });
}

export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/api' });
}

/**
 * Carga el usuario y sus permisos desde la BD en cada petición: si un administrador desactiva
 * a un usuario o cambia su rol, el efecto es inmediato.
 */
export async function loadUser(userId) {
  const { rows } = await query(
    `SELECT u.id, u.username, u.full_name, u.active, r.code AS role,
            COALESCE(array_agg(p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE u.id = $1
      GROUP BY u.id, r.code`,
    [userId],
  );
  return rows[0];
}

export async function requireAuth(req, _res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new HttpError(401, 'Sesión requerida');
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new HttpError(401, 'Sesión inválida o expirada');
    }
    const user = await loadUser(payload.sub);
    if (!user || !user.active) throw new HttpError(401, 'Usuario inactivo o inexistente');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** RBAC: exige que el usuario autenticado tenga el permiso indicado. */
export function requirePermission(permission) {
  return async (req, _res, next) => {
    if (req.user?.permissions.includes(permission)) return next();
    await audit(req, {
      action: 'ACCESO_DENEGADO', module: 'auth', result: 'DENEGADO',
      detail: { permission, method: req.method, path: req.originalUrl },
    });
    next(new HttpError(403, 'No tiene permisos para esta acción'));
  };
}
