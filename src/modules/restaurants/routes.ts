import { Router } from 'express';
import { sendList, sendOne } from '../../http/envelope.js';
import { notFound } from '../../http/errors.js';
import { idParamSchema, parsePath, parseQuery } from '../../http/validate.js';
import { restaurantMenuQuerySchema } from '../menu-items/schemas.js';
import { listMenuItems } from '../menu-items/service.js';
import { restaurantListQuerySchema } from './schemas.js';
import { getRestaurant, listRestaurants } from './service.js';

// Handlers stay thin: validate input, call the service, send the envelope.
// Any thrown ApiError is turned into the error envelope by errorHandler.

export const restaurantsRouter = Router();

// GET /api/v1/restaurants
restaurantsRouter.get('/', async (req, res) => {
  const query = parseQuery(restaurantListQuerySchema, req.query);
  const page = await listRestaurants(query);
  sendList(res, page.data, page.meta);
});

// GET /api/v1/restaurants/:id
restaurantsRouter.get('/:id', async (req, res) => {
  const { id } = parsePath(idParamSchema, req.params);
  const restaurant = await getRestaurant(id);
  if (!restaurant) throw notFound('Restaurant not found');
  sendOne(res, restaurant);
});

// GET /api/v1/restaurants/:id/menu
// Same filters, sorting and pagination as /menu-items, scoped to one restaurant.
restaurantsRouter.get('/:id/menu', async (req, res) => {
  const { id } = parsePath(idParamSchema, req.params);
  const query = parseQuery(restaurantMenuQuerySchema, req.query);
  // An unknown restaurant is a 404, not an empty menu: "this restaurant has
  // no dishes" and "this restaurant does not exist" are different answers.
  if (!(await getRestaurant(id))) throw notFound('Restaurant not found');
  const page = await listMenuItems({ ...query, restaurantId: id });
  sendList(res, page.data, page.meta);
});
