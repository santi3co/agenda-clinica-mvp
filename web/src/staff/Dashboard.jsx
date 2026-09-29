import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorText } from '../api.js';
import { fmtDate, fmtDateTime, fmtPlainDate, fmtTime } from '../format.js';
import { Alert, Spinner, StatusBadge } from '../ui.jsx';
import { useAuth } from './StaffApp.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/staff/dashboard').then(setData).catch((e) => setError(errorText(e)));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;

  const c = data.counts;
  const tiles = [
    { label: 'Pendientes por gestionar', value: c.PENDIENTE || 0, tone: 'amber', to: '/admisiones/solicitudes?status=PENDIENTE' },
    { label: 'En gestión', value: c.EN_GESTION || 0, tone: 'blue', to: '/admisiones/solicitudes?status=EN_GESTION' },
    { label: 'Confirmadas sin registrar en SaludSystem12', value: c.CONFIRMADA || 0, tone: 'green', to: '/admisiones/solicitudes?status=CONFIRMADA' },
    { label: 'Reprogramadas por confirmar', value: c.REPROGRAMADA || 0, tone: 'violet', to: '/admisiones/solicitudes?status=REPROGRAMADA' },
  ];

  return (
    <div className="dashboard">
      <div className="page-head">
        <div>
          <h1>Hola, {user.full_name.split(' ')[0]}</h1>
          <p className="muted">{fmtPlainDate(data.today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="row-actions">
          <Link className="btn" to="/admisiones/solicitudes?status=PENDIENTE">Gestionar pendientes</Link>
          <Link className="btn btn-ghost" to="/admisiones/calendario">Ver calendario</Link>
        </div>
      </div>

      <div className="tiles">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to} className={`tile tile-${t.tone}`}>
            <strong>{t.value}</strong>
            <span>{t.label}</span>
          </Link>
        ))}
      </div>

      <div className="dash-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Solicitudes pendientes <small>(más antiguas primero)</small></h2>
            <Link to="/admisiones/solicitudes?status=PENDIENTE">Ver todas</Link>
          </div>
          {data.pending.length === 0 ? <p className="empty">No hay solicitudes pendientes. 🎉</p> : (
            <ul className="item-list">
              {data.pending.map((a) => (
                <li key={a.id} onClick={() => navigate(`/admisiones/solicitudes/${a.id}`)}>
                  <div>
                    <strong>{a.patientName}</strong>
                    <small>{a.code} · {a.specialtyName} · recibida {fmtDateTime(a.createdAt)}</small>
                  </div>
                  <span className="item-when">{fmtDate(a.startAt)}<br />{fmtTime(a.startAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Citas de hoy <small>({data.todayAppointments.length})</small></h2>
            <Link to="/admisiones/calendario?view=timeGridDay">Agenda del día</Link>
          </div>
          {data.todayAppointments.length === 0 ? <p className="empty">No hay citas para hoy.</p> : (
            <ul className="item-list">
              {data.todayAppointments.map((a) => (
                <li key={a.id} onClick={() => navigate(`/admisiones/solicitudes/${a.id}`)}>
                  <span className="item-time">{fmtTime(a.startAt)}</span>
                  <div>
                    <strong>{a.patientName}</strong>
                    <small>{a.specialtyName} · {a.professionalName}</small>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Próximas citas <small>(7 días)</small></h2></div>
          {data.upcoming.length === 0 ? <p className="empty">Sin citas próximas confirmadas.</p> : (
            <ul className="item-list">
              {data.upcoming.map((a) => (
                <li key={a.id} onClick={() => navigate(`/admisiones/solicitudes/${a.id}`)}>
                  <span className="item-time">{fmtDate(a.startAt).replace(/\s\d{4}$/, '')}<br />{fmtTime(a.startAt)}</span>
                  <div>
                    <strong>{a.patientName}</strong>
                    <small>{a.specialtyName} · {a.professionalName}</small>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Disponibilidad de hoy</h2></div>
          <ul className="avail-list">
            {data.availabilityToday.map((s) => (
              <li key={s.specialtyId}>
                <span>{s.specialtyName}</span>
                <span className={`avail-count ${s.freeSlots === 0 ? 'none' : ''}`}>
                  {s.freeSlots === 0 ? 'Sin cupos' : `${s.freeSlots} cupo${s.freeSlots === 1 ? '' : 's'}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">Cupos libres desde ahora hasta el cierre de agenda.</p>
        </section>
      </div>
    </div>
  );
}
