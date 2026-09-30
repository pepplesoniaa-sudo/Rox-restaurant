// Seed script: fills the database with realistic Port Harcourt food-delivery
// data (restaurants in GRA, Rumuola, Trans-Amadi..., local dishes, kobo prices).
//
// Repeatable by design. Running it twice does not create duplicates because:
//   1. Faker is seeded with a fixed number, so every run generates exactly
//      the same names, emails, slugs and order references, in the same order.
//   2. Every row has a stable seed key, a natural unique key (restaurant
//      slug, customer email, menu item restaurant+name, order reference,
//      order item order+menuItem), and every insert uses skipDuplicates
//      (SQL: INSERT ... ON CONFLICT DO NOTHING).
// So the second run generates identical rows, finds they all exist, and
// inserts nothing.
//
// Chosen over truncate-and-reload: truncating would also delete orders that
// real clients placed through the API, so running the seed against
// production would destroy data. Insert-if-missing only ever adds.
//
// Run: npm run db:seed   (against production: see the README's deploy steps)

import { fakerEN_NG as faker } from '@faker-js/faker';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';
import type { OrderStatus } from '../src/generated/prisma/client.js';
import { areas, cuisines, descriptionsByCategory, riversSurnames, streetsByArea, type Cuisine, type Dish } from './catalogue.js';

const FAKER_SEED = 20260929;
const CURRENCY = 'NGN';
const KOBO_PER_NAIRA = 100;

// Fixed date ranges (not "now") so every run produces the same values.
const ACCOUNTS_FROM = new Date('2025-01-01T00:00:00Z');
const ACCOUNTS_TO = new Date('2026-05-31T23:59:59Z');
const ORDERS_FROM = new Date('2026-06-01T00:00:00Z');
const ORDERS_TO = new Date('2026-09-28T23:59:59Z');

// ---------- Types for the in-memory plan ----------

interface PlannedRestaurant {
  slug: string;
  name: string;
  cuisine: Cuisine;
  area: string;
  address: string;
  isOpen: boolean;
  deliveryFeeKobo: number;
  minimumOrderKobo: number;
  createdAt: Date;
  menu: PlannedMenuItem[];
}

interface PlannedMenuItem {
  name: string;
  description: string;
  category: Dish['category'];
  priceKobo: number;
  isAvailable: boolean;
}

interface PlannedCustomer {
  email: string;
  phone: string;
  name: string;
  area: string;
  createdAt: Date;
}

interface PlannedOrderLine {
  dish: PlannedMenuItem;
  quantity: number;
}

interface PlannedOrder {
  reference: string;
  restaurant: PlannedRestaurant;
  customer: PlannedCustomer;
  status: OrderStatus;
  deliveryAddress: string;
  lines: PlannedOrderLine[];
  createdAt: Date;
}

// ---------- Generation (pure: no database access) ----------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function nairaToKobo(naira: number): number {
  return naira * KOBO_PER_NAIRA;
}

// e.g. "14 Rumuola Road, Rumuola, Port Harcourt"
function phAddress(area: string): string {
  const street = faker.helpers.arrayElement(streetsByArea[area] ?? []);
  return `${faker.number.int({ min: 1, max: 120 })} ${street}, ${area}, Port Harcourt`;
}

function planRestaurants(count: number): PlannedRestaurant[] {
  const restaurants: PlannedRestaurant[] = [];
  for (let i = 1; i <= count; i++) {
    const cuisine = faker.helpers.arrayElement(cuisines);
    const template = faker.helpers.arrayElement(cuisine.nameTemplates);
    const name = template.replace('{name}', faker.helpers.arrayElement(riversSurnames));
    const area = faker.helpers.arrayElement(areas);

    // 8 to 14 distinct dishes from this cuisine's catalogue.
    const dishes = faker.helpers.arrayElements(cuisine.dishes, { min: 8, max: 14 });
    const menu = dishes.map((dish) => ({
      name: dish.name,
      description: faker.helpers.arrayElement(descriptionsByCategory[dish.category]),
      category: dish.category,
      // Prices land on round ₦50 steps, like a real menu.
      priceKobo: nairaToKobo(faker.number.int({ min: dish.minNaira, max: dish.maxNaira, multipleOf: 50 })),
      isAvailable: faker.datatype.boolean({ probability: 0.92 }),
    }));

    restaurants.push({
      // The number suffix guarantees uniqueness even if two restaurants
      // get the same generated name in the same area.
      slug: `${slugify(name)}-${slugify(area)}-${i}`,
      name,
      cuisine,
      area,
      address: phAddress(area),
      isOpen: faker.datatype.boolean({ probability: 0.85 }),
      deliveryFeeKobo: nairaToKobo(faker.number.int({ min: 500, max: 2500, multipleOf: 100 })),
      minimumOrderKobo: nairaToKobo(faker.helpers.arrayElement([0, 1500, 2000, 3000])),
      createdAt: faker.date.between({ from: ACCOUNTS_FROM, to: ACCOUNTS_TO }),
      menu,
    });
  }
  return restaurants;
}

