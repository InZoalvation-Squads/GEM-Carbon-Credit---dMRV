/**
 * Application error carrying an HTTP status and one of the allowlisted
 * public error codes (see PASSTHROUGH_ERROR_CODES in app.ts). Thrown from
 * services/guards; the global error handler turns it into the
 * `{ error: { code, message } }` envelope.
 */
export interface AppError extends Error {
  statusCode: number;
  code: string;
}

export function appError(statusCode: number, code: string, message: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  return err;
}
