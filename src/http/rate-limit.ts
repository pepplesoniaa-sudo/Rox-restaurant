import { rateLimit } from 'express-rate-limit';

export interface RateLimitSettings {
  windowMs: number; // length of the counting window
  maxRequests: number; // requests allowed per client IP per window
}

// Counts requests per client IP in a fixed window (e.g. 100 per minute).
// Request 101 inside the window gets 429 Too Many Requests with a
// Retry-After header saying how many seconds until the window resets.
//
// The numbers are passed in (from config.rateLimit in app.ts), never
// written here, so they can change per environment without a code change.
export function createRateLimiter(settings: RateLimitSettings) {
  return rateLimit({
    windowMs: settings.windowMs,
    limit: settings.maxRequests,

    // Adds RateLimit and RateLimit-Policy headers (IETF draft 8) to every
    // response, so well-behaved clients can slow down before hitting 429.
    // Enabling standard headers is also what makes the library send
    // Retry-After on a 429.
    standardHeaders: 'draft-8',
    legacyHeaders: false, // no old X-RateLimit-* duplicates

    // The key is the client IP (req.ip), which is correct behind Render's
    // proxy only because app.ts sets "trust proxy". IPv6 addresses are
    // grouped by /56 subnet, because one IPv6 user can own billions of
    // addresses and would otherwise get unlimited fresh buckets.

    // Same error envelope as every other error in the API.
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: `Too many requests: the limit is ${settings.maxRequests} per ${settings.windowMs / 1000} seconds. Retry after the number of seconds in the Retry-After header.`,
        },
      });
    },
  });
}
