import request from 'supertest';
import { createApp } from '../src/app.js';

// One app instance per test file. supertest sends requests straight into it
// without opening a network port.
export const app = createApp();
export const api = () => request(app);

// Fetch the first row of a list endpoint, e.g. an open restaurant.
export async function first<T = Record<string, unknown>>(path: string): Promise<T> {
  const res = await api().get(path).expect(200);
  const row = res.body.data[0];
  if (!row) throw new Error(`Test setup: ${path} returned no rows`);
  return row as T;
}

// A valid order body built from real seeded rows: an open restaurant with
// no minimum order, one of its available dishes, and any customer.
export async function validOrderBody() {
  const restaurant = await first<{ id: string }>('/api/v1/restaurants?isOpen=true&sort=minimumOrderKobo&limit=1');
  const dish = await first<{ id: string }>(`/api/v1/restaurants/${restaurant.id}/menu?isAvailable=true&sort=priceKobo&order=desc&limit=1`);
  const customer = await first<{ id: string }>('/api/v1/customers?limit=1');
  return {
    customerId: customer.id,
    restaurantId: restaurant.id,
    deliveryAddress: '14 Rumuola Road, Rumuola, Port Harcourt',
    items: [{ menuItemId: dish.id, quantity: 2 }],
  };
}

export const UNKNOWN_UUID = '019590a0-0000-7000-8000-000000000001';
