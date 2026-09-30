import { Router } from 'express';
import { sendList, sendOne } from '../../http/envelope.js';
import { notFound } from '../../http/errors.js';
import { idParamSchema, parseBody, parsePath, parseQuery } from '../../http/validate.js';
import { createOrderBodySchema, orderListQuerySchema, updateOrderBodySchema } from './schemas.js';
import { createOrder, deleteOrder, getOrder, listOrders, updateOrder } from './service.js';

export const ordersRouter = Router();

// GET /api/v1/orders
ordersRouter.get('/', async (req, res) => {
  const query = parseQuery(orderListQuerySchema, req.query);
  const page = await listOrders(query);
  sendList(res, page.data, page.meta);
});

// POST /api/v1/orders  ->  201 Created, Location: /api/v1/orders/:id
ordersRouter.post('/', async (req, res) => {
  const body = parseBody(createOrderBodySchema, req.body);
  const order = await createOrder(body);
  res.location(`${req.baseUrl}/${order.id}`);
  sendOne(res, order, 201);
});

// GET /api/v1/orders/:id
ordersRouter.get('/:id', async (req, res) => {
  const { id } = parsePath(idParamSchema, req.params);
  const order = await getOrder(id);
  if (!order) throw notFound('Order not found');
  sendOne(res, order);
});

// PATCH /api/v1/orders/:id  ->  200 with the updated order
ordersRouter.patch('/:id', async (req, res) => {
  const { id } = parsePath(idParamSchema, req.params);
  const body = parseBody(updateOrderBodySchema, req.body);
  const order = await updateOrder(id, body);
  sendOne(res, order);
});

// DELETE /api/v1/orders/:id  ->  204 No Content (no body)
ordersRouter.delete('/:id', async (req, res) => {
  const { id } = parsePath(idParamSchema, req.params);
  await deleteOrder(id);
  res.status(204).end();
});
