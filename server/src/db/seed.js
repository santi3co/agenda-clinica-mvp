// Datos de prueba 100% FICTICIOS. Borra y vuelve a cargar todas las tablas del prototipo.
// Uso: npm run db:seed
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { addDays, isoWeekday, localDate, minutesToTime, timeToMinutes, toInstant } from '../lib/time.js';

if (process.env.NODE_ENV === 'production') {
  console.error('El seed de datos ficticios no se ejecuta en producción.');
  process.exit(1);
}

// Generador pseudoaleatorio determinístico: mismo resultado en cada ejecución.
let s = 20260929;
const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));

const PERMISSIONS = [
  ['appointments:read', 'Ver solicitudes y citas'],
  ['appointments:manage', 'Gestionar solicitudes (tomar, confirmar, reprogramar, cancelar, registrar)'],
  ['calendar:read', 'Ver calendario y disponibilidad'],
  ['users:manage', 'Administrar usuarios del personal'],
  ['audit:read', 'Consultar el registro de auditoría'],
];
const ROLE_PERMS = {
  ADMISIONISTA: ['appointments:read', 'appointments:manage', 'calendar:read'],
  ADMINISTRADOR: PERMISSIONS.map(([code]) => code),
};

export const DEV_USERS = [
  { username: 'admision01', fullName: 'Admisionista Demo Uno', role: 'ADMISIONISTA', password: 'Admision01*Demo' },
  { username: 'admision02', fullName: 'Admisionista Demo Dos', role: 'ADMISIONISTA', password: 'Admision02*Demo' },
  { username: 'admin01', fullName: 'Administrador Demo', role: 'ADMINISTRADOR', password: 'Admin01*Demo' },
];

const SPECIALTIES = [
  { code: 'MG', name: 'Medicina General', slot: 20, reason: false },
  { code: 'PED', name: 'Pediatría', slot: 20, reason: false },
  { code: 'GIN', name: 'Ginecología', slot: 30, reason: false },
  { code: 'MI', name: 'Medicina Interna', slot: 30, reason: true },
  { code: 'ORT', name: 'Ortopedia', slot: 20, reason: false },
];

// weekday ISO: 1 = lunes. Bloques [día, inicio, fin].
const PROFESSIONALS = [
  { name: 'Dra. Elena Demo Salinas', sp: 'MG', blocks: [[1, '07:00', '12:00'], [2, '07:00', '12:00'], [3, '07:00', '12:00'], [4, '07:00', '12:00'], [5, '07:00', '12:00']] },
  { name: 'Dr. Andrés Demo Coral', sp: 'MG', blocks: [[1, '14:00', '18:00'], [2, '14:00', '18:00'], [3, '14:00', '18:00'], [4, '14:00', '18:00'], [5, '14:00', '18:00'], [6, '08:00', '12:00']] },
  { name: 'Dra. Sofía Demo Marea', sp: 'PED', blocks: [[1, '08:00', '12:00'], [3, '08:00', '12:00'], [5, '08:00', '12:00']] },
  { name: 'Dr. Tomás Demo Arena', sp: 'PED', blocks: [[2, '14:00', '17:00'], [4, '14:00', '17:00'], [6, '08:00', '11:00']] },
  { name: 'Dra. Valeria Demo Brisa', sp: 'GIN', blocks: [[1, '14:00', '17:00'], [2, '08:00', '12:00'], [4, '08:00', '12:00']] },
  { name: 'Dr. Julián Demo Faro', sp: 'MI', blocks: [[1, '08:00', '12:00'], [3, '14:00', '17:00'], [5, '08:00', '12:00']] },
  { name: 'Dra. Camila Demo Puerto', sp: 'MI', blocks: [[2, '08:00', '12:00'], [4, '14:00', '17:00']] },
  { name: 'Dr. Mateo Demo Muelle', sp: 'ORT', blocks: [[2, '14:00', '18:00'], [3, '08:00', '12:00'], [5, '14:00', '18:00']] },
];

const FIRST = ['Ana', 'Luis', 'María', 'Jorge', 'Paula', 'Diego', 'Lucía', 'Pedro', 'Carmen', 'Óscar',
  'Rosa', 'Felipe', 'Diana', 'Sergio', 'Marta', 'Iván', 'Clara', 'Hugo', 'Elsa', 'Raúl'];
const LAST = ['Prueba', 'Ejemplo', 'Ficticio', 'Simulado', 'Muestra'];

const PATIENTS = FIRST.map((first, i) => ({
  documentType: i === 3 ? 'TI' : i === 11 ? 'CE' : 'CC',
  documentNumber: String(99000001 + i),                     // rango ficticio
  fullName: `${first} ${LAST[i % LAST.length]} Demo`,
  phone: `300000${String(i + 1).padStart(4, '0')}`,          // teléfono ficticio
  email: `paciente${String(i + 1).padStart(2, '0')}@ejemplo.test`, // dominio reservado .test
}));

