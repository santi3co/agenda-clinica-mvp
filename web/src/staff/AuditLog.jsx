import { useEffect, useState } from 'react';
import { api, errorText } from '../api.js';
import { fmtDateTime } from '../format.js';
import { Alert, Spinner } from '../ui.jsx';

const RESULT_TONE = { EXITO: 'green', FALLO: 'amber', DENEGADO: 'red' };
const MODULES = ['auth', 'portal', 'appointments', 'admin', 'sistema'];

export default function AuditLog() {
  const [filters, setFilters] = useState({ q: '', module: '', result: '' });
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    api('/admin/audit-logs', { params: { ...filters, page } }).then(setData).catch((e) => setError(errorText(e)));
  }, [filters, page]);

  const set = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })); };
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Auditoría</h1>
          <p className="muted">Registro de accesos y operaciones: usuario, acción, módulo, registro afectado, resultado y fecha.</p>
        </div>
      </div>
      <form className="filters" onSubmit={(e) => { e.preventDefault(); setPage(1); setFilters((f) => ({ ...f, q })); }}>
        <input type="search" placeholder="Usuario, acción o código (SOL-…)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        <select value={filters.module} onChange={set('module')} aria-label="Módulo">
          <option value="">Todos los módulos</option>
          {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filters.result} onChange={set('result')} aria-label="Resultado">
          <option value="">Todos los resultados</option>
          <option value="EXITO">Éxito</option>
          <option value="FALLO">Fallo</option>
          <option value="DENEGADO">Denegado</option>
        </select>
        <button className="btn btn-sm">Buscar</button>
      </form>
      <Alert>{error}</Alert>
      {!data ? <Spinner /> : (
        <>
          <div className="table-wrap">
            <table className="table responsive small-text">
              <thead><tr><th>Fecha/hora</th><th>Usuario</th><th>Acción</th><th>Módulo</th><th>Registro</th><th>Resultado</th><th>IP</th><th>Detalle</th></tr></thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l.id}>
                    <td data-label="Fecha/hora">{fmtDateTime(l.createdAt)}</td>
                    <td data-label="Usuario">{l.username || <span className="muted">anónimo/portal</span>}</td>
                    <td data-label="Acción" className="mono">{l.action}</td>
                    <td data-label="Módulo">{l.module}</td>
                    <td data-label="Registro" className="mono">{l.entity ? `${l.entity} ${l.entityId ?? ''}` : '—'}</td>
                    <td data-label="Resultado"><span className={`badge badge-${RESULT_TONE[l.result]}`}>{l.result}</span></td>
                    <td data-label="IP" className="mono">{l.ip || '—'}</td>
                    <td data-label="Detalle" className="mono detail-cell">{l.detail ? JSON.stringify(l.detail) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <span className="muted">{data.total} eventos</span>
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
            <span>Página {page} de {totalPages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Siguiente</button>
          </div>
        </>
      )}
    </div>
  );
}
