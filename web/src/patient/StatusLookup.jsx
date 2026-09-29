import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, errorText } from '../api.js';
import { fmtPlainDate } from '../format.js';
import { Alert, Field, StatusBadge } from '../ui.jsx';

const EXPLAIN = {
  PENDIENTE: 'Recibimos su solicitud y su horario está reservado. Admisiones la revisará pronto.',
  EN_GESTION: 'Admisiones está gestionando su solicitud.',
  CONFIRMADA: 'Su cita está confirmada. Por favor llegue 20 minutos antes.',
  REGISTRADA_EN_SALUDSYSTEM12: 'Su cita está confirmada y registrada en el sistema de la clínica. Por favor llegue 20 minutos antes.',
  REPROGRAMADA: 'Su cita cambió de fecha u hora. Admisiones se comunicará con usted para confirmarla.',
  CANCELADA: 'Esta solicitud fue cancelada. Si lo necesita, puede solicitar una nueva cita.',
};

export default function StatusLookup() {
  const location = useLocation();
  const [code, setCode] = useState(location.state?.code || '');
  const [documentNumber, setDocumentNumber] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      setResult(await api('/public/requests/lookup', { method: 'POST', body: { code: code.trim(), documentNumber: documentNumber.trim() } }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card narrow">
      <h1>Consultar mi solicitud</h1>
      <form onSubmit={submit}>
        <Field label="Número de solicitud" htmlFor="code" hint="Ejemplo: SOL-000123">
          <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SOL-000000" autoComplete="off" />
        </Field>
        <Field label="Número de documento del paciente" htmlFor="doc">
          <input id="doc" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} inputMode="numeric" autoComplete="off" />
        </Field>
        <button className="btn btn-block" disabled={loading || !code || !documentNumber}>{loading ? 'Consultando…' : 'Consultar'}</button>
      </form>
      <Alert>{error}</Alert>
      {result && (
        <div className="lookup-result">
          <div className="lookup-head">
            <strong>{result.code}</strong>
            <StatusBadge status={result.status} />
          </div>
          <p>{EXPLAIN[result.status]}</p>
          <dl className="summary">
            <dt>Paciente</dt><dd>{result.patientName}</dd>
            <dt>Especialidad</dt><dd>{result.specialty}</dd>
            <dt>Profesional</dt><dd>{result.professional}</dd>
            <dt>Fecha</dt><dd>{fmtPlainDate(result.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</dd>
            <dt>Hora</dt><dd>{result.time}</dd>
          </dl>
        </div>
      )}
    </section>
  );
}
