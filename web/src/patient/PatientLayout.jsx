import { Link, Outlet } from 'react-router-dom';
import { PrototypeBanner } from '../ui.jsx';

export default function PatientLayout() {
  return (
    <div className="patient-shell">
      <PrototypeBanner />
      <header className="patient-header">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">+</span>
          <span>
            <strong>Clínica Salud Divina de la Costa</strong>
            <small>Consulta Externa · Citas en línea</small>
          </span>
        </Link>
      </header>
      <main className="patient-main">
        <Outlet />
      </main>
      <footer className="patient-footer">
        <p>
          ¿Necesita ayuda o su caso es especial? Admisiones lo orienta por WhatsApp.
          <br />
          <small>Este portal es solo para solicitar y consultar citas. No ingrese información clínica.</small>
        </p>
      </footer>
    </div>
  );
}
