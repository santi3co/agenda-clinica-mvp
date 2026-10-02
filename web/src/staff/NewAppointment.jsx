import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorText } from '../api.js';
import { addDays, DOC_TYPES, fmtPlainDate, isoDate } from '../format.js';
import { Alert, Field, Spinner } from '../ui.jsx';
import { useCatalog } from './useCatalog.js';

const emptyPatient = { documentType: 'CC', documentNumber: '', fullName: '', phone: '', email: '' };

/** Cita creada por Admisiones para un paciente que llamó o escribió por WhatsApp. */
export default function NewAppointment() {
  const navigate = useNavigate();
  const { specialties, professionals } = useCatalog();
  const [patient, setPatient] = useState(emptyPatient);
  const [lookup, setLookup] = useState(null); // null = sin buscar | { found, patient }
  const [searching, setSearching] = useState(false);
  const [specialtyId, setSpecialtyId] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [date, setDate] = useState(isoDate());
  const [slots, setSlots] = useState(null);
  const [slot, setSlot] = useState(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [confirmNow, setConfirmNow] = useState(true);
  const [dataConsent, setDataConsent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const specialty = specialties.find((s) => String(s.id) === specialtyId);
  const profOptions = professionals.filter((p) => String(p.specialtyId) === specialtyId);

  function loadSlots() {
    setSlot(null);
    if (!specialtyId || !date) return setSlots(null);
    setSlots(null);
    api('/catalog/availability', { params: { specialtyId, professionalId, date } })
      .then(setSlots)
      .catch((e) => { setSlots([]); setError(errorText(e)); });
  }
  useEffect(loadSlots, [specialtyId, professionalId, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setPatient((p) => ({ ...p, [k]: e.target.value }));

  async function searchPatient() {
    const documentNumber = patient.documentNumber.trim();
    if (!/^[A-Za-z0-9]{3,20}$/.test(documentNumber)) {
      setFieldErrors((f) => ({ ...f, documentNumber: 'Solo letras y números, sin puntos ni espacios' }));
      return;
    }
    setSearching(true);
    setError('');
    setFieldErrors((f) => ({ ...f, documentNumber: undefined }));
    try {
      const res = await api('/staff/patients/lookup', { params: { documentType: patient.documentType, documentNumber } });
      setLookup(res);
      if (res.found) {
        setPatient((p) => ({ ...p, fullName: res.patient.fullName, phone: res.patient.phone, email: res.patient.email || '' }));
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSearching(false);
    }
  }

  function validate() {
    const e = {};
    if (!/^[A-Za-z0-9]{3,20}$/.test(patient.documentNumber.trim())) e.documentNumber = 'Solo letras y números, sin puntos ni espacios';
    if (patient.fullName.trim().split(/\s+/).length < 2) e.fullName = 'Escriba nombre y apellido';
    if (!/^\+?\d{7,15}$/.test(patient.phone.trim())) e.phone = 'Solo números, por ejemplo 3001234567';
    if (patient.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patient.email.trim())) e.email = 'Correo inválido';
    if (!specialtyId) e.specialty = 'Seleccione la especialidad';
    if (!slot) e.slot = 'Seleccione un horario';
    if (specialty?.requiresReason && reason.trim().length < 3) e.reason = 'Indique brevemente el motivo';
    if (!dataConsent) e.dataConsent = 'Requerido para registrar la cita';
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev) {
    ev.preventDefault();
    setError('');
    if (!validate()) return;
    setSending(true);
    try {
      const res = await api('/staff/appointments', {
        method: 'POST',
        body: {
          ...patient,
          documentNumber: patient.documentNumber.trim(),
          specialtyId: Number(specialtyId),
          professionalId: slot.professionalId,
          date,
          time: slot.time,
          reason: specialty?.requiresReason ? reason.trim() : undefined,
          note: note.trim() || undefined,
          confirmNow,
          dataConsent,
        },
      });
      navigate(`/admisiones/solicitudes/${res.id}`, { state: { notice: `Cita ${res.code} creada.`, managePath: res.managePath } });
    } catch (e) {
      setError(errorText(e));
      if (e.status === 409 && /horario/i.test(e.message)) loadSlots();
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="new-appt" onSubmit={submit} noValidate>
      <Link to="/admisiones/solicitudes" className="back">← Solicitudes</Link>
      <div className="page-head">
        <div>
          <h1>Nueva cita</h1>
          <p className="muted">Para pacientes que llaman o escriben a Admisiones.</p>
        </div>
      </div>

      <Alert>{error}</Alert>

      <div className="detail-grid">
        <section className="panel">
          <h2>Paciente</h2>
          <div className="form-grid">
            <Field label="Tipo de documento" htmlFor="dt">
              <select id="dt" value={patient.documentType} onChange={(e) => { set('documentType')(e); setLookup(null); }}>
                {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Número de documento" htmlFor="dn" error={fieldErrors.documentNumber}>
              <div className="input-with-btn">
                <input id="dn" inputMode="numeric" autoComplete="off" value={patient.documentNumber}
                  onChange={(e) => { set('documentNumber')(e); setLookup(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchPatient(); } }} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={searchPatient} disabled={searching}>
                  {searching ? 'Buscando…' : 'Buscar'}
                </button>
              </div>
            </Field>
          </div>
          {lookup?.found && (
            <Alert kind="info">
              Paciente registrado: datos cargados. Verifique con el paciente que estén actualizados.
              {lookup.patient.activeAppointments > 0 && <> Tiene <strong>{lookup.patient.activeAppointments}</strong> cita(s) activa(s).</>}
            </Alert>
          )}
          {lookup && !lookup.found && <Alert kind="info">Paciente nuevo: complete sus datos.</Alert>}
          <div className="form-grid">
            <Field label="Nombre completo" htmlFor="fn" error={fieldErrors.fullName}>
              <input id="fn" autoComplete="off" value={patient.fullName} onChange={set('fullName')} />
            </Field>
            <Field label="Teléfono celular (WhatsApp)" htmlFor="ph" error={fieldErrors.phone}>
              <input id="ph" type="tel" inputMode="tel" autoComplete="off" value={patient.phone} onChange={set('phone')} />
            </Field>
            <Field label="Correo electrónico (opcional)" htmlFor="em" error={fieldErrors.email}>
              <input id="em" type="email" autoComplete="off" value={patient.email} onChange={set('email')} />
            </Field>
          </div>
        </section>

        <section className="panel">
          <h2>Cita</h2>
          <div className="form-grid">
            <Field label="Especialidad" htmlFor="sp" error={fieldErrors.specialty}>
              <select id="sp" value={specialtyId} onChange={(e) => { setSpecialtyId(e.target.value); setProfessionalId(''); }}>
                <option value="">Seleccione…</option>
                {specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Profesional" htmlFor="pr">
              <select id="pr" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)} disabled={!specialtyId}>
                <option value="">Cualquier profesional</option>
                {profOptions.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </Field>
            <Field label="Fecha" htmlFor="fd" hint={date ? fmtPlainDate(date, { weekday: 'long', day: 'numeric', month: 'long' }) : null}>
              <input id="fd" type="date" min={isoDate()} max={addDays(isoDate(), 60)} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            {specialty?.requiresReason && (
              <Field label="Motivo de la consulta" htmlFor="rs" error={fieldErrors.reason}
                hint="Frase corta (p. ej. «control»). Sin diagnósticos ni datos clínicos.">
                <input id="rs" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            )}
          </div>

          <h3 className="small">Horario {fieldErrors.slot && <small className="field-error">{fieldErrors.slot}</small>}</h3>
          {!specialtyId ? <p className="muted small">Seleccione la especialidad para ver los horarios.</p>
            : !slots ? <Spinner label="Buscando horarios…" />
              : slots.length === 0 ? <p className="empty">Sin horarios libres ese día.</p> : (
                <div className={`slot-grid compact ${professionalId ? '' : 'with-prof'}`}>
                  {slots.map((s) => (
                    <button key={`${s.time}-${s.professionalId}`} type="button"
                      className={`slot ${slot?.time === s.time && slot?.professionalId === s.professionalId ? 'selected' : ''}`}
                      onClick={() => setSlot(s)} title={s.professionalName}>
                      {s.time}{!professionalId && <small className="slot-prof">{s.professionalName}</small>}
                    </button>
                  ))}
                </div>
              )}
        </section>

        <section className="panel span-2">
          <h2>Registro</h2>
          <Field label="Nota (opcional)" htmlFor="nt">
            <input id="nt" maxLength={300} placeholder="Ej.: Paciente llamó a la línea de Admisiones" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={confirmNow} onChange={(e) => setConfirmNow(e.target.checked)} />
            Cita acordada con el paciente: crearla como <strong>Confirmada</strong> (si no, queda <strong>En gestión</strong>).
          </label>
          <div className={`consent ${fieldErrors.dataConsent ? 'has-error' : ''}`}>
            <label>
              <input type="checkbox" checked={dataConsent} onChange={(e) => setDataConsent(e.target.checked)} />
              <span>
                El paciente autorizó verbalmente el tratamiento de sus datos personales para gestionar la cita (Ley 1581 de 2012).
              </span>
            </label>
            {fieldErrors.dataConsent && <small className="field-error">{fieldErrors.dataConsent}</small>}
          </div>
          <div className="wizard-nav">
            <Link to="/admisiones/solicitudes" className="btn btn-ghost">Cancelar</Link>
            <button className="btn" type="submit" disabled={sending}>{sending ? 'Guardando…' : 'Crear cita'}</button>
          </div>
        </section>
      </div>
    </form>
  );
}
