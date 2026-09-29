import { useEffect, useState } from 'react';
import { api, errorText } from '../api.js';
import { fmtDateTime } from '../format.js';
import { Alert, Field, Modal, Spinner } from '../ui.jsx';
import { useAuth } from './StaffApp.jsx';

const ROLE_LABEL = { ADMISIONISTA: 'Admisionista', ADMINISTRADOR: 'Administrador' };

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState(null);

  const load = () => api('/admin/users').then(setUsers).catch((e) => setError(errorText(e)));
  useEffect(() => {
    load();
    api('/admin/roles').then(setRoles).catch(() => {});
  }, []);

  async function patch(u, body, msg) {
    setError('');
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body });
      setNotice(msg);
      load();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Usuarios del personal</h1>
        <button className="btn" onClick={() => setCreating(true)}>Nuevo usuario</button>
      </div>
      <Alert kind="success">{notice}</Alert>
      <Alert>{error}</Alert>
      {!users ? <Spinner /> : (
        <div className="table-wrap">
          <table className="table responsive">
            <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Último ingreso</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td data-label="Usuario" className="mono">{u.username}</td>
                  <td data-label="Nombre">{u.fullName}</td>
                  <td data-label="Rol">
                    <select value={u.role} disabled={u.id === me.id}
                      onChange={(e) => patch(u, { role: e.target.value }, `Rol de ${u.username} actualizado.`)}>
                      {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                  <td data-label="Estado">{u.active ? <span className="badge badge-green">Activo</span> : <span className="badge badge-gray">Inactivo</span>}</td>
                  <td data-label="Último ingreso">{fmtDateTime(u.lastLoginAt)}</td>
                  <td data-label="" className="row-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setResetting(u)}>Cambiar contraseña</button>
                    {u.id !== me.id && (
                      <button className="btn btn-ghost btn-sm" onClick={() => patch(u, { active: !u.active }, `${u.username} ${u.active ? 'desactivado' : 'activado'}.`)}>
                        {u.active ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {roles.length > 0 && (
        <section className="panel" style={{ marginTop: 24 }}>
          <h2>Roles y permisos (RBAC)</h2>
          <ul className="role-list">
            {roles.map((r) => (
              <li key={r.id}><strong>{r.name}</strong>{r.permissions.map((p) => <span key={p} className="badge badge-gray mono">{p}</span>)}</li>
            ))}
            <li><strong>Paciente</strong><span className="muted small">Sin cuenta. Solo portal público: crear solicitud y consultar con código + documento.</span></li>
          </ul>
        </section>
      )}

      {creating && <CreateUserModal onClose={() => setCreating(false)} onCreated={(u) => { setCreating(false); setNotice(`Usuario ${u} creado.`); load(); }} />}
      {resetting && (
        <PasswordModal user={resetting} onClose={() => setResetting(null)}
          onSubmit={async (password) => { if (await patch(resetting, { password }, `Contraseña de ${resetting.username} actualizada.`)) setResetting(null); }} />
      )}
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ username: '', fullName: '', role: 'ADMISIONISTA', password: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function submit() {
    try {
      await api('/admin/users', { method: 'POST', body: form });
      onCreated(form.username);
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <Modal title="Nuevo usuario" onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Volver</button>
      <button className="btn" onClick={submit}>Crear</button>
    </>}>
      <Alert>{error}</Alert>
      <Field label="Usuario" htmlFor="nu" hint="Minúsculas, números, punto o guion"><input id="nu" value={form.username} onChange={set('username')} /></Field>
      <Field label="Nombre completo" htmlFor="nn"><input id="nn" value={form.fullName} onChange={set('fullName')} /></Field>
      <Field label="Rol" htmlFor="nr">
        <select id="nr" value={form.role} onChange={set('role')}>{Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </Field>
      <Field label="Contraseña inicial" htmlFor="np" hint="Mínimo 10 caracteres"><input id="np" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} /></Field>
    </Modal>
  );
}

function PasswordModal({ user, onClose, onSubmit }) {
  const [password, setPassword] = useState('');
  return (
    <Modal title={`Cambiar contraseña de ${user.username}`} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Volver</button>
      <button className="btn" disabled={password.length < 10} onClick={() => onSubmit(password)}>Guardar</button>
    </>}>
      <Field label="Nueva contraseña" htmlFor="pw" hint="Mínimo 10 caracteres">
        <input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
    </Modal>
  );
}
