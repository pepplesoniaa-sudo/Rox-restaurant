import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { sendOne } from './http/envelope.js';
import { errorHandler, unknownRouteHandler } from './http/error-handler.js';
import { createRateLimiter, type RateLimitSettings } from './http/rate-limit.js';
import { customersRouter } from './modules/customers/routes.js';
import { menuItemsRouter } from './modules/menu-items/routes.js';
import { ordersRouter } from './modules/orders/routes.js';
import { restaurantsRouter } from './modules/restaurants/routes.js';

export interface AppOptions {
  rateLimit?: RateLimitSettings;
}

// Builds the Express app without starting it, so tests can use it directly.
// Options default to the values in config; a test can pass its own (e.g. a
// rate limit of 3 requests) without changing environment variables.
export function createApp(options: AppOptions = {}) {
  const app = express();

  // Do not advertise "X-Powered-By: Express" to the world.
  app.disable('x-powered-by');

  // How many proxies sit between the client and us. With this set, req.ip is
  // the real client IP from X-Forwarded-For instead of the proxy's IP.
  app.set('trust proxy', config.trustProxyHops);

  // CORS: lets the consumer page, served from another domain (Netlify),
  // read this API from a browser. Only origins listed in
  // CORS_ALLOWED_ORIGINS get the Access-Control-Allow-Origin header; for
  // any other site the browser blocks the response. Only GET is allowed
  // cross-origin, because the consumer only reads. curl and servers are not
  // affected: CORS is a rule browsers enforce, not an access control.
  // exposedHeaders: browsers hide most response headers from cross-origin
  // pages unless they are listed here. Without it, the consumer could not
  // read Retry-After on a 429 (found by testing the page in a browser).
  app.use(
    '/api',
    cors({
      origin: [...config.corsAllowedOrigins],
      methods: ['GET'],
      exposedHeaders: ['Retry-After', 'RateLimit', 'RateLimit-Policy'],
    }),
  );

  // Rate limit every API request, per client IP. It runs before the body is
  // parsed, so a flood of requests is turned away as cheaply as possible.
  // /health is outside /api on purpose: the host's health checks must never
  // be throttled into thinking the app is down.
  app.use('/api', createRateLimiter(options.rateLimit ?? config.rateLimit));

  // Parses JSON bodies. Anything larger than the limit is refused with 413
  // before it is read into memory.
  app.use(express.json({ limit: config.jsonBodyLimit }));

  // Liveness check for the hosting platform. Unversioned on purpose: it is
  // part of the infrastructure, not the public API contract.
  app.get('/health', (_req, res) => {
    sendOne(res, { status: 'ok' });
  });

  const v1 = express.Router();
  v1.use('/restaurants', restaurantsRouter);
  v1.use('/menu-items', menuItemsRouter);
  v1.use('/customers', customersRouter);
  v1.use('/orders', ordersRouter);
  app.use('/api/v1', v1);

  // Order matters: these two must come after every route.
  app.use(unknownRouteHandler);
  app.use(errorHandler);

  return app;
}
