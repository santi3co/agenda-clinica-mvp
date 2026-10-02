// Prueba de extremo a extremo del flujo principal contra la API real y la BD configurada.
// Requiere haber ejecutado `npm run db:reset` (crea datos ficticios). Uso: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { addDays, localDate } from '../src/lib/time.js';

let server;
let base;

before(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  server.close();
  await pool.end();
});

async function api(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

async function login(username, password) {
  const res = await api('/auth/login', { method: 'POST', body: { username, password } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.headers.get('set-cookie').split(';')[0];
}

/** Busca el primer día (desde mañana) con turnos libres para la especialidad. */
async function firstAvailable(specialtyId) {
  for (let i = 1; i <= 20; i++) {
    const date = addDays(localDate(), i);
    const res = await api(`/catalog/availability?specialtyId=${specialtyId}&date=${date}`);
    if (res.body.length) return { date, slots: res.body };
  }
  throw new Error('Sin disponibilidad');
}

test('flujo completo: portal → admisiones → SaludSystem12 → trazabilidad', async () => {
  // 1-9. El paciente consulta catálogo y disponibilidad y envía la solicitud
  const specialties = (await api('/catalog/specialties')).body;
  const mg = specialties.find((s) => s.name === 'Medicina General');
  const { date, slots } = await firstAvailable(mg.id);
  const slot = slots[0];

  const created = await api('/public/requests', {
    method: 'POST',
    body: {
      documentType: 'CC', documentNumber: '99100001', fullName: 'Paciente Prueba Automatizada',
      phone: '3009990001', email: 'prueba@ejemplo.test', specialtyId: mg.id, professionalId: slot.professionalId,
      date, time: slot.time, dataConsent: true,
    },
  });
  // 10. Se genera el número de solicitud
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.match(created.body.code, /^SOL-\d{6}$/);
  const code = created.body.code;

  // El mismo turno ya no puede tomarse
  const again = await api('/public/requests', {
    method: 'POST',
    body: {
      documentType: 'CC', documentNumber: '99100002', fullName: 'Otro Paciente Prueba', phone: '3009990002',
      specialtyId: mg.id, professionalId: slot.professionalId, date, time: slot.time, dataConsent: true,
    },
  });
  assert.equal(again.status, 409);

  // Consulta pública de estado: requiere documento correcto
  assert.equal((await api('/public/requests/lookup', { method: 'POST', body: { code, documentNumber: '12345' } })).status, 404);
  const lookup = await api('/public/requests/lookup', { method: 'POST', body: { code, documentNumber: '99100001' } });
  assert.equal(lookup.body.status, 'PENDIENTE');
  assert.equal(lookup.body.patientName, 'Paciente P. A.');

  // Sin sesión no se accede al panel
  assert.equal((await api('/staff/appointments')).status, 401);

  // 11-13. El admisionista inicia sesión y ve la solicitud
  const cookie = await login('admision01', 'Admision01*Demo');
  const list = await api(`/staff/appointments?q=${code}`, { cookie });
  assert.equal(list.body.items.length, 1);
  const id = list.body.items[0].id;

  // RBAC: el admisionista no puede administrar usuarios ni ver auditoría
  assert.equal((await api('/admin/users', { cookie })).status, 403);
  assert.equal((await api('/admin/audit-logs', { cookie })).status, 403);

  // Transición inválida: no se puede registrar en SaludSystem12 sin confirmar
  assert.equal((await api(`/staff/appointments/${id}/register-saludsystem12`, { method: 'POST', body: {}, cookie })).status, 409);

  // 14-15. Gestiona y confirma
  assert.equal((await api(`/staff/appointments/${id}/take`, { method: 'POST', body: {}, cookie })).body.status, 'EN_GESTION');
  assert.equal((await api(`/staff/appointments/${id}/confirm`, { method: 'POST', body: { note: 'Confirmada con el paciente' }, cookie })).body.status, 'CONFIRMADA');

  // 16. Aparece en el calendario
  const cal = await api(`/staff/calendar?from=${date}&to=${addDays(date, 1)}&specialtyId=${mg.id}`, { cookie });
  assert.ok(cal.body.some((e) => e.code === code && e.status === 'CONFIRMADA'));

  // 17-19. Registrar en SaludSystem12
  const reg = await api(`/staff/appointments/${id}/register-saludsystem12`, {
    method: 'POST', body: { externalRef: 'SS12-PRUEBA-1' }, cookie,
  });
  assert.equal(reg.body.status, 'REGISTRADA_EN_SALUDSYSTEM12');
  assert.equal(reg.body.saludsystemRef, 'SS12-PRUEBA-1');

  // 20. Historial completo y en orden
  const detail = await api(`/staff/appointments/${id}`, { cookie });
  assert.deepEqual(detail.body.history.map((h) => h.action), ['CREAR', 'TOMAR', 'CONFIRMAR', 'REGISTRAR_SALUDSYSTEM12']);
  assert.equal(detail.body.history[0].username, null); // creada por el paciente
  assert.ok(detail.body.history.slice(1).every((h) => h.username === 'admision01'));

  // Reprogramar y cancelar
  const other = slots.find((s) => s.time !== slot.time && s.professionalId === slot.professionalId);
  const resch = await api(`/staff/appointments/${id}/reschedule`, {
    method: 'POST', body: { professionalId: other.professionalId, date, time: other.time, note: 'Paciente pide otra hora' }, cookie,
  });
  assert.equal(resch.status, 200, JSON.stringify(resch.body));
  assert.equal(resch.body.status, 'REPROGRAMADA');
  const cancel = await api(`/staff/appointments/${id}/cancel`, { method: 'POST', body: { reason: 'Prueba automatizada' }, cookie });
  assert.equal(cancel.body.status, 'CANCELADA');

  // Auditoría visible para el administrador
  const adminCookie = await login('admin01', 'Admin01*Demo');
  const logs = await api(`/admin/audit-logs?q=${code}`, { cookie: adminCookie });
  const actions = logs.body.items.map((l) => l.action);
  for (const a of ['CREAR_SOLICITUD', 'TOMAR', 'CONFIRMAR', 'REGISTRAR_SALUDSYSTEM12', 'REPROGRAMAR', 'CANCELAR']) {
    assert.ok(actions.includes(a), `falta ${a} en auditoría`);
  }
});

test('Admisiones crea citas para pacientes que llaman o escriben', async () => {
  const specialties = (await api('/catalog/specialties')).body;
  const ped = specialties.find((s) => s.name === 'Pediatría');
  const mi = specialties.find((s) => s.name === 'Medicina Interna');
  const { date, slots } = await firstAvailable(ped.id);
  const patient = {
    documentType: 'CC', documentNumber: '99000005', fullName: 'Paciente Llamada Demo', phone: '3009990005',
    email: '', dataConsent: true,
  };
  const body = { ...patient, specialtyId: ped.id, professionalId: slots[0].professionalId, date, time: slots[0].time };

  // Sin sesión: 401
  assert.equal((await api('/staff/appointments', { method: 'POST', body })).status, 401);

  const cookie = await login('admision02', 'Admision02*Demo');

  // Búsqueda de paciente existente (ficticio del seed) y de uno inexistente
  const found = await api('/staff/patients/lookup?documentType=CC&documentNumber=99000005', { cookie });
  assert.equal(found.body.found, true);
  assert.equal((await api('/staff/patients/lookup?documentType=CC&documentNumber=99199999', { cookie })).body.found, false);

  // Sin autorización de datos: 400
  assert.equal((await api('/staff/appointments', { method: 'POST', body: { ...body, dataConsent: false }, cookie })).status, 400);

  // Por defecto queda CONFIRMADA, canal ADMISIONES, con el admisionista como responsable
  const created = await api('/staff/appointments', { method: 'POST', body: { ...body, note: 'Llamó a Admisiones' }, cookie });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.status, 'CONFIRMADA');
  const detail = await api(`/staff/appointments/${created.body.id}`, { cookie });
  assert.equal(detail.body.channel, 'ADMISIONES');
  assert.equal(detail.body.assignedUsername, 'admision02');
  assert.equal(detail.body.history[0].action, 'CREAR');
  assert.equal(detail.body.history[0].username, 'admision02');
  assert.equal(detail.body.history[0].note, 'Llamó a Admisiones');
  assert.deepEqual(detail.body.notifications.map((n) => n.eventType), ['CITA_CONFIRMADA']);
  assert.ok(detail.body.allowedActions.includes('REGISTRAR_SALUDSYSTEM12'));

  // El mismo turno no se puede volver a asignar
  assert.equal((await api('/staff/appointments', { method: 'POST', body, cookie })).status, 409);

  // confirmNow=false → EN_GESTION; especialidad con motivo obligatorio
  const mia = await firstAvailable(mi.id);
  const miBody = { ...patient, specialtyId: mi.id, date: mia.date, time: mia.slots[0].time, confirmNow: false };
  assert.equal((await api('/staff/appointments', { method: 'POST', body: miBody, cookie })).status, 400);
  const pending = await api('/staff/appointments', { method: 'POST', body: { ...miBody, reason: 'Control' }, cookie });
  assert.equal(pending.status, 201, JSON.stringify(pending.body));
  assert.equal(pending.body.status, 'EN_GESTION');

  // Auditoría
  const adminCookie = await login('admin01', 'Admin01*Demo');
  const logs = await api(`/admin/audit-logs?q=${created.body.code}`, { cookie: adminCookie });
  assert.ok(logs.body.items.some((l) => l.action === 'CREAR_CITA_ADMISIONES' && l.username === 'admision02'));
});

test('enlace privado: el paciente ve, reprograma y cancela su cita', async () => {
  const specialties = (await api('/catalog/specialties')).body;
  const orto = specialties.find((s) => s.name === 'Ortopedia');
  const { date, slots } = await firstAvailable(orto.id);
  const [first, second] = slots.filter((s) => s.professionalId === slots[0].professionalId);

  // Al crear la solicitud en el portal se entrega el enlace
  const created = await api('/public/requests', {
    method: 'POST',
    body: {
      documentType: 'CC', documentNumber: '99100003', fullName: 'Paciente Enlace Prueba', phone: '3009990003',
      specialtyId: orto.id, professionalId: first.professionalId, date, time: first.time, dataConsent: true,
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.match(created.body.managePath, /^\/cita\/[A-Za-z0-9_-]{43}$/);
  assert.equal(created.body.id, undefined); // el id interno no se expone
  const token = created.body.managePath.split('/').pop();
  const auth = { token, documentNumber: '99100003' };

  // Documento equivocado o token inexistente: mismo 404
  assert.equal((await api('/public/manage/view', { method: 'POST', body: { ...auth, documentNumber: '99100004' } })).status, 404);
  assert.equal((await api('/public/manage/view', { method: 'POST', body: { ...auth, token: 'x'.repeat(43) } })).status, 404);

  const view = await api('/public/manage/view', { method: 'POST', body: auth });
  assert.equal(view.status, 200, JSON.stringify(view.body));
  assert.equal(view.body.code, created.body.code);
  assert.equal(view.body.patientName, 'Paciente E. P.');
  assert.equal(view.body.canCancel, true);
  assert.equal(view.body.canReschedule, true);

  // Reprogramar una solicitud PENDIENTE: cambia de hora y sigue PENDIENTE
  const resch = await api('/public/manage/reschedule', {
    method: 'POST', body: { ...auth, professionalId: second.professionalId, date, time: second.time },
  });
  assert.equal(resch.status, 200, JSON.stringify(resch.body));
  assert.equal(resch.body.status, 'PENDIENTE');
  assert.equal(resch.body.time, second.time);

  // Admisiones ve el enlace vigente y puede regenerarlo: el anterior deja de funcionar
  const cookie = await login('admision01', 'Admision01*Demo');
  const id = (await api(`/staff/appointments?q=${created.body.code}`, { cookie })).body.items[0].id;
  const detail = await api(`/staff/appointments/${id}`, { cookie });
  assert.ok(detail.body.patientLink?.lastUsedAt);
  assert.equal(detail.body.history.at(-1).action, 'REPROGRAMAR');
  assert.equal(detail.body.history.at(-1).username, null); // lo hizo el paciente
  const regen = await api(`/staff/appointments/${id}/patient-link`, { method: 'POST', body: {}, cookie });
  assert.equal(regen.status, 200, JSON.stringify(regen.body));
  assert.equal((await api('/public/manage/view', { method: 'POST', body: auth })).status, 404);
  const auth2 = { token: regen.body.path.split('/').pop(), documentNumber: '99100003' };

  // Cancelar desde el nuevo enlace
  const cancel = await api('/public/manage/cancel', { method: 'POST', body: { ...auth2, reason: 'Ya no puedo asistir' } });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  assert.equal(cancel.body.status, 'CANCELADA');
  assert.equal(cancel.body.canCancel, false);
  assert.equal((await api('/public/manage/cancel', { method: 'POST', body: { ...auth2, reason: 'Otra vez' } })).status, 409);
  const after = await api(`/staff/appointments/${id}`, { cookie });
  assert.equal(after.body.cancelReason, 'Cancelada por el paciente: Ya no puedo asistir');
});

test('login con contraseña incorrecta queda auditado como FALLO', async () => {
  assert.equal((await api('/auth/login', { method: 'POST', body: { username: 'admision01', password: 'mala' } })).status, 401);
  const { rows } = await pool.query(
    "SELECT result FROM audit_logs WHERE action = 'LOGIN' AND detail->>'username' = 'admision01' ORDER BY id DESC LIMIT 1",
  );
  assert.equal(rows[0].result, 'FALLO');
});
