import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorText } from '../api.js';
import { addDays, fmtPlainDate, isoDate } from '../format.js';
import { Alert, Field, Spinner, StatusBadge } from '../ui.jsx';
import { EXPLAIN } from './StatusLookup.jsx';

const DAYS_SHOWN = 21;

/** Enlace privado /cita/<token>: el paciente ve, reprograma o cancela su cita. */
export default function ManageAppointment() {
  const { token } = useParams();
  const [documentNumber, setDocumentNumber] = useState('');
  const [appt, setAppt] = useState(null);
  const [mode, setMode] = useState(null); // null | 'reschedule' | 'cancel'
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const auth = { token, documentNumber: documentNumber.trim() };

  async function call(path, body, okMsg) {
    setBusy(true);
    setError('');
    try {
      setAppt(await api(`/public/manage/${path}`, { method: 'POST', body: { ...auth, ...body } }));
      setMode(null);
      setNotice(okMsg);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!appt) {
    return (
      <section className="card narrow">
        <h1>Gestionar mi cita</h1>
        <p className="muted">Por seguridad, escriba el número de documento del paciente.</p>
        <form onSubmit={(e) => { e.preventDefault(); call('view', {}, ''); }}>
          <Field label="Número de documento" htmlFor="doc">
            <input id="doc" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} inputMode="numeric" autoComplete="off" />
          </Field>
          <button className="btn btn-block" disabled={busy || !documentNumber.trim()}>{busy ? 'Verificando…' : 'Continuar'}</button>
        </form>
        <Alert>{error}</Alert>
      </section>
    );
  }

  return (
    <section className="card narrow manage">
      <div className="lookup-head">
        <h1>Mi cita <span className="mono">{appt.code}</span></h1>
        <StatusBadge status={appt.status} />
      </div>
      <Alert kind="success">{notice}</Alert>
      <Alert>{error}</Alert>
      <p>{EXPLAIN[appt.status]}</p>
      <dl className="summary">
        <dt>Paciente</dt><dd>{appt.patientName}</dd>
        <dt>Especialidad</dt><dd>{appt.specialty}</dd>
        <dt>Profesional</dt><dd>{appt.professional}</dd>
        <dt>Fecha</dt><dd>{fmtPlainDate(appt.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</dd>
        <dt>Hora</dt><dd>{appt.time}</dd>
      </dl>

      {appt.tooLate && (
        <Alert kind="info">
          Faltan menos de {appt.minHours} horas para su cita. Si necesita cambiarla, escríbale a Admisiones por WhatsApp.
        </Alert>
      )}

      {!mode && (appt.canReschedule || appt.canCancel) && (
        <div className="row-actions">
          {appt.canReschedule && <button className="btn" onClick={() => { setMode('reschedule'); setNotice(''); }}>Cambiar fecha u hora</button>}
          {appt.canCancel && <button className="btn btn-danger-ghost" onClick={() => { setMode('cancel'); setNotice(''); }}>Cancelar cita</button>}
        </div>
      )}

      {mode === 'reschedule' && (
        <Reschedule appt={appt} busy={busy} onBack={() => setMode(null)}
          onSubmit={(body) => call('reschedule', body, 'Su cita cambió de horario. Admisiones se lo confirmará pronto.')} />
      )}

      {mode === 'cancel' && (
        <CancelForm busy={busy} onBack={() => setMode(null)}
          onSubmit={(reason) => call('cancel', { reason }, 'Su cita fue cancelada y el horario quedó libre para otro paciente.')} />
      )}

      {appt.status === 'CANCELADA' && (
        <div className="row-actions"><Link className="btn" to="/agendar">Solicitar una nueva cita</Link></div>
      )}
    </section>
  );
}

function Reschedule({ appt, busy, onBack, onSubmit }) {
  const [professionals, setProfessionals] = useState([]);
  const [professionalId, setProfessionalId] = useState(String(appt.professionalId));
  const [date, setDate] = useState(null);
  const [slots, setSlots] = useState(null);
  const [time, setTime] = useState('');
  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(isoDate(), i)), []);

  useEffect(() => {
    api('/catalog/professionals', { params: { specialtyId: appt.specialtyId } }).then(setProfessionals).catch(() => {});
  }, [appt.specialtyId]);

  useEffect(() => {
    if (!date) return;
    setSlots(null);
    setTime('');
    api('/catalog/availability', { params: { specialtyId: appt.specialtyId, professionalId, date } })
      .then(setSlots)
      .catch(() => setSlots([]));
  }, [date, professionalId, appt.specialtyId]);

  // Con "cualquier profesional" se muestra cada hora una sola vez.
  const visible = useMemo(() => {
    if (!slots || professionalId) return slots;
    return [...new Map(slots.map((s) => [s.time, s])).values()];
  }, [slots, professionalId]);

  return (
    <div className="manage-panel">
      <h2>Elija el nuevo horario</h2>
      <Field label="Profesional" htmlFor="mp">
        <select id="mp" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
          <option value="">Cualquier profesional disponible</option>
          {professionals.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
        </select>
      </Field>
      <div className="day-strip" role="listbox" aria-label="Días">
        {days.map((d) => (
          <button key={d} type="button" role="option" aria-selected={d === date}
            className={`day ${d === date ? 'selected' : ''}`} onClick={() => setDate(d)}>
            <small>{fmtPlainDate(d, { weekday: 'short' })}</small>
            <strong>{fmtPlainDate(d, { day: 'numeric' })}</strong>
            <small>{fmtPlainDate(d, { month: 'short' })}</small>
          </button>
        ))}
      </div>
      {!date && <p className="muted center">Seleccione un día para ver los horarios.</p>}
      {date && !visible && <Spinner label="Buscando horarios…" />}
      {visible?.length === 0 && <Alert kind="info">No hay horarios disponibles ese día. Pruebe otro día.</Alert>}
      {visible?.length > 0 && (
        <div className="slot-grid">
          {visible.map((s) => (
            <button key={`${s.time}-${s.professionalId}`} type="button" className={`slot ${time === s.time ? 'selected' : ''}`}
              onClick={() => setTime(s.time)}>{s.time}</button>
          ))}
        </div>
      )}
      <div className="wizard-nav">
        <button className="btn btn-ghost" onClick={onBack} disabled={busy}>Volver</button>
        <button className="btn" disabled={busy || !time}
          onClick={() => onSubmit({ professionalId: professionalId ? Number(professionalId) : null, date, time })}>
          {busy ? 'Guardando…' : 'Confirmar cambio'}
        </button>
      </div>
    </div>
  );
}

function CancelForm({ busy, onBack, onSubmit }) {
  const [reason, setReason] = useState('');
  return (
    <div className="manage-panel">
      <h2>Cancelar la cita</h2>
      <Field label="Motivo" htmlFor="cr" hint="Por ejemplo: «ya no puedo asistir». No incluya información clínica.">
        <textarea id="cr" rows={3} maxLength={150} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="wizard-nav">
        <button className="btn btn-ghost" onClick={onBack} disabled={busy}>Volver</button>
        <button className="btn btn-danger" disabled={busy || reason.trim().length < 3} onClick={() => onSubmit(reason.trim())}>
          {busy ? 'Cancelando…' : 'Cancelar cita'}
        </button>
      </div>
    </div>
  );
}
