import { prisma } from '../../db.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { buildPage, cursorWhere, orderByFor, toListParams } from '../../http/pagination.js';
import { restaurantListOptions, type RestaurantListQuery } from './schemas.js';

// The public shape of a restaurant. Listing fields explicitly means a new
// internal column never leaks into responses by accident.
const restaurantSelect = {
  id: true,
  slug: true,
  name: true,
  cuisine: true,
  area: true,
  address: true,
  isOpen: true,
  deliveryFeeKobo: true,
  minimumOrderKobo: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RestaurantSelect;

export async function listRestaurants(query: RestaurantListQuery) {
  const params = toListParams(query, restaurantListOptions);

  // Only filters the client actually sent are added.
  const filters: Prisma.RestaurantWhereInput = {
    ...(query.cuisine !== undefined && { cuisine: query.cuisine }),
    ...(query.area !== undefined && { area: { equals: query.area, mode: 'insensitive' } }),
    ...(query.isOpen !== undefined && { isOpen: query.isOpen }),
    ...(query.maxDeliveryFeeKobo !== undefined && { deliveryFeeKobo: { lte: query.maxDeliveryFeeKobo } }),
  };
  const afterCursor = cursorWhere(params, restaurantListOptions.sortFields) as Prisma.RestaurantWhereInput | undefined;

  const [total, rows] = await Promise.all([
    // total counts every match across all pages, so it ignores the cursor.
    prisma.restaurant.count({ where: filters }),
    prisma.restaurant.findMany({
      where: afterCursor ? { AND: [filters, afterCursor] } : filters,
      orderBy: orderByFor(params) as Prisma.RestaurantOrderByWithRelationInput[],
      skip: params.offset, // offset mode: skip N rows (undefined in cursor mode)
      take: params.limit + 1, // one extra row tells us whether a next page exists
      select: restaurantSelect,
    }),
  ]);

  return buildPage(rows, params, total);
}

export async function getRestaurant(id: string) {
  return prisma.restaurant.findUnique({ where: { id }, select: restaurantSelect });
}
