import { z } from 'zod';
import { paginationQueryShape, type ListOptions } from '../../http/pagination.js';
import { booleanQueryParam } from '../../http/validate.js';

export const menuItemListOptions: ListOptions<'name' | 'priceKobo' | 'createdAt'> = {
  sortFields: {
    name: 'string',
    priceKobo: 'number',
    createdAt: 'date',
  },
  defaultSort: 'name',
  defaultOrder: 'asc',
};

const koboParam = z.coerce
  .number({ error: 'must be a whole number of kobo' })
  .int({ error: 'must be a whole number of kobo' })
  .min(0, { error: 'must be 0 or more' });

// Filters shared by both menu endpoints.
const menuFilterShape = {
  ...paginationQueryShape(menuItemListOptions),
  category: z.string().trim().toLowerCase().min(1).optional(),
  minPriceKobo: koboParam.optional(),
  maxPriceKobo: koboParam.optional(),
  isAvailable: booleanQueryParam.optional(),
};

// A price range where min is above max can never match anything: that is
// a mistake in the request, so say so instead of returning an empty list.
const priceRangeIsValid = (q: { minPriceKobo?: number | undefined; maxPriceKobo?: number | undefined }) =>
  q.minPriceKobo === undefined || q.maxPriceKobo === undefined || q.minPriceKobo <= q.maxPriceKobo;
const priceRangeError = { error: 'must not be greater than maxPriceKobo', path: ['minPriceKobo'] };

// GET /api/v1/menu-items: every restaurant's dishes, optionally narrowed to one.
export const menuItemListQuerySchema = z
  .strictObject({ ...menuFilterShape, restaurantId: z.uuid({ error: 'must be a valid UUID' }).optional() })
  .refine(priceRangeIsValid, priceRangeError);

// GET /api/v1/restaurants/:id/menu: the restaurant comes from the path, so
// restaurantId in the query string would be redundant (and is rejected).
export const restaurantMenuQuerySchema = z.strictObject(menuFilterShape).refine(priceRangeIsValid, priceRangeError);

export type MenuItemListQuery = z.output<typeof menuItemListQuerySchema>;
