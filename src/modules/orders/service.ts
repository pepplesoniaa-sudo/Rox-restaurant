import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { ErrorDetail } from '../../http/errors.js';
import { conflict, notFound, validationFailed } from '../../http/errors.js';
import { buildPage, cursorWhere, orderByFor, toListParams } from '../../http/pagination.js';
import { generateOrderReference } from './reference.js';
import { orderListOptions, type CreateOrderBody, type OrderListQuery, type UpdateOrderBody } from './schemas.js';
import { addressEditableIn, allowedTransitions, canTransition, deletableIn } from './status.js';

// The public shape of an order. deliveryAddress is stored but deliberately
// NOT returned: this API is unauthenticated, and a public list of orders with
// home addresses would expose where customers live.
const orderSelect = {
  id: true,
  reference: true,
  customerId: true,
  restaurantId: true,
  status: true,
  subtotalKobo: true,
  deliveryFeeKobo: true,
  totalKobo: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrderSelect;

// A single order also carries its lines. The list leaves them out to keep
// list responses small; fetch GET /orders/:id for the detail.
const orderWithItemsSelect = {
  ...orderSelect,
  items: {
    select: {
      id: true,
      menuItemId: true,
      nameSnapshot: true,
      unitPriceKobo: true,
      quantity: true,
      lineTotalKobo: true,
      currency: true,
    },
    orderBy: { nameSnapshot: 'asc' },
  },
} satisfies Prisma.OrderSelect;

// ---------- Create ----------

export async function createOrder(body: CreateOrderBody) {
  // 1. Do the customer and restaurant exist?
  const [customer, restaurant] = await Promise.all([
    prisma.customer.findUnique({ where: { id: body.customerId }, select: { id: true } }),
    prisma.restaurant.findUnique({
      where: { id: body.restaurantId },
      select: { id: true, isOpen: true, deliveryFeeKobo: true, minimumOrderKobo: true, currency: true },
    }),
  ]);
  const problems: ErrorDetail[] = [];
  if (!customer) problems.push({ field: 'customerId', issue: 'does not match any customer' });
  if (!restaurant) problems.push({ field: 'restaurantId', issue: 'does not match any restaurant' });
  if (!restaurant) throw validationFailed('Order cannot be created', problems);
  if (!restaurant.isOpen) problems.push({ field: 'restaurantId', issue: 'restaurant is closed and not accepting orders' });

  // 2. Load the ordered dishes, but only from THIS restaurant's menu. A dish
  //    id from another restaurant simply isn't found, so it can't sneak in.
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: body.items.map((line) => line.menuItemId) }, restaurantId: restaurant.id },
    select: { id: true, name: true, priceKobo: true, currency: true, isAvailable: true },
  });
  const menuItemById = new Map(menuItems.map((item) => [item.id, item]));

  // 3. Check every line and price it from the menu. All problems are
  //    collected so the client can fix everything in one go.
  const lines = [];
  for (const [index, line] of body.items.entries()) {
    const menuItem = menuItemById.get(line.menuItemId);
    const field = `items.${index}.menuItemId`;
    if (!menuItem) {
      problems.push({ field, issue: "is not on this restaurant's menu" });
    } else if (!menuItem.isAvailable) {
      problems.push({ field, issue: 'is currently unavailable' });
    } else if (menuItem.currency !== restaurant.currency) {
      problems.push({ field, issue: `is priced in ${menuItem.currency}, but this restaurant uses ${restaurant.currency}` });
    } else {
      lines.push({
        menuItemId: menuItem.id,
        nameSnapshot: menuItem.name,
        unitPriceKobo: menuItem.priceKobo,
        quantity: line.quantity,
        lineTotalKobo: menuItem.priceKobo * line.quantity,
        currency: restaurant.currency,
      });
    }
  }
  if (problems.length > 0) throw validationFailed('Order cannot be created', problems);

  // 4. Totals, computed here from menu prices, never taken from the client.
  const subtotalKobo = lines.reduce((sum, line) => sum + line.lineTotalKobo, 0);
  if (subtotalKobo < restaurant.minimumOrderKobo) {
    throw validationFailed('Order cannot be created', [
      {
        field: 'items',
        issue: `subtotal of ${subtotalKobo} kobo is below this restaurant's minimum order of ${restaurant.minimumOrderKobo} kobo`,
      },
    ]);
  }

  // 5. Write the order and its lines in one statement. Prisma runs a nested
  //    create inside a transaction: either everything is saved or nothing is.
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.order.create({
        data: {
          reference: generateOrderReference(),
          customerId: body.customerId,
          restaurantId: restaurant.id,
          deliveryAddress: body.deliveryAddress,
          subtotalKobo,
          deliveryFeeKobo: restaurant.deliveryFeeKobo,
          totalKobo: subtotalKobo + restaurant.deliveryFeeKobo,
          currency: restaurant.currency,
          items: { create: lines },
        },
        select: orderWithItemsSelect,
      });
    } catch (error) {
      // P2002 = unique constraint violated. The only unique value generated
      // here is the random reference (duplicate dishes were rejected by the
      // schema), so a collision means "roll a new reference and try again".
      const referenceCollision = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!referenceCollision || attempt >= config.orders.referenceMaxAttempts) throw error;
    }
  }
}

