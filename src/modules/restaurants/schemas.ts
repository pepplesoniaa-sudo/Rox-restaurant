import { z } from 'zod';
import { paginationQueryShape, type ListOptions } from '../../http/pagination.js';
import { booleanQueryParam } from '../../http/validate.js';

export const restaurantListOptions: ListOptions<'name' | 'createdAt' | 'deliveryFeeKobo' | 'minimumOrderKobo'> = {
  sortFields: {
    name: 'string',
    createdAt: 'date',
    deliveryFeeKobo: 'number',
    minimumOrderKobo: 'number',
  },
  defaultSort: 'name',
  defaultOrder: 'asc',
};

// strictObject: an unknown parameter such as ?cusine=pizza (typo) is a 400,
// not silently ignored while returning unfiltered results.
export const restaurantListQuerySchema = z.strictObject({
  ...paginationQueryShape(restaurantListOptions),
  cuisine: z.string().trim().toLowerCase().min(1).optional(),
  // Port Harcourt area, exact match ignoring case: ?area=rumuola matches "Rumuola".
  area: z.string().trim().min(1).optional(),
  isOpen: booleanQueryParam.optional(),
  maxDeliveryFeeKobo: z.coerce.number({ error: 'must be a number' }).int().min(0).optional(),
});

export type RestaurantListQuery = z.output<typeof restaurantListQuerySchema>;
