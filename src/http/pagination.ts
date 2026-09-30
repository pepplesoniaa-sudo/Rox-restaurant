import { z } from 'zod';
import { config } from '../config.js';
import type { ListMeta } from './envelope.js';
import { badRequest } from './errors.js';

// Pagination shared by every list endpoint. Two modes:
//
// 1. Cursor (keyset), the recommended one. A cursor records where the
//    previous page ended: the sort value and id of its last row. The next
//    page asks the database for rows that come *after* that pair:
//
//      ORDER BY price DESC, id DESC
//      WHERE price < :lastPrice OR (price = :lastPrice AND id < :lastId)
//
//    id is the tie-breaker: many dishes can cost ₦2,500, but ids are unique,
//    so every row has exactly one position and none is skipped or repeated.
//
// 2. Offset: "skip N rows, then take limit". SQL: ORDER BY ... OFFSET N.
//    Lets a client jump straight to row 200, but pages can shift if rows are
//    inserted meanwhile, and the database still reads the N skipped rows.
//
// A request uses one mode or the other, never both.

export type SortOrder = 'asc' | 'desc';

// What kind of value a sortable column holds, so the cursor can be decoded
// back into the right type (dates travel as ISO strings inside the cursor).
export type SortFieldType = 'string' | 'number' | 'date';

export interface ListOptions<SortField extends string> {
  sortFields: Record<SortField, SortFieldType>; // allow-list: anything else is a 400
  defaultSort: SortField;
  defaultOrder: SortOrder;
}

export interface ListParams {
  limit: number;
  sort: string;
  order: SortOrder;
  cursor: Cursor | undefined;
  offset: number | undefined;
}

interface Cursor {
  sort: string;
  order: SortOrder;
  value: string | number;
  id: string;
}

const cursorSchema = z.object({
  sort: z.string(),
  order: z.enum(['asc', 'desc']),
  value: z.union([z.string(), z.number()]),
  id: z.uuid(),
});

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): Cursor {
  const invalid = () =>
    badRequest('Invalid query parameters', [
      { field: 'cursor', issue: 'is not a cursor this API issued; use meta.nextCursor from a previous response' },
    ]);
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  const parsed = cursorSchema.safeParse(json);
  if (!parsed.success) throw invalid();
  return parsed.data;
}

// The query-string fields every list endpoint accepts. Each resource adds
// its own filter fields on top (see modules/*/schemas.ts).
export function paginationQueryShape<SortField extends string>(options: ListOptions<SortField>) {
  const sortNames = Object.keys(options.sortFields) as [SortField, ...SortField[]];
  return {
    limit: z.coerce
      .number({ error: 'must be a whole number' })
      .int({ error: 'must be a whole number' })
      .min(1, { error: 'must be at least 1' })
      .default(config.pagination.defaultLimit)
      // Too big is not an error: it is clamped to the maximum, and the
      // limit actually used is reported back in meta.limit.
      .transform((limit) => Math.min(limit, config.pagination.maxLimit)),
    cursor: z.string().min(1, { error: 'must not be empty' }).optional(),
    // Number of rows to skip. Negative makes no sense ("skip -1 rows"), so it
    // is a 400 rather than being quietly treated as 0.
    offset: z.coerce
      .number({ error: 'must be a whole number' })
      .int({ error: 'must be a whole number' })
      .min(0, { error: 'must be 0 or more (it is the number of rows to skip)' })
      .optional(),
    sort: z.enum(sortNames, { error: `must be one of: ${sortNames.join(', ')}` }).default(options.defaultSort),
    order: z.enum(['asc', 'desc'], { error: 'must be asc or desc' }).default(options.defaultOrder),
  };
}

// Turns validated query values into ListParams, checking the cursor belongs
// to this sort. A cursor made while sorting by price means nothing when
// sorting by name, so mixing them is a 400 rather than a silently wrong page.
export function toListParams<SortField extends string>(
  query: {
    limit: number;
    cursor?: string | undefined;
    offset?: number | undefined;
    sort: SortField;
    order: SortOrder;
  },
  options: ListOptions<SortField>,
): ListParams {
  // "Start after this row" and "skip N rows" describe two different starting
  // points. Rather than guess which one the client meant, refuse both.
  if (query.cursor !== undefined && query.offset !== undefined) {
    throw badRequest('Invalid query parameters', [
      { field: 'offset', issue: 'cannot be combined with cursor; use one or the other' },
    ]);
  }

  let cursor: Cursor | undefined;
  if (query.cursor !== undefined) {
    cursor = decodeCursor(query.cursor);
    if (cursor.sort !== query.sort || cursor.order !== query.order) {
      throw badRequest('Invalid query parameters', [
        {
          field: 'cursor',
          issue: `was created for sort=${cursor.sort}&order=${cursor.order}; send the same sort and order with it`,
        },
      ]);
    }
    const expected = options.sortFields[query.sort];
    const valueOk =
      expected === 'number'
        ? typeof cursor.value === 'number'
        : expected === 'date'
          ? typeof cursor.value === 'string' && !Number.isNaN(Date.parse(cursor.value))
          : typeof cursor.value === 'string';
    if (!valueOk) {
      throw badRequest('Invalid query parameters', [{ field: 'cursor', issue: 'is corrupted' }]);
    }
  }
  return { limit: query.limit, sort: query.sort, order: query.order, cursor, offset: query.offset };
}

// ORDER BY <sort> <order>, id <order>
export function orderByFor(params: ListParams): Record<string, SortOrder>[] {
  return [{ [params.sort]: params.order }, { id: params.order }];
}

// The "rows after the cursor" condition, or undefined on the first page.
// Built as a Prisma where object: { OR: [ {sort: {lt: v}}, {sort: v, id: {lt: id}} ] }
export function cursorWhere(params: ListParams, sortFields: Record<string, SortFieldType>) {
  if (!params.cursor) return undefined;
  const op = params.order === 'asc' ? 'gt' : 'lt';
  const value = sortFields[params.sort] === 'date' ? new Date(params.cursor.value) : params.cursor.value;
  return {
    OR: [{ [params.sort]: { [op]: value } }, { [params.sort]: value, id: { [op]: params.cursor.id } }],
  };
}

// The caller fetched limit + 1 rows. The extra row is only a probe: if it
// exists there is a next page. It is not returned to the client.
export function buildPage<Row extends { id: string }>(
  rows: Row[],
  params: ListParams,
  total: number,
): { data: Row[]; meta: ListMeta } {
  const hasMore = rows.length > params.limit;
  const data = hasMore ? rows.slice(0, params.limit) : rows;
  const last = data.at(-1);

  let nextCursor: string | null = null;
  if (hasMore && last) {
    const raw = (last as Record<string, unknown>)[params.sort];
    const value = raw instanceof Date ? raw.toISOString() : (raw as string | number);
    nextCursor = encodeCursor({ sort: params.sort, order: params.order, value, id: last.id });
  }

  return { data, meta: { total, limit: params.limit, hasMore, nextCursor } };
}
