// Pure unit test of the transition table: no database, no HTTP.
import { describe, expect, it } from 'vitest';
import type { OrderStatus } from '../src/generated/prisma/enums.js';
import { canTransition } from '../src/modules/orders/status.js';

const all: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];

// The complete list of legal moves (besides staying put). Everything else
// in the 6 x 6 grid must be forbidden.
const legal = new Set([
  'pending>confirmed',
  'pending>cancelled',
  'confirmed>preparing',
  'confirmed>cancelled',
  'preparing>out_for_delivery',
  'out_for_delivery>delivered',
]);

describe('canTransition', () => {
  for (const from of all) {
    for (const to of all) {
      const expected = from === to || legal.has(`${from}>${to}`);
      it(`${from} -> ${to} is ${expected ? 'allowed' : 'forbidden'}`, () => {
        expect(canTransition(from, to)).toBe(expected);
      });
    }
  }
});
