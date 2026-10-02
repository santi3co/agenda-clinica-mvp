import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../api.js';
import { addDays, DOC_TYPES, fmtPlainDate, isoDate } from '../format.js';
import { Alert, Field, Spinner } from '../ui.jsx';

const STEPS = ['Especialidad', 'Fecha y hora', 'Sus datos', 'Confirmar'];
const DAYS_SHOWN = 21;

const emptyPatient = { documentType: 'CC', documentNumber: '', fullName: '', phone: '', email: '', reason: '', dataConsent: false };

export default function Booking() {
  const [step, setStep] = useState(0);
  const [specialties, setSpecialties] = useState(null);
  const [professionals, setProfessionals] = useState([]);
  const [specialtyId, setSpecialtyId] = useState(null);
  const [professionalId, setProfessionalId] = useState('');
  const [date, setDate] = useState(null);
  const [slots, setSlots] = useState(null);
  const [slot, setSlot] = useState(null);
  const [patient, setPatient] = useState(emptyPatient);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const specialty = specialties?.find((s) => s.id === specialtyId);
  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(isoDate(), i)), []);

  useEffect(() => {
    api('/catalog/specialties').then(setSpecialties).catch((e) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    if (!specialtyId) return;
    setProfessionalId('');
    api('/catalog/professionals', { params: { specialtyId } }).then(setProfessionals).catch((e) => setError(errorText(e)));
  }, [specialtyId]);

  function loadSlots(d = date) {
    if (!d) return;
    setSlots(null);
    setSlot(null);
    api('/catalog/availability', { params: { specialtyId, professionalId, date: d } })
      .then(setSlots)
      .catch((e) => { setSlots([]); setError(errorText(e)); });
  }
  useEffect(() => { if (step === 1) loadSlots(); }, [date, professionalId, specialtyId, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Con "cualquier profesional" se muestra cada hora una sola vez.
  const visibleSlots = useMemo(() => {
    if (!slots) return null;
    if (professionalId) return slots;
    const byTime = new Map();
    for (const s of slots) if (!byTime.has(s.time)) byTime.set(s.time, { ...s, professionalName: null });
    return [...byTime.values()];
  }, [slots, professionalId]);

  function validatePatient() {
    const e = {};
    if (!/^[A-Za-z0-9]{3,20}$/.test(patient.documentNumber.trim())) e.documentNumber = 'Solo letras y números, sin puntos ni espacios';
    if (patient.fullName.trim().split(/\s+/).length < 2) e.fullName = 'Escriba nombre y apellido';
    if (!/^\+?\d{7,15}$/.test(patient.phone.trim())) e.phone = 'Solo números, por ejemplo 3001234567';
    if (patient.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patient.email.trim())) e.email = 'Correo inválido';
    if (specialty?.requiresReason && patient.reason.trim().length < 3) e.reason = 'Indique brevemente el motivo';
    if (!patient.dataConsent) e.dataConsent = 'Debe aceptar para continuar';
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    setSending(true);
    setError('');
    try {
      const res = await api('/public/requests', {
        method: 'POST',
        body: {
          ...patient,
          reason: specialty?.requiresReason ? patient.reason.trim() : undefined,
          specialtyId,
          professionalId: professionalId ? Number(professionalId) : null,
          date,
          time: slot.time,
        },
      });
      setResult(res);
    } catch (e) {
      setError(errorText(e));
      if (e.status === 409 && /horario/i.test(e.message)) {
        setStep(1);
        loadSlots();
      }
    } finally {
      setSending(false);
    }
  }

  const set = (k) => (e) => setPatient((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  if (result) {
    return (
      <section className="card success-card">
        <div className="success-icon" aria-hidden="true">✓</div>
        <h1>Solicitud recibida</h1>
        <p>Su número de solicitud es:</p>
        <p className="big-code">{result.code}</p>
        <p className="muted">Guárdelo. Lo necesitará junto con su documento para consultar el estado.</p>
        <dl className="summary">
          <dt>Especialidad</dt><dd>{specialty?.name}</dd>
          <dt>Profesional</dt><dd>{result.professionalName}</dd>
          <dt>Fecha</dt><dd>{fmtPlainDate(result.date, { weekday: 'long', day: 'numeric', month: 'long' })}</dd>
          <dt>Hora</dt><dd>{result.time}</dd>
        </dl>
        <Alert kind="info">
          Su horario queda <strong>reservado</strong> y en estado <strong>Pendiente</strong>. Admisiones revisará la solicitud y
          confirmará la cita. Más adelante recibirá la confirmación por WhatsApp.
        </Alert>
        <Alert kind="info">
          Con este enlace privado puede ver, cambiar o cancelar su cita. Guárdelo y no lo comparta:
          <br /><strong className="mono break">{window.location.origin}{result.managePath}</strong>
        </Alert>
        <div className="row-actions">
          <Link className="btn" to={result.managePath}>Gestionar mi cita</Link>
          <Link className="btn btn-ghost" to="/consultar" state={{ code: result.code }}>Consultar estado</Link>
          <Link className="btn btn-ghost" to="/">Volver al inicio</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="card booking">
      <ol className="stepper" aria-label="Pasos">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'current' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span>{i + 1}</span>{s}
          </li>
        ))}
      </ol>

      <Alert>{error}</Alert>

      {step === 0 && (
        <div>
          <h2>¿Qué especialidad necesita?</h2>
          {!specialties ? <Spinner /> : (
            <div className="choice-grid">
              {specialties.map((s) => (
                <button key={s.id} type="button" className={`choice ${s.id === specialtyId ? 'selected' : ''}`}
                  onClick={() => { setSpecialtyId(s.id); setError(''); }}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
          {specialtyId && (
            <Field label="Profesional" htmlFor="prof" hint="Si no tiene preferencia, le asignamos el primero disponible.">
              <select id="prof" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
                <option value="">Cualquier profesional disponible</option>
                {professionals.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </Field>
          )}
          <div className="wizard-nav">
            <Link to="/" className="btn btn-ghost">Cancelar</Link>
            <button className="btn" disabled={!specialtyId} onClick={() => { setStep(1); setError(''); }}>Continuar</button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <h2>Elija el día y la hora</h2>
          <p className="muted">{specialty?.name}{professionalId ? ` · ${professionals.find((p) => String(p.id) === professionalId)?.fullName}` : ''}</p>
          <div className="day-strip" role="listbox" aria-label="Días">
            {days.map((d) => (
              <button key={d} type="button" role="option" aria-selected={d === date}
                className={`day ${d === date ? 'selected' : ''}`} onClick={() => { setDate(d); setError(''); }}>
                <small>{fmtPlainDate(d, { weekday: 'short' })}</small>
                <strong>{fmtPlainDate(d, { day: 'numeric' })}</strong>
                <small>{fmtPlainDate(d, { month: 'short' })}</small>
              </button>
            ))}
          </div>
          {!date && <p className="muted center">Seleccione un día para ver los horarios.</p>}
          {date && !visibleSlots && <Spinner label="Buscando horarios…" />}
          {date && visibleSlots?.length === 0 && (
            <Alert kind="info">No hay horarios disponibles ese día. Pruebe otro día{professionalId ? ' u otro profesional' : ''}.</Alert>
          )}
          {visibleSlots?.length > 0 && (
            <div className="slot-grid">
              {visibleSlots.map((s) => (
                <button key={`${s.time}-${s.professionalId}`} type="button"
                  className={`slot ${slot?.time === s.time && (!professionalId || slot?.professionalId === s.professionalId) ? 'selected' : ''}`}
                  onClick={() => setSlot(s)}>
                  {s.time}
                </button>
              ))}
            </div>
          )}
          <div className="wizard-nav">
            <button className="btn btn-ghost" onClick={() => setStep(0)}>Atrás</button>
            <button className="btn" disabled={!slot} onClick={() => { setStep(2); setError(''); }}>Continuar</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <form onSubmit={(e) => { e.preventDefault(); if (validatePatient()) setStep(3); }} noValidate>
          <h2>Sus datos</h2>
          <div className="form-grid">
            <Field label="Tipo de documento" htmlFor="dt">
              <select id="dt" value={patient.documentType} onChange={set('documentType')}>
                {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Número de documento" htmlFor="dn" error={fieldErrors.documentNumber}>
              <input id="dn" inputMode="numeric" autoComplete="off" value={patient.documentNumber} onChange={set('documentNumber')} />
            </Field>
            <Field label="Nombre completo" htmlFor="fn" error={fieldErrors.fullName}>
              <input id="fn" autoComplete="name" value={patient.fullName} onChange={set('fullName')} />
            </Field>
            <Field label="Teléfono celular (WhatsApp)" htmlFor="ph" error={fieldErrors.phone}>
              <input id="ph" type="tel" inputMode="tel" autoComplete="tel" value={patient.phone} onChange={set('phone')} />
            </Field>
            <Field label="Correo electrónico (opcional)" htmlFor="em" error={fieldErrors.email}>
              <input id="em" type="email" autoComplete="email" value={patient.email} onChange={set('email')} />
            </Field>
            {specialty?.requiresReason && (
              <Field label="Motivo de la consulta" htmlFor="rs" error={fieldErrors.reason}
                hint="Solo una frase corta (p. ej. «control», «primera vez»). No incluya diagnósticos ni datos clínicos.">
                <input id="rs" maxLength={200} value={patient.reason} onChange={set('reason')} />
              </Field>
            )}
          </div>
          <div className={`consent ${fieldErrors.dataConsent ? 'has-error' : ''}`}>
            <label>
              <input type="checkbox" checked={patient.dataConsent} onChange={set('dataConsent')} />
              <span>
                Autorizo el tratamiento de mis datos personales para gestionar esta solicitud de cita, conforme a la
                Ley 1581 de 2012. <em>(Texto de ejemplo del prototipo: el aviso de privacidad definitivo debe ser aprobado por la clínica.)</em>
              </span>
            </label>
            {fieldErrors.dataConsent && <small className="field-error">{fieldErrors.dataConsent}</small>}
          </div>
          <div className="wizard-nav">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>Atrás</button>
            <button className="btn" type="submit">Revisar</button>
          </div>
        </form>
      )}

      {step === 3 && (
        <div>
          <h2>Confirme su solicitud</h2>
          <dl className="summary">
            <dt>Especialidad</dt><dd>{specialty?.name}</dd>
            <dt>Profesional</dt><dd>{slot.professionalName || 'Primero disponible'}</dd>
            <dt>Fecha</dt><dd>{fmtPlainDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</dd>
            <dt>Hora</dt><dd>{slot.time}</dd>
            <dt>Paciente</dt><dd>{patient.fullName}</dd>
            <dt>Documento</dt><dd>{patient.documentType} {patient.documentNumber}</dd>
            <dt>Teléfono</dt><dd>{patient.phone}</dd>
            {patient.email && <><dt>Correo</dt><dd>{patient.email}</dd></>}
            {specialty?.requiresReason && <><dt>Motivo</dt><dd>{patient.reason}</dd></>}
          </dl>
          <div className="wizard-nav">
            <button className="btn btn-ghost" onClick={() => setStep(2)} disabled={sending}>Atrás</button>
            <button className="btn" onClick={submit} disabled={sending}>{sending ? 'Enviando…' : 'Confirmar solicitud'}</button>
          </div>
        </div>
      )}
    </section>
  );
}
