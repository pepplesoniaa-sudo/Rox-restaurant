import { z } from 'zod';
import { paginationQueryShape, type ListOptions } from '../../http/pagination.js';

export const customerListOptions: ListOptions<'name' | 'createdAt'> = {
  sortFields: {
    name: 'string',
    createdAt: 'date',
  },
  defaultSort: 'createdAt',
  defaultOrder: 'desc',
};

export const customerListQuerySchema = z.strictObject({
  ...paginationQueryShape(customerListOptions),
  // Port Harcourt area, exact match ignoring case: ?area=rumuola matches "Rumuola".
  area: z.string().trim().min(1).optional(),
  // Partial, case-insensitive match: ?name=ade finds "Adebayo" and "Tunde Adeyemi".
  name: z.string().trim().min(2, { error: 'must be at least 2 characters' }).optional(),
});

export type CustomerListQuery = z.output<typeof customerListQuerySchema>;
