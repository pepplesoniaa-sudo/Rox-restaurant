-- Check constraints Prisma's schema language cannot express.
-- These make invalid money and quantities impossible to store, no matter
-- which code path (API, seed script, manual SQL) tries to write them.
--
-- Business limits that may change (max quantity per line, max lines per
-- order) are NOT here: they live in src/config.ts. Only rules that are
-- always true regardless of configuration belong in the database.

-- restaurants
ALTER TABLE "restaurants"
  ADD CONSTRAINT "restaurants_delivery_fee_non_negative" CHECK ("deliveryFeeKobo" >= 0),
  ADD CONSTRAINT "restaurants_minimum_order_non_negative" CHECK ("minimumOrderKobo" >= 0),
  ADD CONSTRAINT "restaurants_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$');

-- menu_items: a dish must cost something
ALTER TABLE "menu_items"
  ADD CONSTRAINT "menu_items_price_positive" CHECK ("priceKobo" > 0),
  ADD CONSTRAINT "menu_items_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$');

-- orders: the total is always exactly subtotal + delivery fee
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_subtotal_non_negative" CHECK ("subtotalKobo" >= 0),
  ADD CONSTRAINT "orders_delivery_fee_non_negative" CHECK ("deliveryFeeKobo" >= 0),
  ADD CONSTRAINT "orders_total_matches" CHECK ("totalKobo" = "subtotalKobo" + "deliveryFeeKobo"),
  ADD CONSTRAINT "orders_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$');

-- order_items: at least one of something, and the line total adds up
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_items_unit_price_non_negative" CHECK ("unitPriceKobo" >= 0),
  ADD CONSTRAINT "order_items_line_total_matches" CHECK ("lineTotalKobo" = "unitPriceKobo" * "quantity"),
  ADD CONSTRAINT "order_items_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$');
