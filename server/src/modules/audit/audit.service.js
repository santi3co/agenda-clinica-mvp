import { query } from '../../db/pool.js';

/**
 * Registra un evento de auditoría: usuario, acción, módulo, registro afectado, resultado, IP.
 * Si se pasa `db` (cliente de transacción), el registro queda dentro de la misma transacción.
 * Un fallo al auditar fuera de transacción se reporta en consola pero no interrumpe la petición.
 */
export async function audit(req, { action, module, entity = null, entityId = null, result = 'EXITO', detail = null }, db) {
  const user = req?.user;
  const params = [
    user?.id ?? null,
    user?.username ?? null,
    action,
    module,
    entity,
    entityId == null ? null : String(entityId),
    result,
    req?.ip ?? null,
    detail ? JSON.stringify(detail) : null,
  ];
  const sql = `INSERT INTO audit_logs (user_id, username, action, module, entity, entity_id, result, ip, detail)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`;
  if (db) return db.query(sql, params);
  try {
    await query(sql, params);
  } catch (err) {
    console.error('No se pudo registrar auditoría:', err.message);
  }
}