// ---------- Read ----------

export async function listOrders(query: OrderListQuery) {
  const params = toListParams(query, orderListOptions);

  const createdAt: Prisma.DateTimeFilter = {
    ...(query.createdAfter !== undefined && { gte: query.createdAfter }),
    ...(query.createdBefore !== undefined && { lte: query.createdBefore }),
  };
  const filters: Prisma.OrderWhereInput = {
    ...(query.status !== undefined && { status: query.status }),
    ...(query.restaurantId !== undefined && { restaurantId: query.restaurantId }),
    ...(query.customerId !== undefined && { customerId: query.customerId }),
    ...(Object.keys(createdAt).length > 0 && { createdAt }),
  };
  const afterCursor = cursorWhere(params, orderListOptions.sortFields) as Prisma.OrderWhereInput | undefined;

  const [total, rows] = await Promise.all([
    prisma.order.count({ where: filters }),
    prisma.order.findMany({
      where: afterCursor ? { AND: [filters, afterCursor] } : filters,
      orderBy: orderByFor(params) as Prisma.OrderOrderByWithRelationInput[],
      skip: params.offset, // offset mode: skip N rows (undefined in cursor mode)
      take: params.limit + 1,
      select: orderSelect,
    }),
  ]);

  return buildPage(rows, params, total);
}

export async function getOrder(id: string) {
  return prisma.order.findUnique({ where: { id }, select: orderWithItemsSelect });
}

// ---------- Update ----------

export async function updateOrder(id: string, body: UpdateOrderBody) {
  // 1. What state is the order in right now?
  const current = await prisma.order.findUnique({ where: { id }, select: { status: true } });
  if (!current) throw notFound('Order not found');

  // 2. Is the requested change allowed from that state?
  if (body.status !== undefined && !canTransition(current.status, body.status)) {
    const allowed = allowedTransitions[current.status];
    throw conflict(`Cannot change status from ${current.status} to ${body.status}`, [
      {
        field: 'status',
        issue:
          allowed.length > 0
            ? `from ${current.status} the next status can only be: ${allowed.join(', ')}`
            : `${current.status} is final and cannot change`,
      },
    ]);
  }
  if (body.deliveryAddress !== undefined && !addressEditableIn.includes(current.status)) {
    throw conflict(`Cannot change the delivery address of a ${current.status} order`, [
      { field: 'deliveryAddress', issue: `can only change while the order is ${addressEditableIn.join(' or ')}` },
    ]);
  }

  // Same status and no address: nothing to change. Skip the write so that
  // repeating the request leaves even updatedAt untouched (true idempotency).
  if (body.deliveryAddress === undefined && body.status === current.status) {
    return prisma.order.findUniqueOrThrow({ where: { id }, select: orderWithItemsSelect });
  }

  // 3. Apply it, but only if the status is still what we checked in step 1.
  //    Between steps 1 and 3 another request may have moved the order on
  //    (e.g. cancelled it). Without this condition we would overwrite that
  //    change using a decision based on stale data. updateMany returns how
  //    many rows matched: 0 means someone else got there first.
  const { count } = await prisma.order.updateMany({
    where: { id, status: current.status },
    data: {
      ...(body.status !== undefined && { status: body.status }),
      ...(body.deliveryAddress !== undefined && { deliveryAddress: body.deliveryAddress }),
    },
  });
  if (count === 0) {
    throw conflict('Order was changed by another request at the same time; fetch it again and retry');
  }

  return prisma.order.findUniqueOrThrow({ where: { id }, select: orderWithItemsSelect });
}

// ---------- Delete ----------

export async function deleteOrder(id: string): Promise<void> {
  // One statement that deletes only if the order is in a deletable state.
  // Checking first and deleting second would leave a gap in which the order
  // could move to "preparing" and then be deleted anyway.
  // Its order_items rows go with it (onDelete: Cascade in the schema).
  const { count } = await prisma.order.deleteMany({
    where: { id, status: { in: [...deletableIn] } },
  });
  if (count === 1) return;

  // Nothing deleted: either there is no such order, or it is in a state that
  // must be kept. Find out which, so the client gets the honest status code.
  const existing = await prisma.order.findUnique({ where: { id }, select: { status: true } });
  if (!existing) throw notFound('Order not found');
  throw conflict(`Cannot delete a ${existing.status} order`, [
    { field: 'status', issue: `only ${deletableIn.join(' or ')} orders can be deleted` },
  ]);
}