function planCustomers(count: number): PlannedCustomer[] {
  const customers: PlannedCustomer[] = [];
  for (let i = 1; i <= count; i++) {
    // Faker's en_NG first-name list contains a bad entry, "Sname" (checked:
    // 2 of 500 customers got it). Re-roll it. This stays deterministic,
    // because the re-roll consumes the same random sequence on every run.
    let firstName = faker.person.firstName();
    while (firstName === 'Sname') firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    customers.push({
      // example.com is reserved for examples: these can never be real inboxes.
      email: `${slugify(firstName)}.${slugify(lastName)}.${i}@example.com`,
      phone: faker.phone.number(),
      name: `${firstName} ${lastName}`,
      area: faker.helpers.arrayElement(areas),
      createdAt: faker.date.between({ from: ACCOUNTS_FROM, to: ACCOUNTS_TO }),
    });
  }
  return customers;
}

function planOrders(
  count: number,
  restaurants: PlannedRestaurant[],
  customers: PlannedCustomer[],
): PlannedOrder[] {
  const orders: PlannedOrder[] = [];
  const usedReferences = new Set<string>();

  while (orders.length < count) {
    // Short, unambiguous code a customer can read over the phone.
    // Letters/digits that look alike (0/O, 1/I) are excluded.
    const reference = `ROX-${faker.string.alphanumeric({ length: 8, casing: 'upper', exclude: ['0', 'O', '1', 'I'] })}`;
    if (usedReferences.has(reference)) continue;
    usedReferences.add(reference);

    const restaurant = faker.helpers.arrayElement(restaurants);
    const dishes = faker.helpers.arrayElements(restaurant.menu, {
      min: 1,
      max: Math.min(4, config.orders.maxLines),
    });
    const lines = dishes.map((dish) => ({
      dish,
      quantity: faker.helpers.weightedArrayElement([
        { weight: 70, value: 1 },
        { weight: 20, value: 2 },
        { weight: 10, value: 3 },
      ]),
    }));

    // Respect the restaurant's minimum order, as the API will: top up the
    // first line until the subtotal reaches it.
    const firstLine = lines[0];
    while (
      firstLine &&
      subtotalOf(lines) < restaurant.minimumOrderKobo &&
      firstLine.quantity < config.orders.maxQuantityPerLine
    ) {
      firstLine.quantity += 1;
    }

    const customer = faker.helpers.arrayElement(customers);
    orders.push({
      reference,
      restaurant,
      customer,
      // Most historical orders are finished; a few are still in flight.
      status: faker.helpers.weightedArrayElement<OrderStatus>([
        { weight: 62, value: 'delivered' },
        { weight: 12, value: 'cancelled' },
        { weight: 8, value: 'pending' },
        { weight: 6, value: 'confirmed' },
        { weight: 6, value: 'preparing' },
        { weight: 6, value: 'out_for_delivery' },
      ]),
      deliveryAddress: phAddress(customer.area),
      lines,
      createdAt: faker.date.between({ from: ORDERS_FROM, to: ORDERS_TO }),
    });
  }
  return orders;
}

function subtotalOf(lines: PlannedOrderLine[]): number {
  return lines.reduce((sum, line) => sum + line.dish.priceKobo * line.quantity, 0);
}

// ---------- Writing (insert what is missing, skip what exists) ----------

