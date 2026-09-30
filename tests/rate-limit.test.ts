import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// A dedicated app with a tiny limit, so the test needs 4 requests, not 101.
// The production numbers come from config; only the size differs here.
const LIMIT = 3;
const WINDOW_MS = 60_000;
const app = createApp({ rateLimit: { windowMs: WINDOW_MS, maxRequests: LIMIT } });

// Each test uses its own fake client IP, sent the way Render's proxy sends
// it (X-Forwarded-For), so tests do not share a request counter.
const from = (ip: string) => ({
  get: (path: string) => request(app).get(path).set('X-Forwarded-For', ip),
});

describe('rate limiting', () => {
  it('answers 429 with Retry-After once the limit is exceeded', async () => {
    const client = from('203.0.113.10');
    for (let i = 0; i < LIMIT; i++) {
      await client.get('/api/v1/restaurants?limit=1').expect(200);
    }
    const blocked = await client.get('/api/v1/restaurants?limit=1').expect(429);

    expect(blocked.body).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: `Too many requests: the limit is ${LIMIT} per 60 seconds. Retry after the number of seconds in the Retry-After header.`,
      },
    });
    const retryAfter = Number(blocked.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(WINDOW_MS / 1000);
  });

  it('tells clients their remaining quota on normal responses', async () => {
    const res = await from('203.0.113.20').get('/api/v1/restaurants?limit=1').expect(200);
    expect(res.headers['ratelimit-policy']).toContain(`q=${LIMIT}`);
    expect(res.headers.ratelimit).toContain(`r=${LIMIT - 1}`);
  });

  it('counts each client IP separately', async () => {
    const noisy = from('203.0.113.30');
    for (let i = 0; i < LIMIT; i++) await noisy.get('/api/v1/customers?limit=1').expect(200);
    await noisy.get('/api/v1/customers?limit=1').expect(429);

    // A different client is unaffected by the noisy one.
    await from('203.0.113.31').get('/api/v1/customers?limit=1').expect(200);
  });

  it('never rate limits the /health check', async () => {
    const client = from('203.0.113.40');
    for (let i = 0; i < LIMIT + 5; i++) await client.get('/health').expect(200);
  });

  it('counts requests that fail validation too (abuse is still load)', async () => {
    const client = from('203.0.113.50');
    for (let i = 0; i < LIMIT; i++) await client.get('/api/v1/restaurants?sort=nonsense').expect(400);
    await client.get('/api/v1/restaurants').expect(429);
  });
});
