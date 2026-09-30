import { Router } from 'express';
import { sendList, sendOne } from '../../http/envelope.js';
import { notFound } from '../../http/errors.js';
import { idParamSchema, parsePath, parseQuery } from '../../http/validate.js';
import { customerListQuerySchema } from './schemas.js';
import { getCustomer, listCustomers } from './service.js';

export const customersRouter = Router();

// GET /api/v1/customers
customersRouter.get('/', async (req, res) => {
  const query = parseQuery(customerListQuerySchema, req.query);
  const page = await listCustomers(query);
  sendList(res, page.data, page.meta);
});

// GET /api/v1/customers/:id
customersRouter.get('/:id', async (req, res) => {
  const { id } = parsePath(idParamSchema, req.params);
  const customer = await getCustomer(id);
  if (!customer) throw notFound('Customer not found');
  sendOne(res, customer);
});
