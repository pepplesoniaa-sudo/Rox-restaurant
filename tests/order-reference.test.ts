// Order references are random, so a collision cannot be produced on demand.
// This file replaces the generator with a scripted one to force collisions
// and prove the retry loop in createOrder behaves.
import { describe, expect, it, vi } from 'vitest';

const scripted = vi.hoisted(() => ({ queue: [] as string[] }));

vi.mock('../src/modules/orders/reference.js', () => ({
  generateOrderReference: () => {
    const next = scripted.queue.shift();
    if (!next) throw new Error('Test ran out of scripted references');
    return next;
  },
}));

const { api, first, validOrderBody } = await import('./helpers.js');

describe('order reference collisions', () => {
  it('retries with a new reference when the first one already exists', async () => {
    const existing = await first<{ reference: string }>('/api/v1/orders?limit=1');
    scripted.queue = [existing.reference, 'ROX-RETRY234'];

    const res = await api().post('/api/v1/orders').send(await validOrderBody()).expect(201);
    expect(res.body.data.reference).toBe('ROX-RETRY234');
    expect(scripted.queue).toHaveLength(0); // both references were used
  });

  it('gives up after ORDER_REFERENCE_MAX_ATTEMPTS (3) collisions with a 500', async () => {
    const existing = await first<{ reference: string }>('/api/v1/orders?limit=1');
    scripted.queue = [existing.reference, existing.reference, existing.reference, 'ROX-NEVERUSED'];

    const res = await api().post('/api/v1/orders').send(await validOrderBody()).expect(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(scripted.queue).toEqual(['ROX-NEVERUSED']); // exactly 3 attempts were made
  });
});
