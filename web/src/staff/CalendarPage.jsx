import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import luxonPlugin from '@fullcalendar/luxon3';
import esLocale from '@fullcalendar/core/locales/es';
import { api, errorText } from '../api.js';
import { isoDate, STATUS, TZ } from '../format.js';
import { Alert, Spinner } from '../ui.jsx';
import { useCatalog } from './useCatalog.js';

const ALL_STATUSES = Object.keys(STATUS).join(',');

export default function CalendarPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { specialties, professionals } = useCatalog();
  const calRef = useRef(null);
  const [filters, setFilters] = useState({ specialtyId: '', professionalId: '', status: '' });
  const filtersRef = useRef(filters);
  const [error, setError] = useState('');

  useEffect(() => {
    filtersRef.current = filters;
    calRef.current?.getApi().refetchEvents();
  }, [filters]);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value, ...(k === 'specialtyId' ? { professionalId: '' } : {}) }));
  const profOptions = professionals.filter((p) => !filters.specialtyId || String(p.specialtyId) === filters.specialtyId);

  function fetchEvents(info, success, failure) {
    const f = filtersRef.current;
    api('/staff/calendar', {
      params: { from: info.startStr, to: info.endStr, specialtyId: f.specialtyId, professionalId: f.professionalId, status: f.status },
    })
      .then((rows) => {
        setError('');
        success(rows.map((r) => ({
          id: String(r.id),
          title: r.patientName,
          start: r.startAt,
          end: r.endAt,
          backgroundColor: STATUS[r.status]?.color,
          borderColor: STATUS[r.status]?.color,
          classNames: r.status === 'CANCELADA' ? ['ev-cancelled'] : [],
          extendedProps: r,
        })));
      })
      .catch((e) => { setError(errorText(e)); failure(e); });
  }

  return (
    <div className="calendar-page">
      <div className="page-head"><h1>Calendario</h1></div>

      <div className="filters">
        <select value={filters.specialtyId} onChange={set('specialtyId')} aria-label="Especialidad">
          <option value="">Todas las especialidades</option>
          {specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filters.professionalId} onChange={set('professionalId')} aria-label="Profesional">
          <option value="">Todos los profesionales</option>
          {profOptions.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
        </select>
        <select value={filters.status} onChange={set('status')} aria-label="Estado">
          <option value="">Activas (sin canceladas)</option>
          {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          <option value={ALL_STATUSES}>Todas, incluidas canceladas</option>
        </select>
      </div>

      <div className="legend">
        {Object.entries(STATUS).map(([k, s]) => <span key={k}><i style={{ background: s.color }} />{s.label}</span>)}
      </div>

      <Alert>{error}</Alert>

      <div className="calendar-layout">
        <div className="panel calendar-panel">
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, timeGridPlugin, luxonPlugin]}
            locale={esLocale}
            timeZone={TZ}
            initialView={params.get('view') || 'timeGridWeek'}
            headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek,dayGridMonth' }}
            buttonText={{ today: 'Hoy', day: 'Día', week: 'Semana', month: 'Mes' }}
            slotMinTime="06:00:00"
            slotMaxTime="19:00:00"
            slotDuration="00:20:00"
            allDaySlot={false}
            nowIndicator
            weekends
            height="auto"
            dayMaxEvents={4}
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            events={fetchEvents}
            eventClick={(info) => navigate(`/admisiones/solicitudes/${info.event.id}`)}
            eventDidMount={(info) => {
              const p = info.event.extendedProps;
              info.el.title = `${p.code} · ${p.patientName}\n${p.specialtyName} · ${p.professionalName}\n${STATUS[p.status]?.label}`;
            }}
          />
        </div>
        <AvailabilityPanel specialties={specialties} professionals={professionals} />
      </div>
    </div>
  );
}

/** Consulta rápida de cupos libres para responder a un paciente (p. ej. por teléfono o WhatsApp). */
function AvailabilityPanel({ specialties, professionals }) {
  const [specialtyId, setSpecialtyId] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [date, setDate] = useState(isoDate());
  const [slots, setSlots] = useState(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!specialtyId) return setSlots(undefined);
    setSlots(null);
    setError('');
    api('/catalog/availability', { params: { specialtyId, professionalId, date } })
      .then(setSlots)
      .catch((e) => { setSlots([]); setError(errorText(e)); });
  }, [specialtyId, professionalId, date]);

  const byProfessional = (slots || []).reduce((acc, s) => {
    (acc[s.professionalName] ||= []).push(s.time);
    return acc;
  }, {});

  return (
    <aside className="panel availability-panel">
      <h2>Disponibilidad</h2>
      <select value={specialtyId} onChange={(e) => { setSpecialtyId(e.target.value); setProfessionalId(''); }} aria-label="Especialidad">
        <option value="">Elija especialidad…</option>
        {specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select value={professionalId} onChange={(e) => setProfessionalId(e.target.value)} disabled={!specialtyId} aria-label="Profesional">
        <option value="">Todos</option>
        {professionals.filter((p) => String(p.specialtyId) === specialtyId).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
      </select>
      <input type="date" value={date} min={isoDate()} onChange={(e) => setDate(e.target.value)} aria-label="Fecha" />
      <Alert>{error}</Alert>
      {slots === undefined ? <p className="muted small">Elija una especialidad para ver los cupos libres.</p>
        : slots === null ? <Spinner />
          : slots.length === 0 ? <p className="empty">Sin cupos libres.</p>
            : Object.entries(byProfessional).map(([name, times]) => (
              <div key={name} className="avail-block">
                <strong>{name}</strong> <small className="muted">({times.length})</small>
                <div className="slot-chips">{times.map((t) => <span key={t}>{t}</span>)}</div>
              </div>
            ))}
    </aside>
  );
}
