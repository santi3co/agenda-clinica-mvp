import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <section className="home">
      <h1>Agende su cita de Consulta Externa</h1>
      <p className="lead">Elija la especialidad, el día y la hora que le sirven. Recibirá un código para consultar su solicitud.</p>
      <div className="home-actions">
        <Link to="/agendar" className="home-card primary">
          <span className="home-card-icon" aria-hidden="true">📅</span>
          <strong>Agendar una cita</strong>
          <span>Toma unos 2 minutos</span>
        </Link>
        <Link to="/consultar" className="home-card">
          <span className="home-card-icon" aria-hidden="true">🔎</span>
          <strong>Consultar mi solicitud</strong>
          <span>Con su código y documento</span>
        </Link>
      </div>
      <ol className="how">
        <li><strong>Solicite</strong> su cita aquí.</li>
        <li><strong>Admisiones</strong> revisa y confirma su cita.</li>
        <li><strong>Consulte</strong> el estado cuando quiera con su código.</li>
      </ol>
    </section>
  );
}
