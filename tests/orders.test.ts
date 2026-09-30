import { describe, expect, it } from 'vitest';
import { api, first, UNKNOWN_UUID, validOrderBody } from './helpers.js';

async function createOrder() {
  const res = await api().post('/api/v1/orders').send(await validOrderBody()).expect(201);
  return res.body.data as { id: string; status: string; totalKobo: number };
}

const patch = (id: string, body: object) => api().patch(`/api/v1/orders/${id}`).send(body);

describe('POST /orders', () => {
  it('creates an order priced from the menu, with a Location header', async () => {
    const body = await validOrderBody();
    const dish = (await api().get(`/api/v1/menu-items/${body.items[0]!.menuItemId}`)).body.data;
    const restaurant = (await api().get(`/api/v1/restaurants/${body.restaurantId}`)).body.data;

    const res = await api().post('/api/v1/orders').send(body).expect(201);
    const order = res.body.data;

    expect(res.headers.location).toBe(`/api/v1/orders/${order.id}`);
    expect(order.status).toBe('pending');
    expect(order.reference).toMatch(/^ROX-[2-9A-HJ-NP-Z]{8}$/);
    expect(order.subtotalKobo).toBe(dish.priceKobo * 2);
    expect(order.deliveryFeeKobo).toBe(restaurant.deliveryFeeKobo);
    expect(order.totalKobo).toBe(order.subtotalKobo + order.deliveryFeeKobo);
    expect(order.items[0]).toMatchObject({ nameSnapshot: dish.name, unitPriceKobo: dish.priceKobo, quantity: 2 });
    expect(order).not.toHaveProperty('deliveryAddress');
  });

  it('rejects a client-supplied price field', async () => {
    const res = await api().post('/api/v1/orders').send({ ...(await validOrderBody()), totalKobo: 1 }).expect(422);
    expect(res.body.error.details).toContainEqual({ field: 'totalKobo', issue: 'is not a recognised field' });
  });

  it('reports every bad line at once, with its path', async () => {
    const body = await validOrderBody();
    const id = body.items[0]!.menuItemId;
    const res = await api()
      .post('/api/v1/orders')
      .send({ ...body, items: [{ menuItemId: id, quantity: 0 }, { menuItemId: id, quantity: 1000 }] })
      .expect(422);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['items.0.quantity', 'items.1.quantity', 'items.1.menuItemId']));
  });

  it("rejects a dish from another restaurant's menu", async () => {
    const body = await validOrderBody();
    const otherDish = await first<{ id: string; restaurantId: string }>(
      `/api/v1/menu-items?limit=1&sort=priceKobo&order=desc`,
    );
    expect(otherDish.restaurantId).not.toBe(body.restaurantId);
    const res = await api()
      .post('/api/v1/orders')
      .send({ ...body, items: [{ menuItemId: otherDish.id, quantity: 1 }] })
      .expect(422);
    expect(res.body.error.details).toContainEqual({ field: 'items.0.menuItemId', issue: "is not on this restaurant's menu" });
  });

  it('rejects an order at a closed restaurant', async () => {
    const closed = await first<{ id: string }>('/api/v1/restaurants?isOpen=false&limit=1');
    const dish = await first<{ id: string }>(`/api/v1/restaurants/${closed.id}/menu?limit=1`);
    const res = await api()
      .post('/api/v1/orders')
      .send({ ...(await validOrderBody()), restaurantId: closed.id, items: [{ menuItemId: dish.id, quantity: 1 }] })
      .expect(422);
    expect(res.body.error.details[0].issue).toMatch(/closed/);
  });

  it('rejects unknown customer and restaurant ids with 422, naming both', async () => {
    const res = await api()
      .post('/api/v1/orders')
      .send({ ...(await validOrderBody()), customerId: UNKNOWN_UUID, restaurantId: UNKNOWN_UUID })
      .expect(422);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(['customerId', 'restaurantId']);
  });
});

describe('PATCH /orders/:id — status state machine', () => {
  it('walks the full happy path', async () => {
    const order = await createOrder();
    for (const status of ['confirmed', 'preparing', 'out_for_delivery', 'delivered']) {
      const res = await patch(order.id, { status }).expect(200);
      expect(res.body.data.status).toBe(status);
    }
  });

  it.each([
    [['confirmed', 'preparing'], 'cancelled'], // too late to cancel
    [[], 'delivered'], // skipping steps
    [['confirmed', 'preparing', 'out_for_delivery', 'delivered'], 'pending'], // backwards from final
    [['cancelled'], 'confirmed'], // leaving a final state
  ])('after %j, moving to %s is a 409', async (path, target) => {
    const order = await createOrder();
    for (const status of path) await patch(order.id, { status }).expect(200);
    const res = await patch(order.id, { status: target }).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('treats setting the current status as a no-op that leaves updatedAt unchanged', async () => {
    const order = await createOrder();
    const before = (await patch(order.id, { status: 'confirmed' }).expect(200)).body.data.updatedAt;
    const after = (await patch(order.id, { status: 'confirmed' }).expect(200)).body.data.updatedAt;
    expect(after).toBe(before);
  });

  it('allows an address change while confirmed, but not once preparing', async () => {
    const order = await createOrder();
    await patch(order.id, { status: 'confirmed' }).expect(200);
    await patch(order.id, { deliveryAddress: '22 Woji Road, Woji, Port Harcourt' }).expect(200);
    await patch(order.id, { status: 'preparing' }).expect(200);
    await patch(order.id, { deliveryAddress: '10 Other Road, Ikeja' }).expect(409);
  });

  it('never lets two simultaneous changes both believe they won', async () => {
    for (let i = 0; i < 10; i++) {
      const order = await createOrder();
      const [confirm, cancel] = await Promise.all([
        patch(order.id, { status: 'confirmed' }),
        patch(order.id, { status: 'cancelled' }),
      ]);
      const final = (await api().get(`/api/v1/orders/${order.id}`)).body.data.status;
      // Every response of 200 must agree with the final state, unless the two
      // ran one after the other (confirm then cancel, which is legal).
      if (confirm.status === 200 && cancel.status === 200) expect(final).toBe('cancelled');
      if (cancel.status === 409) expect(final).toBe('confirmed');
      if (confirm.status === 409) expect(final).toBe('cancelled');
      expect([confirm.status, cancel.status]).toContain(200);
    }
  });

  it('rejects an empty body and unknown fields with 422', async () => {
    const order = await createOrder();
    await patch(order.id, {}).expect(422);
    await patch(order.id, { totalKobo: 1 }).expect(422);
  });
});

describe('DELETE /orders/:id', () => {
  it('deletes a pending order with 204 and no body; a second delete is 404', async () => {
    const order = await createOrder();
    const res = await api().delete(`/api/v1/orders/${order.id}`).expect(204);
    expect(res.text).toBe('');
    await api().get(`/api/v1/orders/${order.id}`).expect(404);
    await api().delete(`/api/v1/orders/${order.id}`).expect(404);
  });

  it('refuses to delete a delivered order (409)', async () => {
    const delivered = await first<{ id: string }>('/api/v1/orders?status=delivered&limit=1');
    await api().delete(`/api/v1/orders/${delivered.id}`).expect(409);
  });
});
