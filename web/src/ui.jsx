import { useEffect, useRef } from 'react';
import { STATUS } from './format.js';

export function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, tone: 'gray' };
  return <span className={`badge badge-${s.tone}`}>{s.label}</span>;
}

export function Alert({ kind = 'error', children }) {
  if (!children) return null;
  return <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function Spinner({ label = 'Cargando…' }) {
  return <div className="spinner" role="status"><span className="spinner-dot" />{label}</div>;
}

export function PrototypeBanner() {
  return (
    <div className="proto-banner">
      Prototipo técnico preliminar · Datos ficticios · No usar con información real de pacientes
    </div>
  );
}

export function Modal({ title, onClose, children, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const root = ref.current;
    (root?.querySelector('.modal-body input, .modal-body select, .modal-body textarea') || root?.querySelector('button'))?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <small className="hint">{hint}</small>}
      {error && <small className="field-error">{error}</small>}
    </div>
  );
}
