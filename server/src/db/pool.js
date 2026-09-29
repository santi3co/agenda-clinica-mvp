import pg from 'pg';
import { config } from '../config.js';

// DATE/TIME se devuelven como texto para no aplicar conversiones de zona horaria implícitas.
pg.types.setTypeParser(1082, (v) => v); // date
pg.types.setTypeParser(1083, (v) => v); // time

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.dbSsl,
  max: Number(process.env.DB_POOL_MAX || 5),
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => console.error('Error inesperado en el pool de PostgreSQL:', err.message));

export function query(text, params) {
  return pool.query(text, params);
}

/** Ejecuta fn(client) dentro de una transacción. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