const STATUS_PATHS = {
  PENDIENTE: ['CREAR'],
  EN_GESTION: ['CREAR', 'TOMAR'],
  CONFIRMADA: ['CREAR', 'TOMAR', 'CONFIRMAR'],
  REGISTRADA_EN_SALUDSYSTEM12: ['CREAR', 'TOMAR', 'CONFIRMAR', 'REGISTRAR_SALUDSYSTEM12'],
  REPROGRAMADA: ['CREAR', 'TOMAR', 'CONFIRMAR', 'REPROGRAMAR'],
  CANCELADA: ['CREAR', 'TOMAR', 'CANCELAR'],
};
const TO_STATUS = {
  CREAR: 'PENDIENTE', TOMAR: 'EN_GESTION', CONFIRMAR: 'CONFIRMADA',
  REGISTRAR_SALUDSYSTEM12: 'REGISTRADA_EN_SALUDSYSTEM12', REPROGRAMAR: 'REPROGRAMADA', CANCELAR: 'CANCELADA',
};

function statusFor(dayOffset) {
  if (dayOffset < 0) return pick(['REGISTRADA_EN_SALUDSYSTEM12', 'REGISTRADA_EN_SALUDSYSTEM12', 'REGISTRADA_EN_SALUDSYSTEM12', 'CANCELADA']);
  if (dayOffset <= 1) return pick(['REGISTRADA_EN_SALUDSYSTEM12', 'REGISTRADA_EN_SALUDSYSTEM12', 'CONFIRMADA', 'EN_GESTION', 'PENDIENTE']);
  return pick(['PENDIENTE', 'PENDIENTE', 'EN_GESTION', 'CONFIRMADA', 'REGISTRADA_EN_SALUDSYSTEM12', 'REPROGRAMADA', 'CANCELADA']);
}

