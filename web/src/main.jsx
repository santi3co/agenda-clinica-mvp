import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import PatientLayout from './patient/PatientLayout.jsx';
import Home from './patient/Home.jsx';
import Booking from './patient/Booking.jsx';
import StatusLookup from './patient/StatusLookup.jsx';
import { Spinner } from './ui.jsx';
import './styles.css';

// El panel de Admisiones se carga en diferido: el paciente nunca descarga ese código
// al usar el portal. (La protección real está en la API: RBAC en cada endpoint.)
const StaffApp = lazy(() => import('./staff/StaffApp.jsx'));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<PatientLayout />}>
          <Route index element={<Home />} />
          <Route path="agendar" element={<Booking />} />
          <Route path="consultar" element={<StatusLookup />} />
        </Route>
        <Route
          path="admisiones/*"
          element={<Suspense fallback={<Spinner />}><StaffApp /></Suspense>}
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
