// Cliente HTTP único. El frontend NO conoce la base de datos ni secretos: solo habla con /api.
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body, params } = {}) {
  const qs = params
    ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
    : '';
  const res = await fetch(`/api${path}${qs}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined || method !== 'GET' ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : method !== 'GET' ? '{}' : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Error de comunicación', data.details);
  return data;
}

/** Mensaje de error legible, incluyendo errores por campo de validación. */
export function errorText(err) {
  if (!err) return '';
  if (err.details?.length) return `${err.message}: ${err.details.map((d) => d.message).join('; ')}`;
  return err.message || 'Error inesperado';
}
