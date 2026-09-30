import { describe, expect, it } from 'vitest';
import { api } from './helpers.js';

interface Row {
  id: string;
  [key: string]: unknown;
}

// Follows nextCursor until the last page and returns every row seen.
async function walk(path: string, limit: number) {
  const rows: Row[] = [];
  let cursor: string | null = null;
  let total = 0;
  do {
    const sep = path.includes('?') ? '&' : '?';
    const res: { body: { data: Row[]; meta: { total: number; nextCursor: string | null } } } = await api()
      .get(`${path}${sep}limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`)
      .expect(200);
    rows.push(...res.body.data);
    total = res.body.meta.total;
    cursor = res.body.meta.nextCursor;
  } while (cursor);
  return { rows, total };
}

describe('cursor pagination', () => {
  it.each([
    '/api/v1/restaurants?sort=deliveryFeeKobo&order=desc', // many ties on fee
    '/api/v1/menu-items?sort=priceKobo',
    '/api/v1/menu-items?sort=createdAt&order=desc', // seeded rows share timestamps
    '/api/v1/customers?sort=name',
    '/api/v1/orders?sort=totalKobo&order=desc',
  ])('walks %s page by page with no gaps and no duplicates', async (path) => {
    const { rows, total } = await walk(path, 7);
    expect(rows.length).toBe(total);
    expect(new Set(rows.map((r) => r.id)).size).toBe(total);
  });

  it('keeps filters applied on every page', async () => {
    const { rows } = await walk('/api/v1/menu-items?category=drinks&maxPriceKobo=150000', 5);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.category).toBe('drinks');
      expect(row.priceKobo as number).toBeLessThanOrEqual(150000);
    }
  });

  it('reports hasMore and nextCursor honestly on the last page', async () => {
    const all = await api().get('/api/v1/restaurants?limit=100').expect(200);
    expect(all.body.meta).toMatchObject({ hasMore: false, nextCursor: null });
    expect(all.body.data.length).toBe(all.body.meta.total);
  });

  it('returns an empty page, not an error, for a cursor past the end', async () => {
    const pastTheEnd = Buffer.from(
      JSON.stringify({ sort: 'name', order: 'asc', value: 'zzzz', id: '01a0f0af-3caa-73f8-bd93-ea2d70b1f9d8' }),
    ).toString('base64url');
    const res = await api().get(`/api/v1/restaurants?cursor=${pastTheEnd}`).expect(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.hasMore).toBe(false);
  });
});

describe('offset pagination (the alternative to cursors)', () => {
  it('offset=0 returns the same first page as no offset', async () => {
    const plain = await api().get('/api/v1/menu-items?sort=priceKobo&limit=5').expect(200);
    const zero = await api().get('/api/v1/menu-items?sort=priceKobo&limit=5&offset=0').expect(200);
    expect(zero.body.data).toEqual(plain.body.data);
  });

  it('offset=N skips exactly N rows of the same ordering', async () => {
    const first10 = await api().get('/api/v1/menu-items?sort=priceKobo&limit=10').expect(200);
    const from5 = await api().get('/api/v1/menu-items?sort=priceKobo&limit=5&offset=5').expect(200);
    expect(from5.body.data).toEqual(first10.body.data.slice(5, 10));
  });

  it('walks a whole list by offset with no gaps or duplicates when nothing changes', async () => {
    const ids: string[] = [];
    let total = 0;
    for (let offset = 0; ; offset += 7) {
      const res = await api().get(`/api/v1/restaurants?sort=deliveryFeeKobo&limit=7&offset=${offset}`).expect(200);
      ids.push(...res.body.data.map((r: Row) => r.id));
      total = res.body.meta.total;
      if (!res.body.meta.hasMore) break;
    }
    expect(ids.length).toBe(total);
    expect(new Set(ids).size).toBe(total);
  });

  it('returns an empty page, not an error, for an offset past the end ("page 50 of 30")', async () => {
    const res = await api().get('/api/v1/restaurants?offset=100000').expect(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.hasMore).toBe(false);
    expect(res.body.meta.total).toBeGreaterThan(0); // the collection exists; this page is just empty
  });

  it('rejects offset combined with cursor', async () => {
    const page = await api().get('/api/v1/restaurants?limit=2').expect(200);
    const res = await api().get(`/api/v1/restaurants?limit=2&offset=2&cursor=${page.body.meta.nextCursor}`).expect(400);
    expect(res.body.error.details).toEqual([
      { field: 'offset', issue: 'cannot be combined with cursor; use one or the other' },
    ]);
  });

  it.each(['abc', '1.5'])('rejects offset=%s with 400', async (value) => {
    const res = await api().get(`/api/v1/restaurants?offset=${value}`).expect(400);
    expect(res.body.error.details[0].field).toBe('offset');
  });

  it('shows the drift problem: an insert moves offset pages but not cursor pages', async () => {
    // Newest orders first. Remember what page 2 looks like both ways.
    const page1 = await api().get('/api/v1/orders?limit=5').expect(200);
    const byOffsetBefore = await api().get('/api/v1/orders?limit=5&offset=5').expect(200);
    const byCursorBefore = await api()
      .get(`/api/v1/orders?limit=5&cursor=${page1.body.meta.nextCursor}`)
      .expect(200);

    // Someone places an order: it becomes the newest row, at the very top.
    const { validOrderBody } = await import('./helpers.js');
    await api().post('/api/v1/orders').send(await validOrderBody()).expect(201);

    const byOffsetAfter = await api().get('/api/v1/orders?limit=5&offset=5').expect(200);
    const byCursorAfter = await api()
      .get(`/api/v1/orders?limit=5&cursor=${page1.body.meta.nextCursor}`)
      .expect(200);

    // Offset page 2 shifted by one: its first row is page 1's old last row,
    // which this client has already seen (a duplicate).
    expect(byOffsetAfter.body.data[0].id).toBe(page1.body.data[4].id);
    expect(byOffsetAfter.body.data).not.toEqual(byOffsetBefore.body.data);
    // Cursor page 2 is unchanged: "after this row" is not moved by the insert.
    expect(byCursorAfter.body.data).toEqual(byCursorBefore.body.data);
  });
});

describe('response envelopes', () => {
  it.each(['restaurants', 'menu-items', 'customers', 'orders'])('every list (/%s) has the same shape', async (resource) => {
    const res = await api().get(`/api/v1/${resource}?limit=1`).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(['data', 'meta']);
    expect(Object.keys(res.body.meta).sort()).toEqual(['hasMore', 'limit', 'nextCursor', 'total']);
  });

  it('never exposes customer email or phone, or order delivery addresses', async () => {
    const customers = await api().get('/api/v1/customers?limit=100').expect(200);
    const orders = await api().get('/api/v1/orders?limit=100').expect(200);
    const text = JSON.stringify([customers.body, orders.body]);
    expect(text).not.toMatch(/email|phone|deliveryAddress|@example\.com/);
  });
});
