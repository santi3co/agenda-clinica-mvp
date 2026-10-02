// Ejecuta en orden los archivos de migrations/ que aún no se han aplicado.
// Uso: npm run db:migrate            (aplica pendientes)
//      npm run db:migrate -- --reset (BORRA todas las tablas del prototipo y vuelve a crearlas)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

const PROTOTYPE_TABLES = [
  'appointment_access_links', 'notification_outbox', 'audit_logs', 'appointment_status_history', 'appointments', 'patients',
  'schedules', 'professionals', 'specialties', 'users', 'role_permissions', 'permissions', 'roles',
  'schema_migrations',
];

async function main() {
  if (process.argv.includes('--reset')) {
    if (process.env.NODE_ENV === 'production') throw new Error('--reset no está permitido en producción');
    console.log('Eliminando tablas del prototipo...');
    await pool.query(`DROP TABLE IF EXISTS ${PROTOTYPE_TABLES.join(', ')} CASCADE`);
    await pool.query('DROP SEQUENCE IF EXISTS appointment_code_seq');
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query('ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY');

  const applied = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`✔ ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Falló la migración ${file}: ${err.message}`);
    } finally {
      client.release();
    }
  }
  console.log('Migraciones al día.');
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
