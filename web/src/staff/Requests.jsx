import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorText } from '../api.js';
import { fmtDate, fmtDateTime, fmtTime, STATUS } from '../format.js';
import { Alert, Spinner, StatusBadge } from '../ui.jsx';
import { useAuth } from './StaffApp.jsx';
import { useCatalog } from './useCatalog.js';

const FILTER_KEYS = ['q', 'status', 'specialtyId', 'professionalId', 'dateFrom', 'dateTo', 'sort'];

export default function Requests() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { specialties, professionals } = useCatalog();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState(params.get('q') || '');

  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']));
  const page = Number(params.get('page') || 1);

  useEffect(() => {
    setData(null);
    api('/staff/appointments', { params: { ...filters, page, pageSize: 20 } })
      .then(setData)
      .catch((e) => setError(errorText(e)));
  }, [params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  }

  const profOptions = professionals.filter((p) => !filters.specialtyId || String(p.specialtyId) === filters.specialtyId);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <div className="page-head">
        <h1>Solicitudes</h1>
        {can('appointments:manage') && <Link className="btn" to="/admisiones/solicitudes/nueva">+ Nueva cita</Link>}
      </div>

      <form className="filters" onSubmit={(e) => { e.preventDefault(); update({ q }); }}>
        <input type="search" placeholder="Buscar paciente, documento o código…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        <select value={filters.status} onChange={(e) => update({ status: e.target.value })} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
        <select value={filters.specialtyId} onChange={(e) => update({ specialtyId: e.target.value, professionalId: '' })} aria-label="Especialidad">
          <option value="">Todas las especialidades</option>
          {specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filters.professionalId} onChange={(e) => update({ professionalId: e.target.value })} aria-label="Profesional">
          <option value="">Todos los profesionales</option>
          {profOptions.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
        </select>
        <label className="inline-label">Cita desde <input type="date" value={filters.dateFrom} onChange={(e) => update({ dateFrom: e.target.value })} /></label>
        <label className="inline-label">hasta <input type="date" value={filters.dateTo} onChange={(e) => update({ dateTo: e.target.value })} /></label>
        <select value={filters.sort || 'created'} onChange={(e) => update({ sort: e.target.value })} aria-label="Orden">
          <option value="created">Más recientes primero</option>
          <option value="start">Por fecha de la cita</option>
        </select>
        <button className="btn btn-sm" type="submit">Buscar</button>
        {FILTER_KEYS.some((k) => params.get(k)) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setParams({}); }}>Limpiar</button>
        )}
      </form>

      <Alert>{error}</Alert>
      {!data ? <Spinner /> : data.items.length === 0 ? <p className="empty">No hay solicitudes con esos filtros.</p> : (
        <>
          <div className="table-wrap">
            <table className="table responsive">
              <thead>
                <tr>
                  <th>Código</th><th>Paciente</th><th>Documento</th><th>Especialidad</th><th>Profesional</th>
                  <th>Fecha solicitada</th><th>Hora</th><th>Estado</th><th>Fecha de solicitud</th><th>Responsable</th><th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id} onClick={() => navigate(`/admisiones/solicitudes/${a.id}`)} className="clickable">
                    <td data-label="Código" className="mono">{a.code}</td>
                    <td data-label="Paciente"><strong>{a.patientName}</strong></td>
                    <td data-label="Documento">{a.documentType} {a.documentNumber}</td>
                    <td data-label="Especialidad">{a.specialtyName}</td>
                    <td data-label="Profesional">{a.professionalName}</td>
                    <td data-label="Fecha solicitada">{fmtDate(a.startAt)}</td>
                    <td data-label="Hora">{fmtTime(a.startAt)}</td>
                    <td data-label="Estado"><StatusBadge status={a.status} /></td>
                    <td data-label="Fecha de solicitud">{fmtDateTime(a.createdAt)}</td>
                    <td data-label="Responsable">{a.assignedUsername || <span className="muted">Sin asignar</span>}</td>
                    <td data-label="">
                      <Link className="btn btn-sm btn-ghost" to={`/admisiones/solicitudes/${a.id}`} onClick={(e) => e.stopPropagation()}>
                        {a.status === 'PENDIENTE' ? 'Gestionar' : 'Ver'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <span className="muted">{data.total} solicitud{data.total === 1 ? '' : 'es'}</span>
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Anterior</button>
            <span>Página {page} de {totalPages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => update({ page: String(page + 1) })}>Siguiente</button>
          </div>
        </>
      )}
    </div>
  );
}
