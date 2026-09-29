import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { asyncHandler, parse, HttpError } from '../../lib/errors.js';
import { issueSession, clearSession, requireAuth, loadUser } from '../../middleware/auth.js';
import { audit } from '../audit/audit.service.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Intente de nuevo en unos minutos.' },
});

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(40),
  password: z.string().min(1).max(200),
});

// Hash ficticio para igualar el tiempo de respuesta cuando el usuario no existe.
const DUMMY_HASH = bcrypt.hashSync('usuario-inexistente', 12);

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { username, password } = parse(loginSchema, req.body);
  const { rows } = await query('SELECT id, password_hash, active FROM users WHERE username = $1', [username]);
  const record = rows[0];
  const ok = await bcrypt.compare(password, record?.password_hash ?? DUMMY_HASH);

  if (!record || !ok || !record.active) {
    await audit(req, {
      action: 'LOGIN', module: 'auth', entity: 'user', result: 'FALLO',
      detail: { username, motivo: record && !record.active ? 'usuario inactivo' : 'credenciales inválidas' },
    });
    throw new HttpError(401, 'Usuario o contraseña incorrectos');
  }

  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [record.id]);
  const user = await loadUser(record.id);
  req.user = user;
  issueSession(res, user);
  await audit(req, { action: 'LOGIN', module: 'auth', entity: 'user', entityId: user.id });
  res.json({ user });
}));

router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  await audit(req, { action: 'LOGOUT', module: 'auth', entity: 'user', entityId: req.user.id });
  clearSession(res);
  res.status(204).end();
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

export default router;
