/**
 * The complete public error-code vocabulary of the API. Everything a client
 * can ever see in `{ error: { code } }` is one of these; app.ts derives its
 * passthrough allowlist from this same list (single source of truth).
 */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UNPROCESSABLE',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Application error carrying an HTTP status and a public error code. Thrown
 * from services/guards; the global error handler turns it into the
 * `{ error: { code, message } }` envelope.
 */
export interface AppError extends Error {
  statusCode: number;
  code: ErrorCode;
}

export function appError(statusCode: number, code: ErrorCode, message: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

/** The one canonical 401 for missing/invalid/expired access tokens. */
export function unauthorized(message = 'Missing or invalid access token'): AppError {
  return appError(401, 'UNAUTHORIZED', message);
}
