import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, errorText } from '../api.js';
import { ACTION_LABEL, addDays, fmtDate, fmtDateTime, fmtPlainDate, fmtTime, isoDate, STATUS } from '../format.js';
import { Alert, Field, Modal, Spinner, StatusBadge } from '../ui.jsx';
import { useAuth } from './StaffApp.jsx';
import { useCatalog } from './useCatalog.js';

export default function RequestDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { can } = useAuth();
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api(`/staff/appointments/${id}`).then(setA).catch((e) => setError(errorText(e)));
  }, [id]);
  useEffect(load, [load]);

  async function run(path, body, okMsg) {
    setBusy(true);
    setError('');
    try {
      const updated = await api(`/staff/appointments/${id}/${path}`, { method: 'POST', body });
      setA(updated);
      setModal(null);
      setNotice(okMsg);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyForSaludSystem() {
    const text = [
      `Solicitud: ${a.code}`,
      `Paciente: ${a.patientName}`,
      `Documento: ${a.documentType} ${a.documentNumber}`,
      `Teléfono: ${a.phone}`,
      a.email ? `Correo: ${a.email}` : null,
      `Especialidad: ${a.specialtyName}`,
      `Profesional: ${a.professionalName}`,
      `Fecha: ${fmtDate(a.startAt)}  Hora: ${fmtTime(a.startAt)}`,
    ].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Datos copiados al portapapeles.');
    } catch {
      setError('No se pudo copiar al portapapeles.');
    }
  }

  if (!a) return error ? <Alert>{error}</Alert> : <Spinner />;

  const manage = can('appointments:manage');
  const has = (action) => manage && a.allowedActions.includes(action);
  const registered = a.status === 'REGISTRADA_EN_SALUDSYSTEM12';

  return (
    <div className="detail">
      <Link to="/admisiones/solicitudes" className="back">← Solicitudes</Link>
      <div className="page-head">
        <div>
          <h1 className="mono">{a.code}</h1>
          <p className="muted">Recibida {fmtDateTime(a.createdAt)} · Canal: {a.channel === 'PORTAL' ? 'Portal web' : 'Admisiones'}</p>
        </div>
        <StatusBadge status={a.status} />
      </div>

      <Alert kind="success">{notice}</Alert>
      <Alert>{error}</Alert>

      {manage && a.allowedActions.length > 0 && (
        <div className="action-bar">
          {has('TOMAR') && <button className="btn" disabled={busy} onClick={() => run('take', {}, 'Solicitud tomada para gestión.')}>Tomar para gestión</button>}
          {has('CONFIRMAR') && <button className="btn btn-success" onClick={() => setModal('confirm')}>Confirmar cita</button>}
          {has('REGISTRAR_SALUDSYSTEM12') && <button className="btn btn-teal" onClick={() => setModal('register')}>Registrar en SaludSystem12</button>}
          {has('REPROGRAMAR') && <button className="btn btn-ghost" onClick={() => setModal('reschedule')}>Reprogramar</button>}
          {has('CANCELAR') && <button className="btn btn-danger-ghost" onClick={() => setModal('cancel')}>Cancelar</button>}
        </div>
      )}
      {a.status === 'PENDIENTE' && manage && (
        <p className="muted small">Tome la solicitud para indicar a sus compañeros que usted la está gestionando.</p>
      )}

      <div className="detail-grid">
        <section className="panel">
          <h2>Cita</h2>
          <dl className="summary">
            <dt>Especialidad</dt><dd>{a.specialtyName}</dd>
            <dt>Profesional</dt><dd>{a.professionalName}</dd>
            <dt>Fecha</dt><dd>{fmtDate(a.startAt)}</dd>
            <dt>Hora</dt><dd>{fmtTime(a.startAt)} – {fmtTime(a.endAt)}</dd>
            {a.reason && <><dt>Motivo</dt><dd>{a.reason}</dd></>}
            <dt>Responsable</dt><dd>{a.assignedUsername || <span className="muted">Sin asignar</span>}</dd>
            {a.saludsystemRegAt && <><dt>SaludSystem12</dt><dd>Registrada {fmtDateTime(a.saludsystemRegAt)}{a.saludsystemRef && <> · Nº <span className="mono">{a.saludsystemRef}</span></>}</dd></>}
            {a.cancelReason && <><dt>Motivo de cancelación</dt><dd>{a.cancelReason}</dd></>}
          </dl>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Paciente</h2>
            <button className="btn btn-ghost btn-sm" onClick={copyForSaludSystem} title="Copia los datos para digitarlos en SaludSystem12">Copiar datos</button>
          </div>
          <dl className="summary">
            <dt>Nombre</dt><dd>{a.patientName}</dd>
            <dt>Documento</dt><dd>{a.documentType} {a.documentNumber}</dd>
            <dt>Teléfono</dt><dd>{a.phone}</dd>
            <dt>Correo</dt><dd>{a.email || '—'}</dd>
          </dl>
        </section>

        <PatientLinkPanel appt={a} canManage={manage} initialPath={location.state?.managePath} onChanged={load} />

        <section className="panel span-2">
          <h2>Historial de la solicitud</h2>
          <ol className="timeline">
            {a.history.map((h) => (
              <li key={h.id} style={{ '--dot': STATUS[h.toStatus]?.color }}>
                <div className="tl-head">
                  <strong>{ACTION_LABEL[h.action] || h.action}</strong>
                  <time>{fmtDateTime(h.createdAt)}</time>
                </div>
                <div className="tl-body">
                  <span>{h.username ? <>Usuario: <strong>{h.username}</strong></> : 'Paciente'}</span>
                  <span>
                    {h.fromStatus && <><StatusBadge status={h.fromStatus} /> → </>}
                    <StatusBadge status={h.toStatus} />
                  </span>
                  {h.previousStartAt && (
                    <span>De {fmtDate(h.previousStartAt)} {fmtTime(h.previousStartAt)} a {fmtDate(h.newStartAt)} {fmtTime(h.newStartAt)}</span>
                  )}
                  {h.note && <span className="tl-note">“{h.note}”</span>}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel span-2">
          <h2>Notificaciones WhatsApp <small className="muted">(simuladas — no se envían)</small></h2>
          {a.notifications.length === 0 ? <p className="empty">Sin eventos.</p> : (
            <ul className="notif-list">
              {a.notifications.map((n) => (
                <li key={n.id}><span className="mono">{n.eventType}</span><span className="badge badge-gray">{n.status}</span><time>{fmtDateTime(n.createdAt)}</time></li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {modal === 'confirm' && <NoteModal title="Confirmar cita" label="Nota (opcional)" placeholder="Ej.: Confirmada con el paciente por llamada"
        confirmText="Confirmar cita" busy={busy} onClose={() => setModal(null)}
        onSubmit={(note) => run('confirm', { note }, 'Cita confirmada.')} />}

      {modal === 'cancel' && <NoteModal title="Cancelar cita" label="Motivo de la cancelación" required danger
        warning={registered ? 'Esta cita ya está registrada en SaludSystem12: recuerde cancelarla también allí.' : null}
        confirmText="Cancelar cita" busy={busy} onClose={() => setModal(null)}
        onSubmit={(reason) => run('cancel', { reason }, 'Cita cancelada. El horario quedó libre.')} />}

      {modal === 'register' && <RegisterModal appt={a} busy={busy} onClose={() => setModal(null)}
        onSubmit={(body) => run('register-saludsystem12', body, 'Registro en SaludSystem12 documentado.')} />}

      {modal === 'reschedule' && <RescheduleModal appt={a} busy={busy} registered={registered} onClose={() => setModal(null)}
        onSubmit={(body) => run('reschedule', body, 'Cita reprogramada. Debe confirmarse nuevamente con el paciente.')} />}
    </div>
  );
}

/**
 * Enlace privado para que el paciente gestione su cita. La BD solo guarda el hash del token,
 * así que el enlace se ve únicamente al generarlo (o justo después de crear la cita).
 */
function PatientLinkPanel({ appt, canManage, initialPath, onChanged }) {
  const [path, setPath] = useState(initialPath || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const active = appt.status !== 'CANCELADA' && new Date(appt.startAt) > new Date();
  const info = appt.patientLink;
  const firstName = appt.patientName.split(' ')[0];
  const message = path && [
    `Hola ${firstName}, le escribimos de Admisiones de la Clínica Salud Divina de la Costa.`,
    `Su cita de ${appt.specialtyName} es el ${fmtDate(appt.startAt)} a las ${fmtTime(appt.startAt)} con ${appt.professionalName}.`,
    `Puede ver, cambiar o cancelar su cita aquí: ${window.location.origin}${path}`,
    'Por seguridad le pediremos su número de documento.',
  ].join('\n');

  async function generate() {
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      setPath((await api(`/staff/appointments/${appt.id}/patient-link`, { method: 'POST' })).path);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setError('No se pudo copiar al portapapeles.');
    }
  }

  return (
    <section className="panel span-2">
      <div className="panel-head">
        <h2>Enlace para el paciente</h2>
        {canManage && active && (
          <button className="btn btn-ghost btn-sm" onClick={generate} disabled={busy}>
            {busy ? 'Generando…' : info ? 'Generar enlace nuevo' : 'Generar enlace'}
          </button>
        )}
      </div>
      <p className="muted small">
        {!active ? 'La cita está cancelada o ya pasó: el enlace ya no aplica.'
          : info ? <>Enlace vigente generado {fmtDateTime(info.createdAt)}{info.createdBy ? ` por ${info.createdBy}` : ' al crear la cita'}
            {' · '}{info.lastUsedAt ? `último uso del paciente: ${fmtDateTime(info.lastUsedAt)}` : 'el paciente aún no lo ha abierto'}.
            {!path && ' Por seguridad no se puede volver a mostrar: genere uno nuevo si necesita enviarlo (el anterior deja de funcionar).'}</>
            : 'Esta cita no tiene enlace vigente.'}
      </p>
      <Alert>{error}</Alert>
      {path && active && (
        <div className="link-box">
          <textarea readOnly rows={4} value={message} aria-label="Mensaje para el paciente" />
          <div className="row-actions">
            <button className="btn btn-sm" onClick={copy}>{copied ? '✓ Copiado' : 'Copiar mensaje para WhatsApp'}</button>
          </div>
        </div>
      )}
    </section>
  );
}

function NoteModal({ title, label, placeholder, required, danger, warning, confirmText, busy, onClose, onSubmit }) {
  const [note, setNote] = useState('');
  const valid = !required || note.trim().length >= 3;
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Volver</button>
      <button className={`btn ${danger ? 'btn-danger' : ''}`} disabled={busy || !valid} onClick={() => onSubmit(note.trim())}>{busy ? 'Guardando…' : confirmText}</button>
    </>}>
      {warning && <Alert kind="warning">{warning}</Alert>}
      <Field label={label} htmlFor="note">
        <textarea id="note" rows={3} maxLength={required ? 200 : 300} placeholder={placeholder} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

function RegisterModal({ appt, busy, onClose, onSubmit }) {
  const [externalRef, setExternalRef] = useState('');
  const [done, setDone] = useState(false);
  return (
    <Modal title="Registrar en SaludSystem12" onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Volver</button>
      <button className="btn btn-teal" disabled={busy || !done} onClick={() => onSubmit({ externalRef: externalRef.trim() })}>{busy ? 'Guardando…' : 'Marcar como registrada'}</button>
    </>}>
      <Alert kind="info">
        Este prototipo <strong>no se conecta</strong> a SaludSystem12. Registre la cita directamente en SaludSystem12 y luego
        márquela aquí: quedará constancia de quién lo hizo y cuándo.
      </Alert>
      <dl className="summary compact">
        <dt>Paciente</dt><dd>{appt.patientName} · {appt.documentType} {appt.documentNumber}</dd>
        <dt>Cita</dt><dd>{appt.specialtyName} · {appt.professionalName}</dd>
        <dt>Fecha</dt><dd>{fmtDate(appt.startAt)} {fmtTime(appt.startAt)}</dd>
      </dl>
      <Field label="Número de cita en SaludSystem12 (opcional)" htmlFor="ref">
        <input id="ref" maxLength={50} value={externalRef} onChange={(e) => setExternalRef(e.target.value)} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
        Confirmo que ya registré esta cita en SaludSystem12.
      </label>
    </Modal>
  );
}

function RescheduleModal({ appt, busy, registered, onClose, onSubmit }) {
  const { professionals } = useCatalog();
  const [professionalId, setProfessionalId] = useState(String(appt.professionalId));
  const [date, setDate] = useState(isoDate());
  const [slots, setSlots] = useState(null);
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setSlots(null);
    setTime('');
    setError('');
    api('/catalog/availability', { params: { specialtyId: appt.specialtyId, professionalId, date } })
      .then(setSlots)
      .catch((e) => { setSlots([]); setError(errorText(e)); });
  }, [professionalId, date, appt.specialtyId]);

  const options = professionals.filter((p) => p.specialtyId === appt.specialtyId);
  return (
    <Modal title="Reprogramar cita" onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Volver</button>
      <button className="btn" disabled={busy || !time} onClick={() => onSubmit({ professionalId: Number(professionalId), date, time, note: note.trim() })}>
        {busy ? 'Guardando…' : 'Reprogramar'}
      </button>
    </>}>
      {registered && <Alert kind="warning">Esta cita ya está registrada en SaludSystem12: recuerde actualizarla también allí.</Alert>}
      <p className="muted small">Actual: {fmtDate(appt.startAt)} {fmtTime(appt.startAt)} · {appt.professionalName}</p>
      <div className="form-grid">
        <Field label="Profesional" htmlFor="rp">
          <select id="rp" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
            {options.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
        </Field>
        <Field label="Fecha" htmlFor="rd">
          <input id="rd" type="date" min={isoDate()} max={addDays(isoDate(), 60)} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <p className="small muted">{fmtPlainDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <Alert>{error}</Alert>
      {!slots ? <Spinner /> : slots.length === 0 ? <p className="empty">Sin horarios libres ese día.</p> : (
        <div className="slot-grid compact">
          {slots.map((s) => (
            <button key={s.time} type="button" className={`slot ${time === s.time ? 'selected' : ''}`} onClick={() => setTime(s.time)}>{s.time}</button>
          ))}
        </div>
      )}
      <Field label="Nota (opcional)" htmlFor="rn">
        <input id="rn" maxLength={300} placeholder="Ej.: El paciente solicitó otra hora" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}
