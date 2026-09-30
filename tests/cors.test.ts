import { describe, expect, it } from 'vitest';
import { api } from './helpers.js';

// vitest.config.ts sets CORS_ALLOWED_ORIGINS to this origin for tests.
const ALLOWED = 'https://consumer.example.test';

describe('CORS', () => {
  it('lets the allowed consumer origin read the API', async () => {
    const res = await api().get('/api/v1/restaurants?limit=1').set('Origin', ALLOWED).expect(200);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
  });

  it('exposes Retry-After and the rate-limit headers to the consumer', async () => {
    const res = await api().get('/api/v1/restaurants?limit=1').set('Origin', ALLOWED).expect(200);
    expect(res.headers['access-control-expose-headers']).toBe('Retry-After,RateLimit,RateLimit-Policy');
  });

  it('gives no CORS permission to any other website', async () => {
    const res = await api().get('/api/v1/restaurants?limit=1').set('Origin', 'https://evil.example').expect(200);
    // The request itself succeeds (CORS is enforced by browsers), but without
    // this header a browser refuses to hand the response to that site's code.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers the browser preflight for GET only', async () => {
    const res = await api()
      .options('/api/v1/restaurants')
      .set('Origin', ALLOWED)
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);
    expect(res.headers['access-control-allow-methods']).toBe('GET');
  });
});
