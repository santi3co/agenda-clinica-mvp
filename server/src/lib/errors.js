export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const notFound = (msg = 'Recurso no encontrado') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);

/** Envuelve un handler async para que los errores lleguen al middleware de errores. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Valida con un esquema zod y devuelve los datos limpios, o lanza 400. */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw badRequest('Datos inválidos', details);
  }
  return result.data;
}
