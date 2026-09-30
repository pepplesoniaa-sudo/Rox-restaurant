// The brief's "Step 4: Handle the ugly inputs", one test per bullet,
// plus the neighbouring cases a reviewer is likely to try.
import { describe, expect, it } from 'vitest';
import { api, UNKNOWN_UUID } from './helpers.js';

describe('Step 4 of the brief: ugly inputs', () => {
  it('clamps a limit of 5000 to the maximum instead of honouring it', async () => {
    const res = await api().get('/api/v1/menu-items?limit=5000').expect(200);
    expect(res.body.meta.limit).toBe(100);
    expect(res.body.data).toHaveLength(100);
  });

  it('uses the default limit of 20 when none is given (never the whole collection)', async () => {
    const res = await api().get('/api/v1/menu-items').expect(200);
    expect(res.body.meta.limit).toBe(20);
    expect(res.body.data).toHaveLength(20);
  });

  it('returns 400 with a clear message for a negative offset', async () => {
    const res = await api().get('/api/v1/restaurants?offset=-1').expect(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.details).toEqual([
      { field: 'offset', issue: 'must be 0 or more (it is the number of rows to skip)' },
    ]);
  });

  it('returns 400 for an unknown sort field instead of silently sorting by nothing', async () => {
    const res = await api().get('/api/v1/restaurants?sort=rating').expect(400);
    expect(res.body.error.details).toEqual([
      { field: 'sort', issue: 'must be one of: name, createdAt, deliveryFeeKobo, minimumOrderKobo' },
    ]);
  });

  it.each(['restaurants', 'menu-items', 'customers', 'orders'])(
    'returns 400 (never 500) for a malformed id on /%s/:id',
    async (resource) => {
      const res = await api().get(`/api/v1/${resource}/not-a-uuid`).expect(400);
      expect(res.body.error.details[0]).toEqual({ field: 'id', issue: 'must be a valid UUID' });
    },
  );

  it.each(['restaurants', 'menu-items', 'customers', 'orders'])(
    'returns 404 for a well-formed id that does not exist on /%s/:id',
    async (resource) => {
      const res = await api().get(`/api/v1/${resource}/${UNKNOWN_UUID}`).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    },
  );

  it('returns 422 naming every missing required field on POST', async () => {
    const res = await api().post('/api/v1/orders').send({}).expect(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['customerId', 'restaurantId', 'deliveryAddress', 'items']));
    expect(res.body.error.details).toContainEqual({ field: 'customerId', issue: 'is required' });
  });
});

describe('other hostile inputs', () => {
  it.each([
    ['?limit=0', 'limit'],
    ['?limit=abc', 'limit'],
    ['?order=sideways', 'order'],
    ['?isOpen=yes', 'isOpen'],
    ['?cusine=pizza', 'cusine'], // typo: unknown parameter, not silently ignored
    ['?cursor=garbage', 'cursor'],
  ])('returns 400 for %s', async (query, field) => {
    const res = await api().get(`/api/v1/restaurants${query}`).expect(400);
    expect(res.body.error.details[0].field).toBe(field);
  });

  it('rejects a cursor created for a different sort', async () => {
    const page = await api().get('/api/v1/restaurants?limit=2&sort=name').expect(200);
    const res = await api()
      .get(`/api/v1/restaurants?limit=2&sort=deliveryFeeKobo&cursor=${page.body.meta.nextCursor}`)
      .expect(400);
    expect(res.body.error.details[0].field).toBe('cursor');
  });

  it('returns 400 for a body that is not valid JSON', async () => {
    const res = await api()
      .post('/api/v1/orders')
      .set('Content-Type', 'application/json')
      .send('{"customerId": ')
      .expect(400);
    expect(res.body.error.message).toBe('Request body is not valid JSON');
  });

  it('returns 413 for a body larger than JSON_BODY_LIMIT', async () => {
    await api().post('/api/v1/orders').send({ deliveryAddress: 'x'.repeat(200_000) }).expect(413);
  });

  it('returns 404 in the error envelope for an unknown route', async () => {
    const res = await api().get('/api/v1/nothing-here').expect(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'No route for GET /api/v1/nothing-here' } });
  });
});
