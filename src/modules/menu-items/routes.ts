import { Router } from 'express';
import { sendList, sendOne } from '../../http/envelope.js';
import { notFound } from '../../http/errors.js';
import { idParamSchema, parsePath, parseQuery } from '../../http/validate.js';
import { menuItemListQuerySchema } from './schemas.js';
import { getMenuItem, listMenuItems } from './service.js';

export const menuItemsRouter = Router();

// GET /api/v1/menu-items
menuItemsRouter.get('/', async (req, res) => {
  const query = parseQuery(menuItemListQuerySchema, req.query);
  const page = await listMenuItems(query);
  sendList(res, page.data, page.meta);
});

// GET /api/v1/menu-items/:id
menuItemsRouter.get('/:id', async (req, res) => {
  const { id } = parsePath(idParamSchema, req.params);
  const menuItem = await getMenuItem(id);
  if (!menuItem) throw notFound('Menu item not found');
  sendOne(res, menuItem);
});
