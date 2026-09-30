import { prisma } from '../../db.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { buildPage, cursorWhere, orderByFor, toListParams } from '../../http/pagination.js';
import { customerListOptions, type CustomerListQuery } from './schemas.js';

// email and phone are deliberately absent. This is an unauthenticated public
// API, so personal contact details must never leave the database.
const customerSelect = {
  id: true,
  name: true,
  area: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerSelect;

export async function listCustomers(query: CustomerListQuery) {
  const params = toListParams(query, customerListOptions);

  const filters: Prisma.CustomerWhereInput = {
    ...(query.area !== undefined && { area: { equals: query.area, mode: 'insensitive' } }),
    ...(query.name !== undefined && { name: { contains: query.name, mode: 'insensitive' } }),
  };
  const afterCursor = cursorWhere(params, customerListOptions.sortFields) as Prisma.CustomerWhereInput | undefined;

  const [total, rows] = await Promise.all([
    prisma.customer.count({ where: filters }),
    prisma.customer.findMany({
      where: afterCursor ? { AND: [filters, afterCursor] } : filters,
      orderBy: orderByFor(params) as Prisma.CustomerOrderByWithRelationInput[],
      skip: params.offset, // offset mode: skip N rows (undefined in cursor mode)
      take: params.limit + 1,
      select: customerSelect,
    }),
  ]);

  return buildPage(rows, params, total);
}

export async function getCustomer(id: string) {
  return prisma.customer.findUnique({ where: { id }, select: customerSelect });
}
