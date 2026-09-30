import { prisma } from '../../db.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { buildPage, cursorWhere, orderByFor, toListParams } from '../../http/pagination.js';
import { menuItemListOptions, type MenuItemListQuery } from './schemas.js';

const menuItemSelect = {
  id: true,
  restaurantId: true,
  name: true,
  description: true,
  category: true,
  priceKobo: true,
  currency: true,
  isAvailable: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MenuItemSelect;

// Used by both GET /menu-items and GET /restaurants/:id/menu.
// The nested route passes the restaurant id from the path in the query.
export async function listMenuItems(query: MenuItemListQuery) {
  const params = toListParams(query, menuItemListOptions);

  // Both price bounds may be sent, so they are merged into one condition.
  const priceRange: Prisma.IntFilter = {
    ...(query.minPriceKobo !== undefined && { gte: query.minPriceKobo }),
    ...(query.maxPriceKobo !== undefined && { lte: query.maxPriceKobo }),
  };
  const filters: Prisma.MenuItemWhereInput = {
    ...(query.restaurantId !== undefined && { restaurantId: query.restaurantId }),
    ...(query.category !== undefined && { category: query.category }),
    ...(Object.keys(priceRange).length > 0 && { priceKobo: priceRange }),
    ...(query.isAvailable !== undefined && { isAvailable: query.isAvailable }),
  };
  const afterCursor = cursorWhere(params, menuItemListOptions.sortFields) as Prisma.MenuItemWhereInput | undefined;

  const [total, rows] = await Promise.all([
    prisma.menuItem.count({ where: filters }),
    prisma.menuItem.findMany({
      where: afterCursor ? { AND: [filters, afterCursor] } : filters,
      orderBy: orderByFor(params) as Prisma.MenuItemOrderByWithRelationInput[],
      skip: params.offset, // offset mode: skip N rows (undefined in cursor mode)
      take: params.limit + 1,
      select: menuItemSelect,
    }),
  ]);

  return buildPage(rows, params, total);
}

export async function getMenuItem(id: string) {
  return prisma.menuItem.findUnique({ where: { id }, select: menuItemSelect });
}
