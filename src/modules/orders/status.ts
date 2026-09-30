import type { OrderStatus } from '../../generated/prisma/enums.js';

// The order lifecycle as data. Every allowed move is listed; anything not
// listed is forbidden. delivered and cancelled are final: nothing leaves them.
//
//   pending ──▶ confirmed ──▶ preparing ──▶ out_for_delivery ──▶ delivered
//      │            │
//      └────────────┴──▶ cancelled
//
// Cancelling stops at "confirmed": once the kitchen is preparing, the food
// exists and the restaurant has spent money on it.
export const allowedTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
};

// Setting the status an order already has is allowed and changes nothing.
// That keeps PATCH idempotent: sending the same request twice is safe.
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return from === to || allowedTransitions[from].includes(to);
}

// The delivery address can change until the kitchen starts cooking.
export const addressEditableIn: readonly OrderStatus[] = ['pending', 'confirmed'];

// Orders that never happened (pending) or were called off (cancelled) can be
// removed. Anything that reached the kitchen is history and must be kept.
export const deletableIn: readonly OrderStatus[] = ['pending', 'cancelled'];
