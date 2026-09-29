import { useState } from 'react';
import { api, errorText } from '../api.js';
import { Alert, Field, PrototypeBanner } from '../ui.jsx';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user } = await api('/auth/login', { method: 'POST', body: { username, password } });
      onLogin(user);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <PrototypeBanner />
      <form className="card login-card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">+</span>
          <span><strong>Panel de Admisiones</strong><small>Acceso exclusivo para personal de la clínica</small></span>
        </div>
        <Field label="Usuario" htmlFor="u">
          <input id="u" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </Field>
        <Field label="Contraseña" htmlFor="p">
          <input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Alert>{error}</Alert>
        <button className="btn btn-block" disabled={loading || !username || !password}>{loading ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </div>
  );
}