async function main() {
  const started = Date.now();
  faker.seed(FAKER_SEED);

  // Generation order must never change, or the fixed seed would produce
  // different values and the natural keys would stop matching.
  const restaurants = planRestaurants(config.seed.restaurants);
  const customers = planCustomers(config.seed.customers);
  const orders = planOrders(config.seed.orders, restaurants, customers);

  // 1. Restaurants
  const restaurantsInserted = await prisma.restaurant.createMany({
    data: restaurants.map(({ menu: _menu, cuisine, ...r }) => ({ ...r, cuisine: cuisine.key, currency: CURRENCY })),
    skipDuplicates: true,
  });
  // Look up the real ids (new or pre-existing) by natural key.
  const restaurantIdBySlug = new Map(
    (
      await prisma.restaurant.findMany({
        where: { slug: { in: restaurants.map((r) => r.slug) } },
        select: { id: true, slug: true },
      })
    ).map((r) => [r.slug, r.id]),
  );
  const restaurantId = (slug: string) => mustGet(restaurantIdBySlug, slug, 'restaurant');

  // 2. Menu items
  const menuItemsInserted = await prisma.menuItem.createMany({
    data: restaurants.flatMap((r) =>
      r.menu.map((item) => ({ ...item, restaurantId: restaurantId(r.slug), currency: CURRENCY })),
    ),
    skipDuplicates: true,
  });
  const menuItemIdByKey = new Map(
    (
      await prisma.menuItem.findMany({
        where: { restaurantId: { in: [...restaurantIdBySlug.values()] } },
        select: { id: true, restaurantId: true, name: true },
      })
    ).map((m) => [`${m.restaurantId}|${m.name}`, m.id]),
  );

  // 3. Customers
  const customersInserted = await prisma.customer.createMany({
    data: customers,
    skipDuplicates: true,
  });
  const customerIdByEmail = new Map(
    (
      await prisma.customer.findMany({
        where: { email: { in: customers.map((c) => c.email) } },
        select: { id: true, email: true },
      })
    ).map((c) => [c.email, c.id]),
  );

  // 4. Orders. Totals are computed here, and the database checks
  //    total = subtotal + fee, so a bug in this arithmetic would fail loudly.
  const ordersInserted = await prisma.order.createMany({
    data: orders.map((o) => {
      const subtotalKobo = subtotalOf(o.lines);
      return {
        reference: o.reference,
        customerId: mustGet(customerIdByEmail, o.customer.email, 'customer'),
        restaurantId: restaurantId(o.restaurant.slug),
        status: o.status,
        deliveryAddress: o.deliveryAddress,
        subtotalKobo,
        deliveryFeeKobo: o.restaurant.deliveryFeeKobo,
        totalKobo: subtotalKobo + o.restaurant.deliveryFeeKobo,
        currency: CURRENCY,
        createdAt: o.createdAt,
      };
    }),
    skipDuplicates: true,
  });
  const orderIdByReference = new Map(
    (
      await prisma.order.findMany({
        where: { reference: { in: orders.map((o) => o.reference) } },
        select: { id: true, reference: true },
      })
    ).map((o) => [o.reference, o.id]),
  );

  // 5. Order items, with the name and price snapshot taken from the menu.
  const orderItemsInserted = await prisma.orderItem.createMany({
    data: orders.flatMap((o) => {
      const rId = restaurantId(o.restaurant.slug);
      return o.lines.map((line) => ({
        orderId: mustGet(orderIdByReference, o.reference, 'order'),
        menuItemId: mustGet(menuItemIdByKey, `${rId}|${line.dish.name}`, 'menu item'),
        nameSnapshot: line.dish.name,
        unitPriceKobo: line.dish.priceKobo,
        quantity: line.quantity,
        lineTotalKobo: line.dish.priceKobo * line.quantity,
        currency: CURRENCY,
        createdAt: o.createdAt,
      }));
    }),
    skipDuplicates: true,
  });

  console.log('Seed complete (inserted this run / total in database):');
  console.table({
    restaurants: { inserted: restaurantsInserted.count, total: await prisma.restaurant.count() },
    menu_items: { inserted: menuItemsInserted.count, total: await prisma.menuItem.count() },
    customers: { inserted: customersInserted.count, total: await prisma.customer.count() },
    orders: { inserted: ordersInserted.count, total: await prisma.order.count() },
    order_items: { inserted: orderItemsInserted.count, total: await prisma.orderItem.count() },
  });
  console.log(`Took ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

// A missing key means the plan and the database disagree. Stop immediately
// rather than insert a row pointing at nothing.
function mustGet<K, V>(map: Map<K, V>, key: K, what: string): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Seed bug: no ${what} found for key ${String(key)}`);
  return value;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
