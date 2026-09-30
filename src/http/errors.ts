// Every error the API deliberately returns is an ApiError.
// Handlers throw it; the central error handler turns it into the
// { error: { code, message, details? } } envelope with the right status.

export type ErrorCode =
  | 'BAD_REQUEST' // 400: the query string or path is invalid
  | 'NOT_FOUND' // 404: the resource or route does not exist
  | 'CONFLICT' // 409: valid request, but not allowed in the resource's current state
  | 'PAYLOAD_TOO_LARGE' // 413: body bigger than JSON_BODY_LIMIT
  | 'VALIDATION_FAILED' // 422: the JSON body is well-formed but breaks a rule
  | 'RATE_LIMITED' // 429: too many requests from this IP
  | 'INTERNAL_ERROR'; // 500: a bug on our side

// Points at the exact input that was wrong, e.g. { field: "items.0.quantity", issue: "must be at least 1" }
export interface ErrorDetail {
  field: string;
  issue: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: ErrorDetail[] | undefined;

  constructor(status: number, code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: ErrorDetail[]) =>
  new ApiError(400, 'BAD_REQUEST', message, details);

export const notFound = (message: string) => new ApiError(404, 'NOT_FOUND', message);

export const conflict = (message: string, details?: ErrorDetail[]) =>
  new ApiError(409, 'CONFLICT', message, details);

export const validationFailed = (message: string, details?: ErrorDetail[]) =>
  new ApiError(422, 'VALIDATION_FAILED', message, details);
