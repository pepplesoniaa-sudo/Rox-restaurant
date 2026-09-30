import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError, notFound } from './errors.js';

// Runs when no route matched the request. Passing the error to next()
// sends it through the same error handler as everything else.
export const unknownRouteHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`No route for ${req.method} ${req.path}`));
};

// Body-parser errors (from express.json) carry a "type" field.
function isBodyParserError(err: unknown): err is { type: string; status: number } {
  return typeof err === 'object' && err !== null && 'type' in err && 'status' in err;
}

// The one place that writes an error response. Express recognises an error
// handler by its four parameters, so "_next" must stay even though it is unused.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Client sent a body that is not valid JSON, e.g. {"name": }
  if (isBodyParserError(err) && err.type === 'entity.parse.failed') {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Request body is not valid JSON' },
    });
    return;
  }

  // Body bigger than JSON_BODY_LIMIT.
  if (isBodyParserError(err) && err.type === 'entity.too.large') {
    res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' },
    });
    return;
  }

  // Anything else is a bug. Log the details for us; tell the client nothing
  // about our internals.
  console.error(err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side' },
  });
};
