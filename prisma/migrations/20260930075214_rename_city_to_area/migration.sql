-- The market is now one city (Port Harcourt), so location is an area within
-- it, e.g. "Rumuola" or "GRA Phase 2".
-- Written by hand: Prisma's generated version would DROP "city" and ADD
-- "area", losing the data. RENAME keeps every existing value in place.

ALTER TABLE "restaurants" RENAME COLUMN "city" TO "area";
ALTER TABLE "customers" RENAME COLUMN "city" TO "area";

-- Keep the index name matching Prisma's naming convention, so future
-- migrations do not see a difference and try to recreate it.
ALTER INDEX "restaurants_city_cuisine_idx" RENAME TO "restaurants_area_cuisine_idx";
