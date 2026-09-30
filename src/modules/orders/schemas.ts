import { z } from 'zod';
import { config } from '../../config.js';
import { OrderStatus } from '../../generated/prisma/enums.js';
import { paginationQueryShape, type ListOptions } from '../../http/pagination.js';

// ---------- POST /orders body ----------

// Zod calls this for the type check. input === undefined means the field was
// missing, which deserves a clearer message than "expected string".
const uuidField = z.uuid({
  error: (issue) => (issue.input === undefined ? 'is required' : 'must be a valid UUID'),
});

const orderLineSchema = z.strictObject({
  menuItemId: uuidField,
  quantity: z
    .int({ error: (issue) => (issue.input === undefined ? 'is required' : 'must be a whole number') })
    .min(1, { error: 'must be at least 1' })
    .max(config.orders.maxQuantityPerLine, {
      error: `must be at most ${config.orders.maxQuantityPerLine}`,
    }),
});

// Shared by create and update.
const deliveryAddressField = z
  .string({ error: (issue) => (issue.input === undefined ? 'is required' : 'must be text') })
  .trim()
  .min(5, { error: 'must be at least 5 characters' })
  .max(300, { error: 'must be at most 300 characters' });

// strictObject: a client sending "totalKobo" or "priceKobo" gets a 422.
// Prices always come from the menu, never from the client.
export const createOrderBodySchema = z
  .strictObject({
    customerId: uuidField,
    restaurantId: uuidField,
    deliveryAddress: deliveryAddressField,
    items: z
      .array(orderLineSchema, {
        error: (issue) => (issue.input === undefined ? 'is required' : 'must be a list of items'),
      })
      .min(1, { error: 'must contain at least one item' })
      .max(config.orders.maxLines, { error: `must contain at most ${config.orders.maxLines} items` }),
  })
  .superRefine((body, ctx) => {
    // The same dish twice is a mistake: the database's unique (orderId,
    // menuItemId) would reject it anyway. Catch it here with a clear field path.
    const seen = new Set<string>();
    body.items.forEach((line, index) => {
      if (seen.has(line.menuItemId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'menuItemId'],
          message: 'appears more than once; increase quantity instead',
        });
      }
      seen.add(line.menuItemId);
    });
  });

export type CreateOrderBody = z.output<typeof createOrderBodySchema>;

// ---------- PATCH /orders/:id body ----------

// Only these two fields can change after an order is placed. Items, prices,
// customer and restaurant are fixed: changing them is a new order. strictObject
// turns an attempt like {"totalKobo": 1} into a 422.
export const updateOrderBodySchema = z
  .strictObject({
    status: z
      .enum(OrderStatus, { error: `must be one of: ${Object.values(OrderStatus).join(', ')}` })
      .optional(),
    deliveryAddress: deliveryAddressField.optional(),
  })
  .refine((body) => body.status !== undefined || body.deliveryAddress !== undefined, {
    error: 'must include at least one of: status, deliveryAddress',
  });

export type UpdateOrderBody = z.output<typeof updateOrderBodySchema>;

// ---------- GET /orders query ----------

export const orderListOptions: ListOptions<'createdAt' | 'totalKobo'> = {
  sortFields: {
    createdAt: 'date',
    totalKobo: 'number',
  },
  defaultSort: 'createdAt',
  defaultOrder: 'desc', // newest orders first
};

const isoDateTime = z.iso
  .datetime({ offset: true, error: 'must be an ISO 8601 date-time, e.g. 2026-09-01T00:00:00Z' })
  .transform((value) => new Date(value));

export const orderListQuerySchema = z
  .strictObject({
    ...paginationQueryShape(orderListOptions),
    status: z.enum(OrderStatus, { error: `must be one of: ${Object.values(OrderStatus).join(', ')}` }).optional(),
    restaurantId: z.uuid({ error: 'must be a valid UUID' }).optional(),
    customerId: z.uuid({ error: 'must be a valid UUID' }).optional(),
    createdAfter: isoDateTime.optional(),
    createdBefore: isoDateTime.optional(),
  })
  .refine((q) => !q.createdAfter || !q.createdBefore || q.createdAfter <= q.createdBefore, {
    error: 'must not be later than createdBefore',
    path: ['createdAfter'],
  });

export type OrderListQuery = z.output<typeof orderListQuerySchema>;
