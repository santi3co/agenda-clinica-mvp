import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { PrototypeBanner, Spinner } from '../ui.jsx';
import Login from './Login.jsx';
import Dashboard from './Dashboard.jsx';
import Requests from './Requests.jsx';
import RequestDetail from './RequestDetail.jsx';
import CalendarPage from './CalendarPage.jsx';
import AdminUsers from './AdminUsers.jsx';
import AuditLog from './AuditLog.jsx';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function StaffApp() {
  const [user, setUser] = useState(undefined); // undefined = verificando, null = sin sesión

  useEffect(() => {
    api('/auth/me').then((r) => setUser(r.user)).catch(() => setUser(null));
    const onExpired = () => setUser(null);
    window.addEventListener('session-expired', onExpired);
    return () => window.removeEventListener('session-expired', onExpired);
  }, []);

  const can = useCallback((perm) => Boolean(user?.permissions?.includes(perm)), [user]);

  if (user === undefined) return <Spinner />;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <AuthContext.Provider value={{ user, setUser, can }}>
      <StaffLayout>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="solicitudes" element={<Requests />} />
          <Route path="solicitudes/:id" element={<RequestDetail />} />
          <Route path="calendario" element={<CalendarPage />} />
          {can('users:manage') && <Route path="usuarios" element={<AdminUsers />} />}
          {can('audit:read') && <Route path="auditoria" element={<AuditLog />} />}
          <Route path="*" element={<Navigate to="/admisiones" replace />} />
        </Routes>
      </StaffLayout>
    </AuthContext.Provider>
  );
}

function StaffLayout({ children }) {
  const { user, setUser, can } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    navigate('/admisiones');
  }

  const links = [
    ['/admisiones', 'Inicio', true],
    ['/admisiones/solicitudes', 'Solicitudes'],
    ['/admisiones/calendario', 'Calendario'],
    ...(can('users:manage') ? [['/admisiones/usuarios', 'Usuarios']] : []),
    ...(can('audit:read') ? [['/admisiones/auditoria', 'Auditoría']] : []),
  ];

  return (
    <div className="staff-shell">
      <PrototypeBanner />
      <header className="staff-header">
        <button className="icon-btn menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Menú" aria-expanded={menuOpen}>☰</button>
        <div className="brand small">
          <span className="brand-mark" aria-hidden="true">+</span>
          <span><strong>Admisiones</strong><small>Consulta Externa</small></span>
        </div>
        <nav className={`staff-nav ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)}>
          {links.map(([to, label, end]) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}
        </nav>
        <div className="user-box">
          <span className="user-name">{user.full_name}<small>{user.username} · {user.role === 'ADMINISTRADOR' ? 'Administrador' : 'Admisionista'}</small></span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Salir</button>
        </div>
      </header>
      <main className="staff-main">{children}</main>
    </div>
  );
}
