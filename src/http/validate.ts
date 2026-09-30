import { z } from 'zod';
import { badRequest, validationFailed, type ErrorDetail } from './errors.js';

// Where the bad input came from decides the status code:
//   query string or path  -> 400 Bad Request   (the request itself is malformed)
//   JSON body             -> 422 Unprocessable (well-formed JSON that breaks a rule)

export function parseQuery<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw badRequest('Invalid query parameters', toDetails(result.error));
  return result.data;
}

export function parsePath<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw badRequest('Invalid path parameter', toDetails(result.error));
  return result.data;
}

export function parseBody<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw validationFailed('Request body failed validation', toDetails(result.error));
  return result.data;
}

// Turns Zod's issues into our { field, issue } details so the client knows
// exactly which input to fix.
function toDetails(error: z.ZodError): ErrorDetail[] {
  return error.issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({ field: key, issue: 'is not a recognised field' }));
    }
    return [{ field: issue.path.join('.') || '(root)', issue: issue.message }];
  });
}

// Every item endpoint (/resource/:id) validates its id with this.
// A malformed id is rejected here with 400 before any database query runs.
export const idParamSchema = z.object({
  id: z.uuid({ error: 'must be a valid UUID' }),
});

// Query strings are always text, so "true"/"false" are converted explicitly.
// (z.coerce.boolean() would turn the string "false" into true, because any
// non-empty string is truthy.)
export const booleanQueryParam = z
  .enum(['true', 'false'], { error: 'must be true or false' })
  .transform((value) => value === 'true');