async function main() {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(`TRUNCATE notification_outbox, audit_logs, appointment_status_history, appointments, patients,
                    schedules, professionals, specialties, users, role_permissions, permissions, roles RESTART IDENTITY CASCADE`);
    await db.query('ALTER SEQUENCE appointment_code_seq RESTART WITH 1');

    // RBAC
    for (const [code, description] of PERMISSIONS) {
      await db.query('INSERT INTO permissions (code, description) VALUES ($1,$2)', [code, description]);
    }
    for (const [code, name] of [['ADMISIONISTA', 'Admisionista'], ['ADMINISTRADOR', 'Administrador']]) {
      await db.query('INSERT INTO roles (code, name) VALUES ($1,$2)', [code, name]);
      await db.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM roles r, permissions p WHERE r.code = $1 AND p.code = ANY($2)`,
        [code, ROLE_PERMS[code]],
      );
    }
    const userIds = {};
    for (const u of DEV_USERS) {
      const { rows } = await db.query(
        `INSERT INTO users (username, full_name, password_hash, role_id)
         VALUES ($1,$2,$3,(SELECT id FROM roles WHERE code = $4)) RETURNING id`,
        [u.username, u.fullName, await bcrypt.hash(u.password, 12), u.role],
      );
      userIds[u.username] = rows[0].id;
    }
    const admisionistas = [userIds.admision01, userIds.admision02];

    // Catálogo
    const spIds = {};
    for (const sp of SPECIALTIES) {
      const { rows } = await db.query(
        'INSERT INTO specialties (code, name, slot_minutes, requires_reason) VALUES ($1,$2,$3,$4) RETURNING id',
        [sp.code, sp.name, sp.slot, sp.reason],
      );
      spIds[sp.code] = { id: rows[0].id, slot: sp.slot };
    }
    const profs = [];
    for (const p of PROFESSIONALS) {
      const { rows } = await db.query(
        'INSERT INTO professionals (full_name, specialty_id) VALUES ($1,$2) RETURNING id',
        [p.name, spIds[p.sp].id],
      );
      for (const [weekday, start, end] of p.blocks) {
        await db.query(
          'INSERT INTO schedules (professional_id, weekday, start_time, end_time) VALUES ($1,$2,$3,$4)',
          [rows[0].id, weekday, start, end],
        );
      }
      profs.push({ ...p, id: rows[0].id, specialtyId: spIds[p.sp].id, slot: spIds[p.sp].slot });
    }

    // Pacientes
    const patientIds = [];
    for (const p of PATIENTS) {
      const { rows } = await db.query(
        `INSERT INTO patients (document_type, document_number, full_name, phone, email, data_consent_at, consent_version, created_at)
         VALUES ($1,$2,$3,$4,$5, now() - interval '20 days', 'v0.1-prototipo', now() - interval '20 days') RETURNING id`,
        [p.documentType, p.documentNumber, p.fullName, p.phone, p.email],
      );
      patientIds.push(rows[0].id);
    }

    // Citas en distintos estados, desde hace 5 días hasta dentro de 14 días
    const today = localDate();
    const used = new Set();
    const now = Date.now();
    const randomSlot = (prof, date) => {
      const blocks = prof.blocks.filter(([wd]) => wd === isoWeekday(date));
      if (!blocks.length) return null;
      const [, start, end] = pick(blocks);
      const n = Math.floor((timeToMinutes(end) - timeToMinutes(start)) / prof.slot);
      const time = minutesToTime(timeToMinutes(start) + between(0, n - 1) * prof.slot);
      const key = `${prof.id}|${date}|${time}`;
      if (used.has(key)) return null;
      used.add(key);
      return toInstant(date, time);
    };

    let created = 0;
    let guard = 0;
    while (created < 42 && guard++ < 1000) {
      const dayOffset = between(-5, 14);
      const date = addDays(today, dayOffset);
      const prof = pick(profs);
      const start = randomSlot(prof, date);
      if (!start) continue;
      let status = statusFor(dayOffset);
      if (start.getTime() <= now && !['REGISTRADA_EN_SALUDSYSTEM12', 'CANCELADA'].includes(status)) {
        status = 'REGISTRADA_EN_SALUDSYSTEM12';
      }
      const patientId = patientIds[created % patientIds.length];
      const responsible = pick(admisionistas);
      const end = new Date(start.getTime() + prof.slot * 60_000);

      // Línea de tiempo de la solicitud: creada 1-6 días antes de la cita (y siempre en el pasado)
      let t = Math.min(start.getTime() - between(1, 6) * 86_400_000, now - between(2, 30) * 3_600_000);
      t -= between(0, 300) * 60_000;
      const steps = [];
      let previousStart = null;
      for (const action of STATUS_PATHS[status]) {
        if (action !== 'CREAR') t += between(5, 45) * 60_000;
        steps.push({ action, at: new Date(Math.min(t, now - 60_000)) });
      }
      if (status === 'REPROGRAMADA') previousStart = new Date(start.getTime() - 86_400_000);

      const { rows } = await db.query(
        `INSERT INTO appointments (patient_id, specialty_id, professional_id, start_at, end_at, status, channel,
           assigned_to, saludsystem_ref, saludsystem_reg_at, saludsystem_reg_by, cancel_reason, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'PORTAL',$7,$8,$9,$10,$11,$12,$13) RETURNING id, code`,
        [
          patientId, prof.specialtyId, prof.id, start, end, status,
          status === 'PENDIENTE' ? null : responsible,
          status === 'REGISTRADA_EN_SALUDSYSTEM12' ? `SS12-DEMO-${String(created + 1).padStart(4, '0')}` : null,
          status === 'REGISTRADA_EN_SALUDSYSTEM12' ? steps.at(-1).at : null,
          status === 'REGISTRADA_EN_SALUDSYSTEM12' ? responsible : null,
          status === 'CANCELADA' ? 'Paciente informa por WhatsApp que no puede asistir (dato ficticio)' : null,
          steps[0].at, steps.at(-1).at,
        ],
      );
      const appt = rows[0];
      let from = null;
      for (const step of steps) {
        const to = TO_STATUS[step.action];
        await db.query(
          `INSERT INTO appointment_status_history
             (appointment_id, action, from_status, to_status, changed_by, note, previous_start_at, new_start_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [appt.id, step.action, from, to, step.action === 'CREAR' ? null : responsible,
            step.action === 'CREAR' ? 'Solicitud creada por el paciente desde el portal' : null,
            step.action === 'REPROGRAMAR' ? previousStart : null,
            step.action === 'REPROGRAMAR' ? start : null,
            step.at],
        );
        if (['CONFIRMAR', 'REPROGRAMAR', 'CANCELAR'].includes(step.action)) {
          const eventType = { CONFIRMAR: 'CITA_CONFIRMADA', REPROGRAMAR: 'CITA_REPROGRAMADA', CANCELAR: 'CITA_CANCELADA' }[step.action];
          await db.query(
            `INSERT INTO notification_outbox (appointment_id, event_type, payload, created_at) VALUES ($1,$2,$3,$4)`,
            [appt.id, eventType, JSON.stringify({ code: appt.code }), step.at],
          );
        }
        from = to;
      }
      created++;
    }

    await db.query(
      `INSERT INTO audit_logs (action, module, result, detail) VALUES ('CARGA_DATOS_FICTICIOS', 'sistema', 'EXITO', $1)`,
      [JSON.stringify({ citas: created, pacientes: PATIENTS.length, profesionales: PROFESSIONALS.length })],
    );
    await db.query('COMMIT');

    console.log(`✔ Datos ficticios cargados: ${SPECIALTIES.length} especialidades, ${PROFESSIONALS.length} profesionales, `
      + `${PATIENTS.length} pacientes, ${created} citas.`);
    console.log('\nUsuarios de desarrollo (solo para el prototipo):');
    for (const u of DEV_USERS) console.log(`  ${u.role.padEnd(14)} ${u.username.padEnd(12)} ${u.password}`);
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Error cargando datos:', err.message);
    process.exitCode = 1;
  } finally {
    db.release();
    await pool.end();
  }
}

main();
