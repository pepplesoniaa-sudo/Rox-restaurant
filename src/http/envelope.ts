import type { Response } from 'express';

// The two success shapes. Every endpoint uses one of these, so a client
// always finds its payload under "data".
//
//   one item:  { "data": { ... } }
//   a list:    { "data": [ ... ], "meta": { total, limit, hasMore, nextCursor } }

export interface ListMeta {
  total: number; // how many rows match the filters, across all pages
  limit: number; // page size actually used (after clamping)
  hasMore: boolean; // is there another page after this one?
  nextCursor: string | null; // pass as ?cursor= to get the next page; null on the last page
}

export function sendOne<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ data });
}

export function sendList<T>(res: Response, data: T[], meta: ListMeta): void {
  res.status(200).json({ data, meta });
}
