import fs from 'node:fs';

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta la variable de entorno ${name}. Copie server/.env.example como server/.env.`);
    process.exit(1);
  }
  return value;
}

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32 || jwtSecret.startsWith('cambiar')) {
  console.error('JWT_SECRET debe ser un valor aleatorio de al menos 32 caracteres.');
  process.exit(1);
}

function sslConfig() {
  if (process.env.DB_SSL === 'disable') return false;
  if (process.env.DB_SSL_CA) return { ca: fs.readFileSync(process.env.DB_SSL_CA, 'utf8') };
  // Sin CA: cifrado pero sin validar el certificado del servidor. Aceptable solo para el prototipo.
  return { rejectUnauthorized: false };
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:5173',
  databaseUrl: required('DATABASE_URL'),
  dbSsl: sslConfig(),
  jwtSecret,
  sessionHours: 8,
  timezone: 'America/Bogota',
  tzOffset: '-05:00', // Colombia no tiene horario de verano
  bookingWindowDays: 60,
  maxActiveRequestsPerPatient: 3,
  consentVersion: 'v0.1-prototipo',
};
