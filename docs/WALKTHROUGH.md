# Walkthrough

One section per build step, in plain English: what was built, which files,
why it works this way, and what alternative was rejected. Written to be
revised from before a defence.

---

## Step 0 — Project skeleton and resource design

### What was built
An empty but correctly configured TypeScript project, with the data model
written down before any code exists.

### Files
| File | Purpose |
|---|---|
| `.gitignore` | Keeps `.env`, `node_modules/`, `dist/` and the generated Prisma client out of git. |
| `.env.example` | Lists every environment variable the app will read, each with a comment. Copy it to `.env` locally. |
| `.nvmrc` | Says "Node 24" so `nvm use` picks the right version. |
| `package.json` | Project metadata. `"type": "module"` means files use `import`/`export`. `"engines"` declares Node 24+. Versions are pinned exactly (no `^`) so every install gets the same code. |
| `tsconfig.json` | TypeScript settings. `strict: true` turns on all the strict checks. |
| `README.md` | The resource design: tables, fields, relationships, order lifecycle. |

### Why it works this way

**`.env` is ignored in the very first commit.** If `.env` were committed even
once, the secret would stay in git history forever, even after deleting the
file. Ignoring it before it exists means it can never be committed by accident.
The `!.env.example` line is an exception to the `.env.*` rule, so the example
file *is* committed.

**Design before code.** The brief says: if you cannot draw the relationships
on one page, the design is not ready. The README table was written first so
every later decision (constraints, indexes, endpoints) can point back to it.

**Why these resources.** A food market needs at least: who sells
(restaurants), what they sell (menu items), who buys (customers), and the
purchase (orders). `order_items` exists because an order contains *many*
menu items and a menu item appears in *many* orders. That many-to-many
relationship needs a join table. The join table also stores the price at
the time of ordering. If the restaurant raises a price next week, last
week's order must still show what the customer actually paid.

**Why UUID v7 instead of 1, 2, 3.** With sequential IDs, anyone can loop
from 1 to 100000 and download the whole database. A UUID has 2^122 possible
random-ish values, so it cannot be guessed. Version 7 puts a timestamp in the
first bits, so new IDs are always larger than old ones. That keeps the
database index tidy (new rows go at the end) and gives a natural tie-breaker
for sorting.

**Why kobo integers.** `0.1 + 0.2` in JavaScript is `0.30000000000000004`.
Money stored as floating point drifts. Integers are exact. The `currency`
column means the number is never ambiguous: `250000` + `NGN` = ₦2,500.00.

**Stricter-than-strict TypeScript.** `noUncheckedIndexedAccess` makes
`array[0]` typed as `T | undefined`, forcing a check before use. That catches
a real class of "cannot read property of undefined" crashes at compile time.

**`"module": "nodenext"`.** This tells TypeScript to follow Node's real
ES-module rules, which is why imports inside `src/` will end in `.js`
(e.g. `import { config } from './config.js'`). TypeScript compiles `.ts` to
`.js`, and Node runs the `.js` file, so the import names the file that will
exist at runtime.

### Alternatives rejected
| Rejected | Why |
|---|---|
| Node 20 | Reached end-of-life on 30 April 2026; no security patches. Node 24 is the current LTS. |
| `dotenv` package | Node 24 loads `.env` files natively (`--env-file-if-exists`, `process.loadEnvFile()`). One less dependency to explain. |
| cuid2 identifiers | Also fine, but UUID is a native Postgres type (16 bytes, validated by the database), and v7 sorts by creation time. |
| Installing every library now | Each library is added in the step that first uses it, so each commit's `package.json` change is small and explainable. |

### How to verify
```bash
git log --oneline               # small commits, .gitignore first
git show --stat HEAD~2          # first commit contains .gitignore and .env.example
git check-ignore -v .env        # prints the .gitignore rule that ignores .env
npm install                     # installs the pinned dev tools
npx tsc --version               # Version 7.0.2
```

---

## Step 1 — Config, app skeleton, response envelopes

### What was built
A running Express server with one endpoint (`GET /health`), a single config
module, and the two response shapes (success and error) that every later
endpoint will reuse. No database yet.

### Files
| File | Purpose |
|---|---|
| `src/config.ts` | Reads every environment variable once, validates it with Zod, applies defaults, and exports a typed `config` object. |
| `src/http/errors.ts` | `ApiError` class plus helpers `badRequest` (400), `notFound` (404), `conflict` (409), `validationFailed` (422). |
| `src/http/envelope.ts` | `sendOne` → `{ data }` and `sendList` → `{ data, meta }`. |
| `src/http/error-handler.ts` | Catch-all 404 for unknown routes, and the single function that turns any error into `{ error: { code, message, details? } }`. |
| `src/app.ts` | Builds the Express app: middleware, `/health`, the `/api/v1` router, then the 404 and error handlers. |
| `src/server.ts` | Starts listening on `config.port` and shuts down cleanly on SIGTERM. |
| `package.json` | Adds `express`, `zod`, and the `dev`, `build`, `start` scripts. |

### Why it works this way

**One config file, validated at startup.** The brief asks to be shown "where
your rate limit number lives and why". The answer is always `src/config.ts`.
Handlers never read `process.env` directly; they read `config.rateLimit.maxRequests`.
Three benefits:
1. One place to look and one place to change.
2. The number can differ per environment (e.g. a lower limit in production)
   without a code change. You set the env var and restart.
3. Zod checks the values *before* the server starts. `RATE_LIMIT_MAX_REQUESTS=abc`
   stops the process with a clear message instead of silently becoming `NaN`
   and breaking the rate limiter in production.

`z.coerce.number()` is needed because environment variables are always
strings. `"100"` becomes `100`, and `"abc"` fails.

The `.refine(...)` rule stops a nonsense setup like a default page size of
50 with a maximum of 20.

**`createApp()` is separate from `server.ts`.** `app.ts` builds the app;
`server.ts` starts it. Tests (step 8) can import `createApp()` and send it
requests without opening a real network port.

**Errors are thrown, not returned.** A handler that finds nothing does
`throw notFound('Restaurant not found')`. Express 5 catches errors thrown
from `async` handlers automatically and passes them to `errorHandler`.
(Express 4 did not. There you had to wrap every handler in try/catch or
call `next(err)` yourself.) Because every error goes through one function,
every error has the same shape. That directly addresses the brief's
"different response shapes on different endpoints" trap.

**The error handler has four parameters even though `_next` is unused.**
That is how Express tells an error handler (4 parameters) apart from normal
middleware (3 parameters). Removing `_next` would silently turn it into
normal middleware that never receives errors.

**Unknown errors become a 500 with a vague message.** If the error is not an
`ApiError`, it is a bug. We log the full error on the server and send the
client only `INTERNAL_ERROR`. Stack traces and SQL in a response would show
attackers how the system works inside.

**Malformed JSON is a 400, not a 500.** `express.json()` throws an error with
`type: 'entity.parse.failed'` when the body is not valid JSON. That is the
client's mistake, so it gets a 400 in our envelope instead of Express's
default HTML error page.

**`trust proxy`.** On Render, requests arrive via a load balancer. Without
this setting, `req.ip` would be the load balancer's address for every user.
The step 9 rate limiter would then count the whole internet as one client
and block everyone after 100 requests. The hop count comes from config.

**`/health` is outside `/api/v1`.** It is for the hosting platform to check
the process is alive, not part of the public contract that versioning
protects.

**Status code choice, decided now so every step agrees:**
| Code | When |
|---|---|
| 400 `BAD_REQUEST` | Bad query string or path (negative limit, unknown sort field, bad cursor, malformed id, invalid JSON) |
| 404 `NOT_FOUND` | The resource or route does not exist |
| 409 `CONFLICT` | Request is valid but the resource's current state forbids it (cancelling a delivered order) |
| 422 `VALIDATION_FAILED` | JSON body parsed fine but breaks a rule (missing field, quantity 0), with `details` naming the field |
| 429 `RATE_LIMITED` | Too many requests |
| 500 `INTERNAL_ERROR` | Our bug |

### Alternatives rejected
| Rejected | Why |
|---|---|
| Reading `process.env.X` inside handlers | Scatters the numbers across files, gives no validation, and a typo means `undefined` at runtime. |
| Fastify / NestJS | Fastify is faster, NestJS more structured, but Express has the least "magic" to explain line by line. Express 5 removed the main old pain point (async errors). |
| A generic `{ success: true, ... }` flag in responses | Redundant. The HTTP status code already says whether it worked. Returning `200` with `success: false` is one of the brief's listed traps. |

### How to verify
```bash
npm install
cp .env.example .env            # PowerShell: Copy-Item .env.example .env
npm run typecheck               # no output = no type errors
npm run dev                     # leave running; in a second terminal:

curl -i http://localhost:3000/health
# HTTP/1.1 200 OK ... {"data":{"status":"ok"}}   (and no X-Powered-By header)

curl -i http://localhost:3000/api/v1/nothing
# HTTP/1.1 404 ... {"error":{"code":"NOT_FOUND","message":"No route for GET /api/v1/nothing"}}

curl -i -X POST http://localhost:3000/api/v1/orders -H "Content-Type: application/json" -d "{\"name\": }"
# HTTP/1.1 400 ... {"error":{"code":"BAD_REQUEST","message":"Request body is not valid JSON"}}
```
Then stop the server, set `RATE_LIMIT_MAX_REQUESTS=abc` in `.env`, and run
`npm run dev` again. It should refuse to start and name the bad variable.
Put the value back to `100` afterwards.

---

## Step 2 — Database schema, migrations and constraints

### What was built
The five tables from the README, created in PostgreSQL through two
migrations. The first comes from the Prisma schema. The second is
hand-written SQL for the rules Prisma cannot express.

### Files
| File | Purpose |
|---|---|
| `prisma/schema.prisma` | The data model: tables, columns, types, relations, unique constraints, indexes, the `OrderStatus` enum. |
| `prisma/migrations/…_init/migration.sql` | SQL that Prisma generated from the schema. Creates the tables. |
| `prisma/migrations/…_add_check_constraints/migration.sql` | Hand-written `CHECK` constraints. |
| `prisma.config.ts` | Tells the Prisma CLI where the schema, migrations and database URL are. |
| `src/db.ts` | The single shared `PrismaClient` the app uses to query. |
| `package.json` | Adds `prisma`, `@prisma/client`, `@prisma/adapter-pg`, and the `db:*` scripts. `postinstall` generates the client after every `npm install`. |

### Why it works this way

**Migrations, not "just sync the schema".** A migration is a numbered SQL
file committed to git. Running `prisma migrate deploy` on the production
database replays exactly the same files in the same order. So production
ends up identical to your laptop, and there is a history of every change.

**Why a second, hand-written migration.** Prisma's schema language has no
way to say "price must be greater than zero". So Prisma creates the tables,
and then plain SQL adds the checks. `prisma migrate dev --create-only`
created an empty migration file, and the SQL was written into it by hand.
Prisma ignores check constraints when comparing schemas, so later
migrations will not try to remove them.

**What the database now makes impossible** (these were run and rejected):

| Invalid state | What stops it |
|---|---|
| Negative delivery fee | `restaurants_delivery_fee_non_negative` |
| A free (0 kobo) or negative-price dish | `menu_items_price_positive` |
| Currency `ngn`, `NAIRA`, or empty | `*_currency_iso` (must be 3 capital letters) |
| An order whose total ≠ subtotal + fee | `orders_total_matches` |
| An order line with quantity 0 or −2 | `order_items_quantity_positive` |
| A line total that is not unit price × quantity | `order_items_line_total_matches` |
| A menu item pointing at a restaurant that doesn't exist | foreign key `menu_items_restaurantId_fkey` |
| The same dish listed twice at one restaurant | unique `(restaurantId, name)` |
| The same dish twice in one order | unique `(orderId, menuItemId)`: order 2 of it with quantity 2 instead |
| Two customers with one email / two restaurants with one slug | unique on `email` / `slug` |
| An id like `123` | the column type is `uuid`, so Postgres refuses anything that is not a UUID |
| Order status `shipped` | `status` is a Postgres enum with only six allowed values |

**Why check constraints when the API validates anyway?** The API is not the
only thing that writes to the database. The seed script does, a future admin
tool might, and a developer running SQL by hand does. The database is the
last line of defence and the only one every path must pass through.

**Why the maximum quantity (99) is *not* a database check.** "Quantity must
be positive" is always true, so it belongs in the database. "At most 99 per
line" is a business decision that might change, so it belongs in
`src/config.ts` (`ORDER_MAX_QUANTITY_PER_LINE`). Putting 99 in the database
too would mean two places to update and a migration for a policy change.

**Delete behaviour on foreign keys (`onDelete`).**
- `order_items → orders`: **Cascade**. Deleting an order deletes its lines,
  because lines mean nothing without their order.
- Everything else: **Restrict**. You cannot delete a restaurant that still
  has orders, or a dish that appears in past orders. Order history must
  never disappear as a side effect.

**Deliberate duplication in `order_items` and `orders`.** `nameSnapshot`,
`unitPriceKobo` and the order's `deliveryFeeKobo` copy values that also exist
on the menu item and restaurant. That is on purpose. Those source values can
change later, but a receipt must show what was true when the customer paid.
Looking the price up from the menu item on every read would silently rewrite
history when the menu changes.

**Each index names the query it serves** (see the comments in the schema):
- `restaurants (city, cuisine)`: list filtered by city and cuisine.
- `menu_items (restaurantId, name)`: the unique constraint. Because it
  *starts* with `restaurantId`, it also serves `GET /restaurants/:id/menu`,
  so no second index is needed.
- `menu_items (category, priceKobo)`: menu list filtered by category, sorted by price.
- `orders (customerId, createdAt)`: one customer's orders, newest first.
- `orders (restaurantId, status)`: one restaurant's orders in a given status.
- `orders (createdAt, id)`: the default sort of the order list.
- `order_items (menuItemId)`: Postgres does **not** index foreign keys
  automatically. Without this index, the Restrict check ("is this dish in
  any order?") would scan every order line.

Not every column is indexed. Every index slows down every insert and uses
disk, so an index has to be justified by a real query.

**UUID v7 is generated by Prisma, not by Postgres.** `@default(uuid(7))`
means the Prisma client creates the id before sending the insert. The
local PostgreSQL 18 has a native `uuidv7()`, but managed hosts may run older
versions, so generating in the app works everywhere. The column type is
still the native `uuid`: 16 bytes, validated by the database.

**`Timestamptz(3)`.** Timestamps are stored with a time zone (always
converted to UTC internally) and millisecond precision, which matches what
JavaScript `Date` can hold. Plain `timestamp` without a time zone is ambiguous
once the server and database are in different zones.

**Prisma 7 specifics.** The client is generated into `src/generated/prisma`
(git-ignored, rebuilt by `postinstall`) and connects through a *driver
adapter*: `@prisma/adapter-pg` wraps the standard `pg` Postgres driver.
Prisma 7 also stopped reading `.env` automatically, so `prisma.config.ts`
calls Node's built-in `process.loadEnvFile()`.

**Known audit warning.** `npm audit` reports 4 high-severity advisories.
All of them come from inside the Prisma CLI: `mysql2` (a MySQL driver we
never load) and `deepmerge-ts` (used only to merge our own
`prisma.config.ts`). Neither is reachable from an API request. npm's
suggested "fix" is downgrading to Prisma 6, which is a worse trade.

### Alternatives rejected
| Rejected | Why |
|---|---|
| `prisma db push` | Changes the database without writing a migration file, so there is no history and nothing to replay in production. |
| Enforcing `total = subtotal + fee` only in TypeScript | Any other write path (seed, SQL console) could still store a wrong total. |
| Storing status as free text | `'Delivered'`, `'delivred'`, `'done'` would all be accepted. The enum allows exactly six values. |
| snake_case column names with `@map` on every field | Cleaner SQL, but doubles the schema's length. Raw SQL quotes the camelCase names instead (`"priceKobo"`). |
| Soft delete (`deletedAt`) | Not asked for by the brief. Orders are the only deletable resource via the API, and `Restrict` already protects history. |

### How to verify
```bash
npm install                         # also runs "prisma generate"
npm run db:migrate                  # creates rox_restaurant and applies both migrations
npm run db:status                   # "Database schema is up to date!"
npm run typecheck

# Look at the constraints Postgres now enforces:
psql -h localhost -U postgres -d rox_restaurant -c "\d+ orders"

# Try to break a rule. Expect: ERROR ... violates check constraint "menu_items_price_positive"
# CHECK constraints run before foreign keys, so the price rule fires even though the restaurant is fake.
psql -h localhost -U postgres -d rox_restaurant -c "INSERT INTO menu_items (id, \"restaurantId\", name, category, \"priceKobo\", \"updatedAt\") VALUES (gen_random_uuid(), gen_random_uuid(), 'Jollof', 'mains', 0, now());"
```

---

## Step 3 — Repeatable seed script

### What was built
A script that fills the database with realistic, related Nigerian
food-delivery data. Running it twice does not create duplicates.

| Table | Rows |
|---|---|
| restaurants | 300 (7 cuisines, 7 cities, ~15% closed) |
| menu_items | 3,295 (8–14 real dishes per restaurant, ~8% unavailable) |
| customers | 500 |
| orders | 800 (spread over June–September 2026, mixed statuses) |
| order_items | 2,007 |

### Files
| File | Purpose |
|---|---|
| `src/seed/catalogue.ts` | Hand-written reference data: cuisines, restaurant name patterns, real dishes with price ranges in naira, cities. |
| `src/seed/seed.ts` | Generates the data with Faker, then inserts what is missing. |
| `package.json` | `db:seed` (runs the TypeScript with tsx, for development) and `db:seed:prod` (runs the compiled `dist/seed/seed.js`, for production). Faker is a normal dependency because production runs the seed too. |

### Why it works this way

**How "repeatable" is achieved: two ideas working together.**

1. **Same input, same output.** `faker.seed(20260929)` fixes Faker's random
   number generator. From then on, the "random" sequence is identical on
   every run and every machine. Run 1 and run 2 generate the exact same 300
   restaurant names, the same emails and the same order references. The date
   ranges are fixed dates, not "now", for the same reason.
2. **Every row has a natural key, and inserts skip duplicates.**

   | Table | Natural key (unique in the database) |
   |---|---|
   | restaurants | `slug`, e.g. `abiola-buka-lagos-17` |
   | menu_items | `(restaurantId, name)` |
   | customers | `email`, e.g. `onome.christian.4@example.com` |
   | orders | `reference`, e.g. `ROX-22CR84J5` |
   | order_items | `(orderId, menuItemId)` |

   `createMany({ skipDuplicates: true })` becomes SQL
   `INSERT ... ON CONFLICT DO NOTHING`. On run 2, every generated row
   collides with an existing unique key, so nothing is inserted.

The UUID `id` cannot be the natural key, because a new UUID is generated on
every run. That is why after each insert the script *looks up* the real ids
by natural key (`slug → id`, `email → id`, …) before inserting the child rows
that point at them.

**Proof it works** (recorded while building this step):
- Run 1: inserted 300 / 3295 / 500 / 800 / 2007 (figures after the step 10 description fix).
- Run 2: inserted 0 / 0 / 0 / 0 / 0, with the same totals.
- A brand-new empty database was migrated and seeded with the compiled
  production script. An MD5 fingerprint of every restaurant (slug + name +
  fee) and every order (reference + total + status) was identical to the
  original database.

**Plan first, write second.** All Faker calls happen before any database
call (`planRestaurants`, `planCustomers`, `planOrders`). If generation
depended on what the database returned, for example picking "the first
menu item" from a query, the result would depend on database row order and
could differ between runs. Keeping generation pure guarantees determinism.

**Why not wrap everything in one transaction?** It is not needed. If the
script crashes halfway (say, the network drops during orders), the rows
already inserted are valid on their own, and running the script again fills
in exactly what is missing. The script is *resumable*, not just repeatable.
A single transaction on a remote database would also risk hitting the
transaction timeout.

**Orders created through the API are never touched.** The seed only
inserts. It never deletes or updates, so running it against production
after real orders exist is safe.

**The seed obeys the same rules as the API.** Every order meets its
restaurant's minimum order (the first line's quantity is topped up until it
does). Totals are computed in the script, and the database checks from step 2
(`total = subtotal + fee`, `line total = price × quantity`) would reject any
arithmetic mistake. Verified afterwards with SQL: 0 orders below minimum,
0 orders whose subtotal differs from the sum of their lines.

**Realistic values, not lorem ipsum.** Faker's Nigerian locale
(`fakerEN_NG`) gives names like "Onome Christian" and `+234` phone numbers.
Dishes come from a curated list (Jollof Rice, Egusi Soup, Suya, …) with
sensible price ranges, rounded to ₦50 like a real menu, then stored in
kobo. Descriptions are short, plain lines chosen per category ("Served
chilled.", "Rich and well spiced, with assorted meat."). The first version
used Faker's Latin lorem ipsum; that was caught and replaced in step 10.
Emails use `example.com`, a domain reserved for examples, so no
generated email can ever reach a real person.

**Why the slug ends in a number** (`abiola-buka-lagos-17`). Faker can produce
the same restaurant name twice in the same city. The index suffix makes the
slug unique without needing a retry loop.

### Alternatives rejected
| Rejected | Why |
|---|---|
| Delete everything, then insert | Also "no duplicates", but it would wipe real orders in production every time the seed runs. |
| `upsert` row by row | Also repeatable, but about 7,000 separate round trips to the database instead of 10. Slow against a remote host. |
| Committing a database dump | The brief forbids it. A dump is also unreadable in code review and breaks whenever the schema changes. |
| Mockaroo / DummyJSON downloads | A static file cannot follow the schema's relationships and constraints. Code can, and can be regenerated with different volumes via `SEED_*` env vars. |
| `prisma/seed.ts` | Outside `src/`, so it would not be type-checked or compiled. In `src/seed/` it compiles to `dist/`, so production can run it with plain `node`. |

### How to verify
```bash
npm run db:seed        # first run: "inserted" equals "total"
npm run db:seed        # second run: every "inserted" is 0, totals unchanged

psql -h localhost -U postgres -d rox_restaurant -c "select count(*) from restaurants"
psql -h localhost -U postgres -d rox_restaurant -c "select slug, count(*) from restaurants group by slug having count(*) > 1"
# (0 rows) = no duplicate restaurants
```

---

## Step 4 — Cursor pagination, filtering, sorting, and the restaurant endpoints

### What was built
- `GET /api/v1/restaurants`: paginated list with filters and sorting.
- `GET /api/v1/restaurants/:id`: one restaurant.
- Reusable helpers that every later list endpoint shares: validation,
  cursor pagination, sort allow-lists.

### Files
| File | Purpose |
|---|---|
| `src/http/validate.ts` | `parseQuery` / `parsePath` (→ 400) and `parseBody` (→ 422). Turns Zod issues into `{ field, issue }` details. `idParamSchema` validates `:id` as a UUID. |
| `src/http/pagination.ts` | Cursor encode/decode, shared query fields (`limit`, `cursor`, `sort`, `order`), `rejectOffset`, the keyset `WHERE`, `ORDER BY`, and `buildPage`, which produces `meta`. |
| `src/modules/restaurants/schemas.ts` | Sortable fields and defaults for restaurants, plus the query schema with filters. |
| `src/modules/restaurants/service.ts` | Database queries. `restaurantSelect` defines the public shape. |
| `src/modules/restaurants/routes.ts` | Thin handlers: validate, call the service, send the envelope. |
| `src/app.ts` | Mounts the router at `/api/v1/restaurants`. |

### The query contract
| Param | Type | Default | Rules |
|---|---|---|---|
| `limit` | integer | 20 (`PAGINATION_DEFAULT_LIMIT`) | < 1 or not a number → 400. Above 100 (`PAGINATION_MAX_LIMIT`) → **clamped** to 100, not rejected. |
| `cursor` | string | none | Must be a `meta.nextCursor` this API issued, with the same `sort` and `order`. Otherwise 400. |
| `sort` | `name` \| `createdAt` \| `deliveryFeeKobo` \| `minimumOrderKobo` | `name` | Anything else → 400 listing the allowed values. |
| `order` | `asc` \| `desc` | `asc` | Anything else → 400. |
| `cuisine` | string | none | Exact match, case-insensitive (lowercased first). |
| `city` | string | none | Exact match, case-insensitive (`LAGOS` = `Lagos`). |
| `isOpen` | `true` \| `false` | none | `yes`, `1` → 400. |
| `maxDeliveryFeeKobo` | integer ≥ 0 | none | Restaurants whose delivery fee is at most this. |
| `offset` | none | none | **Always 400**, with a message pointing to `cursor`. |
| anything else | none | none | 400 `"is not a recognised parameter"`. |

### How cursor pagination works, step by step
Example: `?sort=deliveryFeeKobo&order=desc&limit=20`
1. The database is asked for 21 rows (`limit + 1`), ordered by
   `deliveryFeeKobo DESC, id DESC`.
2. If 21 came back, there is another page (`hasMore: true`). The 21st row
   is dropped; it was only a probe. This avoids a second query just to ask
   "is there more?"
3. The last row actually returned, say fee `230000` and id `01a0…d28`,
   becomes the cursor: `{"sort":"deliveryFeeKobo","order":"desc","value":230000,"id":"01a0…d28"}`,
   base64url-encoded so it is safe in a URL.
4. The client sends it back as `?cursor=…`. The server decodes it and adds:
   `WHERE deliveryFeeKobo < 230000 OR (deliveryFeeKobo = 230000 AND id < '01a0…d28')`.
5. `meta.total` comes from a separate `COUNT(*)` with the same filters but
   *without* the cursor condition, so it is the total across all pages.

**Why `id` is in the cursor.** Many restaurants have the same delivery fee.
If the cursor held only `230000`, the next page would say `fee < 230000` and
skip every other restaurant charging exactly ₦2,300. Adding `id` as a
tie-breaker gives every row a unique position.

**Tested:** every sort was walked page by page (37 per page) to the end. Each
walk returned all rows exactly once, with no duplicates and no gaps, and the
row count equalled `meta.total`. That includes `deliveryFeeKobo`, where many
rows tie.

### Why it works this way

**Why cursor, not offset** (defence question). Offset pagination is
`LIMIT 20 OFFSET 1000`. It is simple and lets you jump to "page 50", but:
- **It drifts.** If a row is inserted or deleted while someone is paging,
  every later row shifts by one. The client then sees a row twice or never
  sees it at all. A cursor says "after *this row*", so inserts elsewhere
  don't move it.
- **It gets slower the deeper you go.** `OFFSET 100000` makes the database
  read and throw away 100,000 rows. A cursor jumps straight to the position
  using the index.

**When offset would be better:** a UI with numbered page links ("go to
page 7"), or small admin tables where jumping around matters more than
consistency. Cursors can only go "next". This API serves a consumer with a
"next page" button, so cursor fits.

**"What happens if I request page 50 of a resource that has 30 pages?"**
There are no page numbers, so a client cannot ask for page 50. The nearest
equivalent, a cursor that points past the last row, returns `200` with
`data: []`, `hasMore: false`, `nextCursor: null`. That is an honest answer:
nothing comes after that point. With offset, the answer would be the same
empty list. It would not be a 404, because the collection exists and is
just empty from there on.

**Why 5000 is clamped instead of rejected.** The brief asks for it, and it
is the friendlier contract: the client gets the largest page allowed and can
see from `meta.limit: 100` that it was capped. Without a cap, one request for
a million rows could exhaust the server's memory. Without a default, a
missing `limit` would return the whole table, which is one of the brief's traps.

**Why `offset` gets its own error message.** Because the schema is strict,
`offset` would be rejected anyway as "not a recognised parameter". But a
client sending `offset` is clearly trying to paginate, so the message tells
them exactly what to do instead. This covers the brief's "negative offset
should return 400 with a clear message".

**Why unknown parameters are a 400 (`z.strictObject`).** If
`?cusine=pizza` (typo) were ignored, the client would get *all*
restaurants and believe they were all pizza places. A loud error is better
than a silently wrong answer.

**Why a malformed id is 400 but an unknown valid id is 404.** `/restaurants/abc`
can never match anything, so the *request* is wrong (400), and the database
is never queried. `/restaurants/<valid-uuid-that-doesn't-exist>` is a
well-formed question with the answer "no such restaurant" (404). Neither can
become a 500: without the UUID check, Postgres would raise
`invalid input syntax for type uuid`, which would surface as a 500.

**Why a cursor for one sort is rejected with another.** A cursor made while
sorting by name holds a name (`"Abiola Buka"`). Used with
`sort=deliveryFeeKobo`, it would compare a fee to a name, which is meaningless.
The cursor records its sort and order, and a mismatch is a clear 400.

**Is the cursor a security risk?** It is only base64, not encrypted: anyone
can decode it and read `{"sort":"name","value":"Abiola Buka","id":"…"}`. That
is fine, because it only contains values the client already received. A
hand-edited cursor can only move the starting point within data that is
public anyway. The decoded contents are still validated (shape, UUID, value
type), and a garbage cursor is a 400.

**Why `sort` names equal response field names.** `?sort=deliveryFeeKobo`
sorts by the `deliveryFeeKobo` field the client sees in the response. There
is no mapping table to keep in sync, and the allow-list (`sortFields`)
decides which fields are sortable. Only non-null columns are allowed, because
`NULL` breaks the `<` comparison the cursor relies on.

**Why the service lists fields explicitly (`restaurantSelect`).** The
response shape is a contract. If a private column is added to the table
later, it will not appear in the API until someone adds it here on purpose.

**Name sorting follows the database's collation.** Postgres compares text
using the database's locale rules (here `English_United States.1252`),
which ignore hyphens when comparing. So "Adeoluwa-Adewunmi…" sorts before
"Adeoluwa Buka". JavaScript's `<` would put them the other way round.
Pagination is still correct, because the `ORDER BY` and the cursor `WHERE`
are both evaluated by Postgres with the same rules. The production database
may use a different collation, so the exact name order can differ between
local and live, but every page walk is still complete and gap-free.

**Why the helpers use `as Prisma.RestaurantWhereInput`.** `pagination.ts`
builds `where`/`orderBy` objects for *any* table, so it cannot know the exact
Prisma type for restaurants. Each service tells TypeScript the specific
type in one place. That is the only type assertion in the module.

### Alternatives rejected
| Rejected | Why |
|---|---|
| Offset pagination | Drifts under inserts and slows down at depth. Explained above. |
| Prisma's built-in `cursor:` option | It works, but hides the SQL. Writing the `WHERE` by hand makes it explainable line by line, and it handles non-unique sort columns explicitly. |
| Returning 400 for `limit=5000` | The brief says clamp. Clamping plus reporting `meta.limit` is kinder to clients. |
| Ignoring unknown query parameters | Silently wrong results on typos. |
| Page numbers (`?page=3`) | Just offset pagination with a different name. Same drift problem. |

### How to verify
```bash
npm run dev
# second terminal (PowerShell: use curl.exe):
curl "http://localhost:3000/api/v1/restaurants?limit=3"
curl "http://localhost:3000/api/v1/restaurants?city=lagos&cuisine=grill&sort=deliveryFeeKobo&order=desc&limit=5"

# next page: copy meta.nextCursor from the previous response
curl "http://localhost:3000/api/v1/restaurants?limit=3&cursor=PASTE_NEXT_CURSOR"

# ugly inputs: each should be 400 with a message naming the field
curl -i "http://localhost:3000/api/v1/restaurants?offset=-1"
curl -i "http://localhost:3000/api/v1/restaurants?sort=rating"
curl -i "http://localhost:3000/api/v1/restaurants?limit=abc"
curl -i "http://localhost:3000/api/v1/restaurants?cursor=garbage"
curl -i "http://localhost:3000/api/v1/restaurants/not-a-uuid"

# clamped, not rejected: meta.limit is 100
curl "http://localhost:3000/api/v1/restaurants?limit=5000"

# valid UUID that doesn't exist: 404
curl -i "http://localhost:3000/api/v1/restaurants/019590a0-0000-7000-8000-000000000001"
```

---

## Step 5 — Menu items, the nested menu route, and customers

### What was built
| Endpoint | What it returns |
|---|---|
| `GET /api/v1/menu-items` | Every dish across all restaurants, paginated. |
| `GET /api/v1/menu-items/:id` | One dish. |
| `GET /api/v1/restaurants/:id/menu` | One restaurant's dishes, with the same filters, sorting and pagination. |
| `GET /api/v1/customers` | Customers, paginated. **Only** id, name, city and timestamps. |
| `GET /api/v1/customers/:id` | One customer, same limited fields. |

### Files
| File | Purpose |
|---|---|
| `src/modules/menu-items/schemas.ts` | Sort fields and filters for dishes. Two query schemas: one for `/menu-items` (accepts `restaurantId`), one for the nested route (does not). |
| `src/modules/menu-items/service.ts` | `listMenuItems` (used by both list routes) and `getMenuItem`. |
| `src/modules/menu-items/routes.ts` | `/menu-items` handlers. |
| `src/modules/customers/*` | Same three-file pattern for customers. |
| `src/modules/restaurants/routes.ts` | Adds `GET /:id/menu`. |
| `src/http/validate.ts` | `booleanQueryParam` moved here so restaurants and menu items share it. |
| `src/app.ts` | Mounts `/menu-items` and `/customers`. |

### Query contracts
**Menu items** (`/menu-items` and `/restaurants/:id/menu`)
| Param | Type | Default | Notes |
|---|---|---|---|
| `limit`, `cursor`, `order` | same as restaurants | 20, none, `asc` | |
| `sort` | `name` \| `priceKobo` \| `createdAt` | `name` | |
| `category` | string | none | `mains`, `sides`, `soups`, `drinks`, `desserts` (case-insensitive) |
| `minPriceKobo` / `maxPriceKobo` | integer ≥ 0 | none | Inclusive range. min > max → 400. `12.5` → 400 (kobo are whole). |
| `isAvailable` | `true` \| `false` | none | |
| `restaurantId` | UUID | none | `/menu-items` only. On the nested route it is a 400 because the path already says which restaurant. |

**Customers**
| Param | Type | Default | Notes |
|---|---|---|---|
| `sort` | `name` \| `createdAt` | `createdAt` (`desc`) | |
| `city` | string | none | Exact, case-insensitive. |
| `name` | string, ≥ 2 chars | none | Partial, case-insensitive: `ade` matches "Adeboye" and "Chisom Gbogboade". |

### Why it works this way

**One service function serves two routes.** `/menu-items?restaurantId=X`
and `/restaurants/X/menu` return the same thing. The nested route validates
its query, then calls `listMenuItems({ ...query, restaurantId: id })`, adding
the id from the path. The filtering, cursor and count logic exists once, so
the two can never drift apart.

**Why both routes exist.** The nested route is how a client *thinks* about
the data ("show me this restaurant's menu"), and the brief asks for it. The
flat route with a filter is more flexible: all soups under ₦5,000 across
every restaurant is a query the nested route cannot express.

**Unknown restaurant → 404, not an empty menu.** `/restaurants/<unknown>/menu`
could return `data: []`, but that would say "this restaurant has no dishes",
which is a different claim from "this restaurant does not exist". The route
checks the restaurant first, so the client gets the true answer.

**Customer privacy.** This API has no authentication, so anything it returns
is readable by anyone on the internet. `customerSelect` includes only `id`,
`name`, `city`, `createdAt`, `updatedAt`. Email and phone stay in the database
(they exist for the business, not the public). `email` is also not a filter
or sort field, so a caller cannot probe "does this email exist?" through
`?email=` either. Verified: 100 customers fetched, 0 occurrences of an email
or phone in the response.

**`min > max` is a 400, not an empty list.** `minPriceKobo=500000&maxPriceKobo=100000`
can never match anything, so it is certainly a client mistake. Zod's
`.refine()` checks the two fields together and reports the problem on
`minPriceKobo`.

**Prices are filtered in kobo.** The API speaks one money unit everywhere.
A client wanting "under ₦5,000" sends `maxPriceKobo=500000`. Accepting
naira in filters but returning kobo in responses would invite off-by-100
bugs in every client.

**Customer name search needs 2+ characters.** `?name=a` would match almost
every customer and do a full scan for no useful result. Two characters is a
minimal guard. This is a policy choice, not a security control.

**Ties in sorting are real here.** All ~3,300 menu items were inserted by one
`createMany`, so many share the same `createdAt` down to the millisecond, and
hundreds share a price. Walking `/menu-items?sort=priceKobo&order=desc` and
`?sort=createdAt` page by page still returned every row exactly once. The
`id` tie-breaker from step 4 is what makes that work.

### Alternatives rejected
| Rejected | Why |
|---|---|
| Returning customer email/phone | Personal data on an unauthenticated public API. |
| Not exposing customers at all | The brief says every resource gets a collection and item endpoint. Exposing a safe subset satisfies that without leaking anything. |
| Embedding the full menu in `GET /restaurants/:id` | Makes every restaurant response heavy (8–20 dishes) even when the client only wants the name. A separate paginated route lets the client ask for the menu only when it needs it. |
| A separate query implementation for the nested route | Duplicate logic that would drift. |

### How to verify
```bash
npm run dev
# second terminal (PowerShell: curl.exe)
curl "http://localhost:3000/api/v1/menu-items?category=soups&maxPriceKobo=500000&sort=priceKobo&limit=5"
curl "http://localhost:3000/api/v1/customers?city=abuja&limit=3"          # no email, no phone

# nested menu: take an id from the first command's restaurantId
curl "http://localhost:3000/api/v1/restaurants/PASTE_RESTAURANT_ID/menu"

# errors
curl -i "http://localhost:3000/api/v1/menu-items?minPriceKobo=500000&maxPriceKobo=100000"   # 400
curl -i "http://localhost:3000/api/v1/restaurants/019590a0-0000-7000-8000-000000000001/menu" # 404
curl -i "http://localhost:3000/api/v1/customers?email=x"                                    # 400
```

---

## Step 6 — Orders: create, list, read

### What was built
| Endpoint | Result |
|---|---|
| `POST /api/v1/orders` | `201 Created` with the full order and a `Location` header pointing at it. |
| `GET /api/v1/orders` | Paginated list, filterable by status, restaurant, customer and date range. |
| `GET /api/v1/orders/:id` | One order with its line items. |

Also in this step:
- Bodies larger than `JSON_BODY_LIMIT` (100 KB) now return **413** instead of
  falling through to a 500. That was a gap in step 1.
- New config values `ORDER_REFERENCE_MAX_ATTEMPTS` and `JSON_BODY_LIMIT`.

### Files
| File | Purpose |
|---|---|
| `src/modules/orders/schemas.ts` | Body schema for creating an order; query schema for the list. |
| `src/modules/orders/service.ts` | `createOrder` (the business rules), `listOrders`, `getOrder`. |
| `src/modules/orders/reference.ts` | Generates `ROX-XXXXXXXX` codes with `crypto.randomInt`. |
| `src/modules/orders/routes.ts` | Handlers. |
| `src/config.ts`, `.env.example` | `ORDER_REFERENCE_MAX_ATTEMPTS`, `JSON_BODY_LIMIT`. |
| `src/http/error-handler.ts`, `src/http/errors.ts` | 413 `PAYLOAD_TOO_LARGE`. |

### Request body for `POST /orders`
```json
{
  "customerId": "01a0f0af-4794-707f-bc93-ce7f2b5c3af6",
  "restaurantId": "01a0f0af-3ca3-7555-8bdb-f5f43cd91290",
  "deliveryAddress": "12 Admiralty Way, Lekki, Lagos",
  "items": [
    { "menuItemId": "01a0f0af-…", "quantity": 2 },
    { "menuItemId": "01a0f0af-…", "quantity": 1 }
  ]
}
```
There are no prices in the body. Any extra field, such as `"totalKobo": 1`,
is rejected with 422.

### What `createOrder` does, in order
1. **Shape check (Zod).** Every field is present and well-typed. Quantity is
   1–99 (`ORDER_MAX_QUANTITY_PER_LINE`), there are 1–20 lines
   (`ORDER_MAX_LINES`), and no dish appears twice. Failure → 422 listing
   *every* bad field, e.g. `items.1.quantity: must be at most 99`.
2. **Customer and restaurant exist.** Otherwise 422 on `customerId` / `restaurantId`.
3. **Restaurant is open.** Otherwise 422.
4. **Load the dishes from this restaurant only**
   (`WHERE id IN (...) AND restaurantId = :restaurant`). A dish from another
   restaurant is simply not found, and becomes 422
   `items.N.menuItemId: is not on this restaurant's menu`.
5. **Each dish is available** and in the restaurant's currency.
6. **Price each line from the menu:** `lineTotal = menu price × quantity`.
7. **Subtotal meets the restaurant's minimum order.** Otherwise 422 on `items`.
8. **Write the order and its lines in one nested create.** Prisma runs it
   in a transaction: all rows are saved, or none are.
9. If the random reference happens to already exist (unique constraint
   error `P2002`), generate a new one and try again, up to
   `ORDER_REFERENCE_MAX_ATTEMPTS` times.

Problems from steps 2–5 are **collected**, not thrown one at a time.
A client whose order has two bad dishes gets both in one response.

### Why it works this way

**The server calculates money; the client never sends it.** If the client
could send `totalKobo`, anyone could order a ₦15,000 pizza for ₦1. The strict
body schema rejects price fields outright, and the service reads prices from
`menu_items`. The check constraints from step 2 then double-check the
arithmetic (`total = subtotal + fee`, `line = price × quantity`) at the
database level.

**Price snapshots.** The order line stores `nameSnapshot` and
`unitPriceKobo` copied from the menu *at this moment*. If the restaurant
changes the price tomorrow, this order still shows what the customer paid.

**Why 422 for business rules, not 400 or 409.** The JSON parsed fine (so not
400). The request is about creating a new order, and nothing about an
*existing* resource's state conflicts (so not 409). The body cannot be
processed as given: 422 Unprocessable Content. A body that isn't valid JSON
at all is 400, and one that's too big is 413.

**Why a referenced id that doesn't exist is 422, not 404.** 404 means "the
URL you asked for doesn't exist". Here the URL `/orders` exists. What is
wrong is a *value inside the body*, so it is reported against that field.

**Missing fields name themselves.** Zod's default message for a missing
string is "expected string, received undefined". Each field's error function
checks `issue.input === undefined` and says `is required` instead, as the brief
asks ("422 with the field named").

**Why `deliveryAddress` is never returned.** This API has no
authentication, and `GET /orders` is public. Returning addresses would
publish where hundreds of customers live, the same reasoning that keeps
customer email and phone private (step 5). The address is stored (verified
in the database) for the restaurant's use, just not exposed by this public
API.

**Why the list leaves out line items.** A page of 100 orders with ~3 lines
each would triple the response size for data most list views do not show.
`GET /orders/:id` has the lines. That is the usual summary/detail split.

**`Location` header.** REST convention for `201 Created`: it tells the
client the URL of the thing just created, so it does not have to build it
itself.

**Order reference: why random, why these letters.** A sequential number
(`ORD-1001`, `ORD-1002`) would reveal order volume and let people guess other
orders' codes. `crypto.randomInt` is unpredictable, unlike `Math.random`.
The alphabet leaves out `0/O` and `1/I` so the code survives being read over
the phone. 32⁸ ≈ 1.1 trillion combinations make a collision extremely
unlikely. The unique constraint guarantees one can never be *stored*, and
the retry loop handles the rare case without bothering the client.

**Why `ORDER_REFERENCE_MAX_ATTEMPTS` is config.** Working rule 5 says every
retry count is a tunable number and belongs in config. The loop must also
have *some* bound, otherwise a bug causing a different unique violation
would retry forever.

**Known limitation: no idempotency key on POST.** If a client's network
drops after the server saved the order, a retry creates a second order.
The fix is an `Idempotency-Key` header stored with a unique constraint. It is
not in the Task 1 brief (Task 2 covers idempotency), so it is noted here
rather than built.

**Known limitation: anyone can place an order for any customer.** The brief
says no authentication. With auth, `customerId` would come from the logged-in
user instead of the body.

### Tested (while building)
| Input | Result |
|---|---|
| Valid order, 2 lines | 201, subtotal/fee/total match a hand calculation, `Location` URL returns the same order, no `deliveryAddress` in response |
| `{ "items": [] }` | 422: `customerId`, `restaurantId`, `deliveryAddress` "is required", `items` "must contain at least one item" |
| Extra `totalKobo` | 422: `totalKobo is not a recognised field` |
| Quantity 0, quantity 1000, id `"x"` | 422 naming `items.0.quantity`, `items.1.quantity`, `items.2.menuItemId` |
| Same dish twice | 422 on `items.1.menuItemId` |
| Dish from another restaurant + unavailable dish | 422, both reported together |
| Closed restaurant | 422 |
| Unknown customer and restaurant | 422, both reported |
| ₦750 order at a ₦3,000-minimum restaurant | 422 on `items` |
| `{"customerId": ` | 400 not valid JSON |
| 200 KB body | 413 |
| `[1,2]` | 422 expected object |
| `?status=shipped`, `?createdAfter=yesterday`, after > before | 400 |
| Walk all orders by `totalKobo desc`, by `status=delivered`, by an August date range | every row exactly once, filters respected |

The test order was deleted afterwards so the local data matches the seed.

### Alternatives rejected
| Rejected | Why |
|---|---|
| Accepting prices from the client | Lets anyone set their own price. |
| Stopping at the first error | The client fixes one thing, resubmits, and hits the next. Reporting all at once is kinder. |
| 404 when `restaurantId` in the body doesn't exist | 404 is about the URL, not body values. |
| Returning `deliveryAddress` | Publishes home addresses on an unauthenticated API. |
| Sequential order numbers | Enumerable, and reveal business volume. |
| A separate query per line to load dishes | One `WHERE id IN (...)` query loads all of them. |

### How to verify
```bash
npm run dev
# get ids to use:
curl "http://localhost:3000/api/v1/customers?limit=1"
curl "http://localhost:3000/api/v1/restaurants?isOpen=true&sort=minimumOrderKobo&limit=1"
curl "http://localhost:3000/api/v1/restaurants/RESTAURANT_ID/menu?isAvailable=true&limit=2"

# create (bash). In PowerShell, put the JSON in a file and use -d "@order.json".
curl -i -X POST http://localhost:3000/api/v1/orders -H "Content-Type: application/json" \
  -d '{"customerId":"CUSTOMER_ID","restaurantId":"RESTAURANT_ID","deliveryAddress":"12 Admiralty Way, Lekki","items":[{"menuItemId":"MENU_ITEM_ID","quantity":2}]}'
# expect 201 and a Location header

# missing fields: 422 naming each one
curl -i -X POST http://localhost:3000/api/v1/orders -H "Content-Type: application/json" -d '{}'

curl "http://localhost:3000/api/v1/orders?status=pending&sort=totalKobo&order=desc&limit=5"
```

---

## Step 7 — Updating and deleting orders (the state machine)

### What was built
| Endpoint | Result |
|---|---|
| `PATCH /api/v1/orders/:id` | Change `status` and/or `deliveryAddress`. 200 with the updated order. |
| `DELETE /api/v1/orders/:id` | 204 No Content. Only `pending` or `cancelled` orders. |

### Files
| File | Purpose |
|---|---|
| `src/modules/orders/status.ts` | The lifecycle as data: allowed transitions, when the address is editable, which states are deletable. |
| `src/modules/orders/schemas.ts` | `updateOrderBodySchema`. `deliveryAddressField` is now shared by create and update. |
| `src/modules/orders/service.ts` | `updateOrder` and `deleteOrder`. |
| `src/modules/orders/routes.ts` | PATCH and DELETE handlers. |
| `src/http/errors.ts` | `conflict()` can now carry `details`. |

### The state machine
```
pending ──▶ confirmed ──▶ preparing ──▶ out_for_delivery ──▶ delivered
   │            │
   └────────────┴──▶ cancelled
```
| From | Allowed next | Forbidden examples |
|---|---|---|
| pending | confirmed, cancelled | pending → delivered (skipping steps) |
| confirmed | preparing, cancelled | confirmed → pending (going back) |
| preparing | out_for_delivery | preparing → cancelled (food already made) |
| out_for_delivery | delivered | out_for_delivery → preparing |
| delivered | *(none, final)* | delivered → pending, delivered → cancelled |
| cancelled | *(none, final)* | cancelled → confirmed |

Setting the status an order *already has* is allowed and does nothing.

**What enforces it:** `allowedTransitions` in `status.ts`, checked in
`updateOrder`. The Postgres enum guarantees the status is one of six
*values*. It does not know which *moves* are legal, so the transition rules
live in code in exactly one place.

**The non-obvious rule:** cancelling is allowed from `confirmed` but **not**
from `preparing`. Once the kitchen has started cooking, the restaurant has
spent money on ingredients, so the customer can no longer cancel through the
API. That rule appears when you draw the machine and ask "what does each
arrow cost the restaurant?"

### Why it works this way

**Why 409 Conflict for an illegal transition.** The request is well-formed
(so not 400) and every field is valid on its own (so not 422). It conflicts
with the *current state of the resource*, which is exactly what 409 means. The
same request (`status: cancelled`) is fine on a pending order and a 409 on
a delivered one. The error's `details` tell the client what *is* allowed:
`from pending the next status can only be: confirmed, cancelled`.

**Why PATCH only accepts `status` and `deliveryAddress`.** Changing the
items, restaurant or customer after the fact would make the stored totals
and price snapshots meaningless. That is a new order, not an edit. The strict
schema rejects anything else (e.g. `totalKobo`) with 422.

**The race condition, and how it is closed.** `updateOrder` does:
1. Read the order's current status.
2. Decide whether the change is allowed from that status.
3. Write the change.

Between 1 and 3, another request can change the order. Example: two staff
members press "confirm" and "cancel" at the same moment. Both read
`pending`, and both decide their change is legal. Without protection, both
writes succeed: each client gets `200`, but only the last write survives.
One of them was told something false.

The fix is in step 3: `updateMany({ where: { id, status: <what we read> } })`.
The write only happens if the status is *still* what the decision was based
on. Postgres makes that check-and-write a single atomic statement.
`updateMany` returns how many rows it changed. `0` means another request got
there first, and this one gets `409 "Order was changed by another request at
the same time; fetch it again and retry"`.

This is **optimistic concurrency control**: no locks are held while
deciding. The write just refuses if the assumption no longer holds.

**Tested with 30 real races:** for each of 30 fresh pending orders, a
"confirm" and a "cancel" PATCH were sent simultaneously.
| Outcome | Count |
|---|---|
| confirm 200, cancel **409 "changed by another request"**, final `confirmed` | 29 |
| confirm 200, cancel 200, final `cancelled` (requests ran one after the other, and confirmed → cancelled is legal) | 1 |

Never did both succeed while the final state disagreed with what a client
was told.

**DELETE uses the same idea.** `deleteMany({ where: { id, status: { in:
['pending','cancelled'] } } })` deletes only if the order is deletable at the
moment of deletion. Checking first and deleting second would leave a gap
where the order could move to `preparing` and then be deleted. If nothing was
deleted, a follow-up read tells the two cases apart: no order means 404; an
order in the wrong state means 409.

**Why only pending and cancelled orders can be deleted.** A delivered order
is a financial record: the customer paid and the restaurant was paid. Deleting
it would break accounting and history. A pending order never happened, and a
cancelled one was called off, so removing them loses nothing important.

**DELETE returns 204 with no body.** There is nothing left to show. A second
DELETE of the same id returns 404. The *effect* is still idempotent (the
order is gone either way). The response differs, which HTTP allows.

**The no-op PATCH skips the write.** Setting `delivered` on a delivered order
returns 200 without writing, so `updatedAt` does not change. Repeating a
PATCH therefore leaves the resource exactly as it was, which is what makes
PATCH idempotent here. Tested: `updatedAt` was identical before and after.

### Tested (while building)
| Request | Result |
|---|---|
| pending → confirmed → preparing → out_for_delivery → delivered | 200 each |
| delivered → pending, delivered → cancelled | 409, "delivered is final" |
| delivered → delivered | 200, `updatedAt` unchanged |
| pending → delivered | 409, lists `confirmed, cancelled` |
| preparing → cancelled | 409, lists `out_for_delivery` |
| address change on confirmed | 200 |
| address change on delivered | 409 |
| `{}`, `{status:"shipped"}`, `{totalKobo:1}` | 422 |
| unknown id / malformed id | 404 / 400 |
| DELETE pending, DELETE cancelled | 204, empty body, then GET is 404 |
| DELETE same order again | 404 |
| DELETE delivered | 409 |

Test orders were removed afterwards; the local data is back to the seed.

### Alternatives rejected
| Rejected | Why |
|---|---|
| Read-then-update without the status condition | Loses updates under concurrency. Proven above: 29 of 30 races would have been silently wrong. |
| `SELECT ... FOR UPDATE` (pessimistic locking) | Also correct, but holds a lock across the decision and needs an interactive transaction. The conditional update achieves the same guarantee with one statement. |
| A database trigger enforcing transitions | Works, but moves the rules into PL/pgSQL where they are harder to read, test and explain. |
| Soft delete (`deletedAt`) | Not required by the brief. Only never-happened or cancelled orders can be deleted at all. |
| 422 for illegal transitions | The body is valid. What is wrong is the resource's current state, which is what 409 means. |
| Allowing `status` to go backwards | A delivered order becoming pending again would re-enter the kitchen queue. |

### How to verify
```bash
npm run dev
# create an order as in step 6 and copy its id, then:
curl -i -X PATCH http://localhost:3000/api/v1/orders/ORDER_ID -H "Content-Type: application/json" -d '{"status":"confirmed"}'   # 200
curl -i -X PATCH http://localhost:3000/api/v1/orders/ORDER_ID -H "Content-Type: application/json" -d '{"status":"pending"}'     # 409
curl -i -X PATCH http://localhost:3000/api/v1/orders/ORDER_ID -H "Content-Type: application/json" -d '{"status":"cancelled"}'   # 200
curl -i -X DELETE http://localhost:3000/api/v1/orders/ORDER_ID                                                                 # 204
curl -i -X DELETE http://localhost:3000/api/v1/orders/ORDER_ID                                                                 # 404

# a seeded delivered order cannot be deleted:
curl "http://localhost:3000/api/v1/orders?status=delivered&limit=1"
curl -i -X DELETE http://localhost:3000/api/v1/orders/DELIVERED_ORDER_ID                                                       # 409
```

---

## Step 8 — Automated tests for the ugly inputs (and everything else)

### What was built
A test suite (`npm test`) of **91 tests** in 5 files that re-checks
everything tested by hand in steps 4–7. It runs against its own throwaway
database, never the development data.

### Files
| File | What it tests |
|---|---|
| `vitest.config.ts` | Points tests at `TEST_DATABASE_URL`, raises the rate limit for tests, runs files one at a time. |
| `tests/global-setup.ts` | Before the suite: **drops and recreates** the test database, runs the migrations, seeds 20 restaurants / 30 customers / 40 orders. |
| `tests/helpers.ts` | Builds the app once, and provides `api()`, `first()`, `validOrderBody()`. |
| `tests/ugly-inputs.test.ts` | Every bullet of the brief's step 4, plus other hostile inputs. |
| `tests/pagination.test.ts` | Full page walks with no gaps or duplicates, filters on every page, the past-the-end cursor, identical envelopes, no private fields leaking. |
| `tests/orders.test.ts` | Server-side pricing, every 422 rule, the state machine, the concurrency race, delete rules. |
| `tests/order-reference.test.ts` | Forces reference collisions with a mock to prove the retry loop. |
| `tests/status.test.ts` | All 36 from→to pairs of the transition table. |
| `tests/tsconfig.json` | Lets `npm run typecheck` check the tests too. |
| `.env.example` | `TEST_DATABASE_URL`. |

### The brief's step 4, mapped to tests
| Brief says | Test | Asserts |
|---|---|---|
| limit 5000 → clamped | `clamps a limit of 5000…` | 200, `meta.limit` 100, 100 rows |
| negative offset → 400 + clear message | `returns 400 … negative offset` | 400, field `offset`, message mentions cursor |
| unknown sort → 400 | `… unknown sort field …` | 400 listing the allowed fields |
| malformed id → 404 or 400, never 500 | `returns 400 (never 500) … on /%s/:id` | 400 on all four resources |
| POST missing field → 422 naming it | `returns 422 naming every missing…` | 422, `customerId: is required`, etc. |

### Why it works this way

**Integration tests against a real Postgres, not mocks.** Most of what can
go wrong here lives in the database: the keyset `WHERE`, check constraints,
the conditional update that closes the race. A mocked database would test
our assumptions about Postgres, not Postgres. supertest sends real HTTP
requests into `createApp()` without opening a port. This is why step 1 kept
building the app separate from starting it.

**Why the test database is dropped and recreated every run.** Tests create
and delete orders. Starting from a freshly migrated and seeded database
means every run begins in the same state, so a test cannot pass or fail
because of what a previous run left behind. It also re-proves on every run
that the migrations and the seed work on an empty database.

**The `_test` safety catch.** `global-setup.ts` runs `DROP DATABASE`. It
refuses unless the database name ends in `_test`. If someone copies a
production URL into `TEST_DATABASE_URL` by mistake, the suite stops with an
error instead of wiping production.

**Proving the tests can fail.** A test that has never failed might not be
checking anything. Two bugs were introduced on purpose, then removed:
| Bug introduced | Tests that failed |
|---|---|
| Cursor without the `id` tie-breaker | 2 page walks (menu items by price, by `createdAt`): rows went missing where values tie |
| `preparing → cancelled` allowed | the unit test for that pair, and the HTTP state-machine test |

The originals were restored and confirmed byte-identical, then the suite
was green again. The dev database still had its 800 orders afterwards.

**Mocking only the one random thing.** Order references are random, so a
collision cannot be produced on demand. `order-reference.test.ts` replaces
just `generateOrderReference` with a scripted list:
- `[existing, new]`: first insert collides, second succeeds → 201 with the new reference.
- `[existing, existing, existing, unused]`: three collisions → 500, and
  exactly three attempts were made (`ORDER_REFERENCE_MAX_ATTEMPTS`).

A 500 is the honest answer there: the client did nothing wrong. The error
handler logs the database error, so a `P2002` error printed during the test
run is expected.

**The race test checks honesty, not timing.** It cannot control which of
two simultaneous requests runs first. So it asserts the property that must
hold whatever the order: every `200` agrees with the final state, and at
least one request wins.

**Why the rate limit is raised in tests.** Step 9 adds a limit of 100
requests per minute per IP. The suite sends hundreds of requests from one
"IP", so it sets `RATE_LIMIT_MAX_REQUESTS=100000`. The rate limit gets its
own test with a small limit in step 9.

**Why files run one at a time.** All test files share one database.
Running them in parallel would let one file's orders appear in another
file's page walks. `fileParallelism: false` trades a few seconds for
reliability.

### Alternatives rejected
| Rejected | Why |
|---|---|
| Testing against the dev database | Tests would create and delete real rows and depend on leftover state. |
| Mocking Prisma | Would not catch keyset, constraint or concurrency bugs, which are the ones that matter most here. |
| Docker/Testcontainers for the test DB | More moving parts. A local Postgres with a `_test` database is simpler and already installed. |
| Only testing the happy path | The brief's grading is about the ugly inputs. |

### How to verify
```bash
npm test                 # 5 files, 91 tests, all passing
npm run typecheck        # checks src/ and tests/

# try the safety catch with a name that does not end in _test:
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rox_guard_check npx vitest run
# PowerShell: $env:TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rox_guard_check"; npx vitest run; Remove-Item Env:TEST_DATABASE_URL
# stops before touching anything: Refusing to reset "rox_guard_check"
```

---

## Step 9 — Rate limiting

### What was built
Every request under `/api` is counted per client IP. The 101st request
within one minute gets:
```
HTTP/1.1 429 Too Many Requests
RateLimit: "100-in-1min"; r=0; t=52
RateLimit-Policy: "100-in-1min"; q=100; w=60; pk=:YmIwY2Q1MTM2YWU1:
Retry-After: 52
{"error":{"code":"RATE_LIMITED","message":"Too many requests: the limit is 100 per 60 seconds. Retry after the number of seconds in the Retry-After header."}}
```
(Real output from a local server with the production settings: 100 requests
returned 200, the 101st returned the above.)

### Files
| File | Purpose |
|---|---|
| `src/http/rate-limit.ts` | `createRateLimiter(settings)`: wraps `express-rate-limit` and writes our 429 error envelope. |
| `src/app.ts` | Mounts the limiter on `/api`. `createApp()` now accepts optional settings, so tests can use a tiny limit. |
| `tests/rate-limit.test.ts` | 5 tests: 429 + Retry-After, quota headers, separate buckets per IP, `/health` exempt, rejected requests still count. |
| `package.json` | Adds `express-rate-limit`. |

### Where the numbers live (defence question)
```
.env / host dashboard   RATE_LIMIT_WINDOW_MS=60000   RATE_LIMIT_MAX_REQUESTS=100
        ▼
src/config.ts           validated by Zod → config.rateLimit = { windowMs, maxRequests }
        ▼
src/app.ts              createRateLimiter(options.rateLimit ?? config.rateLimit)
        ▼
src/http/rate-limit.ts  uses settings.windowMs and settings.maxRequests; contains no numbers
```
**Why there:** the limit is an operational decision, not business logic. If
the API is being abused at 3 a.m., the fix should be changing one environment
variable in Render's dashboard and restarting, not editing code, reviewing,
and redeploying. It can also differ per environment (generous locally, stricter
in production) with the same code. Zod validates it at startup, so
`RATE_LIMIT_MAX_REQUESTS=abc` stops the server instead of silently
disabling the limit.

### Why it works this way

**Fixed window per IP.** The limiter keeps a counter per IP that resets
every `windowMs`. It is simple and cheap, and `Retry-After` is easy to
compute: seconds until the window resets (52 in the example above).

**`Retry-After` is not automatic.** Reading the library's source showed it
only sets `Retry-After` when standard or legacy rate-limit headers are
enabled. `standardHeaders: 'draft-8'` turns that on. It also adds `RateLimit`
headers to *every* response (`r=` requests remaining, `t=` seconds to reset),
so a polite client can slow down before it ever sees a 429.

**Why the limiter runs before `express.json()`.** Checking the counter is
cheap; parsing a 100 KB JSON body is not. Turning an abuser away before
reading their body saves the most work.

**Why `/health` is exempt.** The host pings `/health` to decide whether the
app is alive. If an attacker used up the quota of the IP the host checks
from, a rate-limited health check would make the host think the app is down
and restart it repeatedly. The limiter is mounted on `/api` only.

**Rejected requests still count.** A request that gets a 400 still used a
connection and CPU. If bad requests were free, an attacker could send
endless malformed requests. Tested: 3 bad requests used up a limit of 3.

**Why `trust proxy` matters here.** On Render, every request arrives from
Render's load balancer. Without `trust proxy`, `req.ip` would be the
balancer's address for *everyone*, and the whole internet would share one
bucket of 100. With `TRUST_PROXY_HOPS=1`, Express reads the client IP that
the proxy appended to `X-Forwarded-For`. Trusting exactly one hop matters:
a client can write anything into `X-Forwarded-For`, but Render appends the
real address last, and Express only trusts that last entry. Setting
`trust proxy` to `true` (trust everything) would let any client pick their
own IP and escape the limit.

**Why tests fake IPs with `X-Forwarded-For`.** With `trust proxy` = 1,
supertest can set `X-Forwarded-For` exactly as Render would. Each test uses
its own address (from `203.0.113.0/24`, a range reserved for documentation),
so tests do not share counters.

**Why `createApp()` takes options.** The real limit is 100 per minute.
Testing it would need 101 requests per test, and the other test files need
the limit *off* (they send hundreds of requests). `createApp({ rateLimit:
{ windowMs: 60000, maxRequests: 3 } })` builds an app with a tiny limit
for the rate-limit tests only. Production calls `createApp()` with no
options and gets the config values.

**IPv6.** One IPv6 user can own a whole block of addresses. The library
groups IPv6 addresses by `/56` subnet by default, so rotating addresses
within one's own block does not give fresh quotas.

### Known limitations
| Limitation | Consequence | Fix when it matters |
|---|---|---|
| Counters live in the server's memory | A restart resets all counters. With two server instances, each counts separately, so the effective limit doubles. | A shared store (Redis) for the counters. One instance is enough for this project. |
| Fixed window | A client can send 100 at 0:59 and 100 at 1:00: 200 in two seconds. | A sliding window or token bucket. Acceptable here. |
| IP-based | Many users behind one office or mobile carrier NAT share a bucket. | Per-API-key limits, once there are API keys (there is no auth in this brief). |

### Alternatives rejected
| Rejected | Why |
|---|---|
| Numbers written in the middleware | Brief and working rules: they belong in config. |
| Limiting `/health` too | Could get the app restarted by the host during an attack. |
| `trust proxy: true` | Lets any client spoof `X-Forwarded-For` and bypass the limit. |
| Writing a limiter by hand | `express-rate-limit` is small, widely used, handles IPv6 subnets and standard headers. The part worth explaining is the configuration, which is ours. |

### How to verify
```bash
npm test                     # 6 files, 96 tests (5 new rate-limit tests)

npm run dev
# bash: send 101 requests, then show the last response's status and headers
for i in $(seq 1 100); do curl -s -o /dev/null "http://localhost:3000/api/v1/restaurants?limit=1"; done
curl -i "http://localhost:3000/api/v1/restaurants?limit=1"
# PowerShell:
# 1..100 | % { curl.exe -s -o NUL "http://localhost:3000/api/v1/restaurants?limit=1" }
# curl.exe -i "http://localhost:3000/api/v1/restaurants?limit=1"

# expect: HTTP/1.1 429 Too Many Requests, a Retry-After header, the RATE_LIMITED envelope
curl -i http://localhost:3000/health       # still 200
```

---

## Step 10 — API documentation (README) and design decisions

### What was built
`README.md` is now the complete API documentation. For every endpoint it
gives the method, path, query parameters with types and defaults, request
body rules, a curl command, a real example response, and the errors it can
return. It also has the brief's required **Design decisions** section.

### Files
| File | Change |
|---|---|
| `README.md` | Rewritten: conventions, 12 endpoints, resource design (kept from step 0), design decisions, how to run, project layout. |
| `src/seed/catalogue.ts`, `src/seed/seed.ts` | Menu descriptions changed from lorem ipsum to realistic lines (see below). |
| `docs/WALKTHROUGH.md` | Step 3 figures updated after the reseed. |

### How the README is organised, and why
1. **Conventions first.** Envelope, errors, money, ids, pagination, sorting,
   filtering, rate limits and privacy are explained *once*. Each endpoint
   then only lists what is specific to it. A reader who knows the
   conventions can use any endpoint from its parameter table alone.
2. **Endpoints**, each with a copy-pasteable curl and its real response.
3. **Resource design**: the tables from step 0.
4. **Design decisions**: the brief's four required topics (why these
   resources, why generated ids, why cursor over offset, the envelope shape),
   plus versioning, adding a field without breaking clients, and where the
   tunable numbers live. These are the defence questions, answered where a
   reader will find them.
5. **Running it yourself**, for the submission checklist's "runs from a
   fresh clone using only the README".

### Why every example is real output
Example responses were captured from the running API by a script, not typed
from memory. Typed examples drift: a field gets renamed in code but not in
the docs, and a developer following the docs gets surprised. After writing,
every id, timestamp, reference, description, cursor and money value in the
README was checked mechanically against the captured output:
```
30 ids, 11 timestamps, 3 references, 4 descriptions, 5 cursors, 31 amounts → 0 not found in the capture
```
**A mistake caught by that check.** While reading the capture, I had hidden
the `description`/`createdAt`/`updatedAt` lines to keep the output short, and
then wrote plausible-looking values for those fields into the first draft.
They were invented. The cross-check exists precisely for that. All of them
were replaced with the captured values before this step was finished.

**Why the ids will change once more.** UUIDs are generated when the seed
runs, so production (step 11) will have different ids from any local
database. After deployment, the examples are re-captured from the live URL
and the base URL is replaced, so every curl in the README works as pasted.

### The lorem ipsum problem (found while writing the docs)
The first capture showed menu descriptions like *"Sustineo templum pecus
despecto consuasor solio aeger decens solus confido."* That is Faker's Latin
filler. It contradicts the brief's "realistic data" and the claim in the
step 3 walkthrough. The fix replaced `faker.lorem.sentence()` with a pick
from short realistic lines per category (`descriptionsByCategory` in
`catalogue.ts`).

**Consequence worth understanding:** removing one Faker call changes the
*sequence* of random numbers for everything generated after it. Every name,
slug and order reference changed. The seed's natural keys therefore no
longer match the rows already in a local database, so an old database must be
**reset and reseeded** (not just reseeded) or it would end up with both
sets. Production has not been seeded yet, so nothing live is affected. Row
counts moved slightly: 3,295 menu items and 2,007 order lines. The new seed
was verified on a scratch database: run 1 inserted everything, run 2 inserted
nothing. All 96 tests pass on it.

### Alternatives rejected
| Rejected | Why |
|---|---|
| OpenAPI/Swagger UI | The brief says the README *is* the documentation. A generated spec would be extra tooling to explain, and the brief asks to build only what is required. |
| Typing example responses by hand | They drift from reality. Proven by the invented values caught above. |
| Documenting only the happy path | The grading is about error handling. Each endpoint lists its errors and shows at least one real error body. |
| Keeping lorem ipsum descriptions | Fails "realistic data", and looks unfinished to anyone reading the API. |

### How to verify
```bash
# the README is the test: follow "Running it yourself" from a fresh clone.
# Because the seed changed, reset your local database first:
npx prisma migrate reset --force      # drops, recreates and migrates the dev database
npm run db:seed                       # 300 / 3295 / 500 / 800 / 2007
npm run db:seed                       # all "inserted" are 0

npm run dev
curl "http://localhost:3000/api/v1/restaurants?city=lagos&cuisine=grill&sort=deliveryFeeKobo&limit=2"
curl "http://localhost:3000/api/v1/menu-items?limit=3"      # descriptions are real sentences
npm test                                                     # 96 passing
```
(Ids in the README examples come from a scratch database and won't match
your local one. Replace them with ids from your own list responses.)

---

## Step 11 — Deployment (Render + Neon)

### What was built
Configuration for deploying the API to **Render** (web service) with a
managed PostgreSQL on **Neon**, plus the runbook to do it.

### Files
| File | Purpose |
|---|---|
| `render.yaml` | Render Blueprint: build and start commands, health check, Node version, and every environment variable. Secrets are marked `sync: false`, so Render asks for them in the dashboard and they never enter git. |
| `prisma.config.ts` | Uses `DIRECT_DATABASE_URL` for the Prisma CLI when it is set. |
| `.env.example` | Documents `DIRECT_DATABASE_URL`. |

### Why it works this way

**Why Render + Neon.** Render runs the Node process from the GitHub repo and
redeploys on every push. Neon is managed Postgres whose free tier does not
expire. Render's own free Postgres expires after 30 days (Render's free-tier terms at the time of writing), and a grader may
open the live URL later than that. Both are placed in Frankfurt
(Render `frankfurt`, Neon AWS `eu-central-1`) so each query does not cross
an ocean.

**Two connection strings.** Neon offers a *pooled* connection (through
PgBouncer) and a *direct* one.
- The **app** uses the pooled one (`DATABASE_URL`). A pooler shares a small
  number of real database connections among many clients, which suits a
  web server.
- **Migrations** use the direct one (`DIRECT_DATABASE_URL`). `prisma migrate`
  takes a session-level advisory lock so two deploys cannot migrate at once.
  A transaction-mode pooler hands your session to someone else between
  transactions, so the lock cannot be held. The CLI therefore uses the direct
  connection whenever it is set.

**Build command: `npm ci --include=dev && npm run build`.**
- `npm ci` installs exactly what `package-lock.json` says, the same versions
  tested locally.
- `NODE_ENV=production` makes npm skip devDependencies by default, but
  the build needs `typescript` and the `prisma` CLI. `--include=dev` keeps them.
- `npm run build` = `prisma generate && tsc`.

**Start command: `npm run db:deploy && npm start`.** `prisma migrate deploy`
applies only migrations that have not been applied yet (it records them in a
`_prisma_migrations` table), so running it on every start is safe. When a
future commit adds a migration, the deploy applies it before the new code
starts. The `&&` means the server does not start if a migration fails.
(Render's separate "pre-deploy command" was a paid-plan feature at the time of writing, so the free plan
uses this form.)

**`healthCheckPath: /health`.** Render sends traffic to a new deploy only
after `/health` answers 200, and restarts the service if it stops answering.
This is why `/health` is excluded from rate limiting (step 9).

**`TRUST_PROXY_HOPS=1`.** Requests reach the app through Render's proxy.
This tells Express to take the client IP from the proxy's `X-Forwarded-For`
entry, so rate limiting counts real clients (step 9).

**Seeding production.** The seed is run once from a laptop against Neon's
direct URL. The same command run twice inserts nothing the second time. It is
not part of the start command: seeding is a one-off, and re-running it on
every restart would be wasted work (harmless, but pointless).

**Free-plan behaviour.** Render's free web services sleep after about 15
minutes without traffic. The first request after that takes around a minute
while the service wakes up. The consumer page (step 12) shows a loading state
for this.

**Simulated before deploying.** Locally, with `NODE_ENV=production`: the build
passed, `prisma migrate status` used `DIRECT_DATABASE_URL`, and the exact
start command printed "No pending migrations to apply" and then served
`/health` and a rate-limited API request.

### Alternatives rejected
| Rejected | Why |
|---|---|
| Render's free Postgres | Deleted after 30 days. The grader might look later. |
| Secrets in `render.yaml` | Anything in the repo is public. `sync: false` keeps them in the dashboard only. |
| `prisma db push` in production | No migration history, and can drop data to force a match. `migrate deploy` only applies reviewed migration files. |
| Seeding on every start | A one-off job does not belong in the boot path. |
| Running migrations through the pooler | Cannot hold the migration lock reliably. |

### Runbook (what was done, in order)
1. Commit and push the repository to GitHub.
2. **Neon:** create a project (region AWS Frankfurt `eu-central-1`). Copy
   two connection strings from *Connect*: pooled (host contains `-pooler`)
   and direct (toggle pooling off).
3. **Migrate and seed production from the laptop** (PowerShell):
   ```powershell
   $env:DATABASE_URL = "<DIRECT connection string>"
   npm run db:deploy          # applies both migrations to Neon
   npm run db:seed            # 300 / 3353 / 500 / 800 / 1997
   npm run db:seed            # all inserted = 0: repeatable against production too
   Remove-Item Env:DATABASE_URL
   ```
   Environment variables already set take precedence over `.env`, which is
   why this targets Neon and not the local database.
4. **Render:** New → Blueprint → select the GitHub repo → it reads
   `render.yaml` → paste `DATABASE_URL` (pooled), `DIRECT_DATABASE_URL`
   (direct), and `CORS_ALLOWED_ORIGINS` (placeholder until step 12) → Apply.
5. Wait for "Live", then check from a device that is not the laptop (a phone
   on mobile data):
   `https://<service>.onrender.com/health` and
   `https://<service>.onrender.com/api/v1/restaurants?limit=2`.

---

## Revision — Port Harcourt spec (areas, offset, seed in `scripts/`)

A revised brief narrowed the market to **Port Harcourt** and asked for
**offset pagination alongside cursors**, so the trade-off can be explained
with both in hand. This section records what changed and why. Earlier
sections describe the code as it was at that step.

### What changed
| Area | Before | After |
|---|---|---|
| Location | `city` (7 Nigerian cities) | `area` within Port Harcourt (GRA Phase 2, Rumuola, Trans-Amadi, D-Line, Woji, …) |
| Seed location | `src/seed/` | `scripts/seed.ts` + `scripts/catalogue.ts`, run with `tsx` |
| Seed data | generic Nigerian | Rivers State surnames, real PH streets per area, PH dishes (Bole and Fish, Native Soup, Owo Soup and Starch, Afang, Edikang Ikong, Periwinkle Pepper Soup) |
| Pagination | cursor only; `offset` → 400 | cursor **or** `offset` (≥ 0); negative → 400; both at once → 400 |
| Tests | 96 | 104, including one that *demonstrates* offset drift |

### Files
| File | Change |
|---|---|
| `prisma/migrations/…_rename_city_to_area/migration.sql` | Hand-written `RENAME COLUMN` + `RENAME INDEX`. |
| `prisma/schema.prisma` | `city` → `area`; index `(area, cuisine)`. |
| `scripts/seed.ts`, `scripts/catalogue.ts` | Moved from `src/seed/`; Port Harcourt data; the "Sname" guard. |
| `src/http/pagination.ts` | `offset` in the shared query shape; cursor+offset check; `rejectOffset` removed. |
| `src/modules/*/service.ts` | `skip: params.offset` on every list query. |
| `src/modules/{restaurants,customers}/*` | `area` filter and field. |
| `tests/*` | Offset tests; new negative-offset message; `scripts/` in test setup and typecheck. |
| `package.json` | `db:seed` points at `scripts/seed.ts`; `db:seed:prod` removed. |
| `README.md` | Areas list, `area` filters, offset docs, a rewritten "Cursor vs offset" design section. |

### Why it works this way

**Why the migration was written by hand.** Prisma compares the schema
before and after. It saw a column `city` disappear and a column `area`
appear, and planned `DROP COLUMN city; ADD COLUMN area`, which deletes every
value. It cannot know the two are the same column renamed. A hand-written
`ALTER TABLE … RENAME COLUMN` keeps the data. The index was renamed too, so
its name matches Prisma's convention (`restaurants_area_cuisine_idx`).
Afterwards `prisma migrate diff` reported an **empty** migration, meaning the
database and the schema file agree exactly.

**Why a rename rather than dropping and re-adding.** In production this
would matter: renaming is instant and keeps the data. A drop-and-add would
lose every restaurant's location. It is also a *breaking* API change
(`city` disappears from responses), which is acceptable only because nothing
is deployed yet. After launch, the non-breaking way would be to add `area`
alongside `city`, keep both in `v1`, and remove `city` only in `v2`.

**How offset was added without a second code path.**
- `offset` joined the shared query shape, so every list endpoint gained it at
  once. It must be an integer ≥ 0. `-1` gets
  `offset: must be 0 or more (it is the number of rows to skip)`.
- `toListParams` refuses `cursor` and `offset` together. "Start after this
  row" and "skip N rows" are two different starting points, and silently
  picking one would hide a client bug.
- Each service passes `skip: params.offset` to `findMany`. In cursor mode it
  is `undefined`, which Prisma ignores. SQL: `ORDER BY … LIMIT 21 OFFSET 40`.
- `meta` keeps exactly the same four fields in both modes. `nextCursor` is
  still computed from the last row, so a client can jump with offset once
  and then continue safely with cursors.

**The drift test.** `shows the drift problem` in `tests/pagination.test.ts`:
1. Read page 1 (newest orders first), then page 2 both by `offset=5` and by
   `cursor`.
2. Create a new order. It becomes the newest row, at the top of the list.
3. Read page 2 again both ways.
4. Offset page 2 now starts with the row that was the *last row of page 1*,
   so the client sees it twice. Cursor page 2 is *identical* to before.

That is the defence answer to "why cursor?", as a passing test.

**Seed repeatability, the choice explained.** The spec allowed "upserts
keyed on a stable seed key, or truncate-and-reload". This seed uses
insert-if-missing keyed on stable natural keys (slug, email,
restaurant+name, reference, order+menu item), with a fixed Faker seed so
those keys are the same on every run. Truncate-and-reload was rejected
because it also deletes orders placed through the live API: running the seed
against production would destroy real data. Insert-if-missing only ever adds.

**The "Sname" guard.** Faker's Nigerian first-name list has a bad entry,
"Sname". It appeared for 2 of 500 customers. The seed re-rolls it with
`while (firstName === 'Sname')`. This stays deterministic, because the same
random sequence is consumed on every run. After the fix: 0 affected, and the
second run still inserted nothing.

**Why the seed moved to `scripts/`.** The spec asked for `scripts/seed.ts`.
It is now run with `tsx` (TypeScript without a build step), both locally and
against production from a laptop, so the compiled `db:seed:prod` variant was
removed. `tests/tsconfig.json` includes `scripts/`, so it is still
type-checked.

### Verified
- Fresh scratch database: migrate, seed → 300 restaurants, 3,353 menu items,
  500 customers, 800 orders, 1,997 order items. Second run inserted 0 of each.
- Sample rows: "Obuah Grill House, 42 Okoroma Street, D-Line, Port Harcourt".
- `npm run typecheck` clean. `npm test`: 6 files, 104 tests passing.

### How to verify
```bash
npx prisma migrate reset --force   # your local DB still has city data: reset it
npm run db:seed                    # 300 / 3353 / 500 / 800 / 1997
npm run db:seed                    # all inserted = 0
npm test                           # 104 passing

npm run dev
curl "http://localhost:3000/api/v1/restaurants?area=rumuola&limit=3"
curl "http://localhost:3000/api/v1/restaurants?area=rumuola&limit=3&offset=3"
curl -i "http://localhost:3000/api/v1/restaurants?offset=-1"          # 400
curl -i "http://localhost:3000/api/v1/restaurants?offset=100000"      # 200, data: []
```

---

## Consumer page, CORS, and the evidence checklist

### What was built
- **`consumer/`**: one plain HTML page with vanilla JavaScript. It lists
  restaurants from the **public** API, has an **Area** filter, and a
  **Next page** button that follows `meta.nextCursor`. It handles four
  states explicitly: loading, data, empty, and error.
- **CORS on the API**, so a page on another domain may read it from a browser.
- **`netlify.toml`**, so Netlify publishes `consumer/` as a static site.
- **`docs/EVIDENCE.md`**: the screenshot checklist with ready-to-run commands.

### Files
| File | Purpose |
|---|---|
| `consumer/config.js` | `API_BASE_URL` (the only thing to edit after deploying), page size, request timeout, when to show the "waking up" notice. |
| `consumer/app.js` | Fetching, the four states, rendering, the filter and Next/First buttons. |
| `consumer/index.html` | Markup and styles (light and dark). |
| `netlify.toml` | `publish = "consumer"`, no build command. |
| `src/app.ts` | `cors()` middleware on `/api`. |
| `tests/cors.test.ts` | 4 tests: allowed origin, exposed headers, other origins refused, preflight. |
| `vitest.config.ts` | Sets `CORS_ALLOWED_ORIGINS` for tests. |
| `docs/EVIDENCE.md` | What to screenshot and how. |

### How the page works
1. On load, `config.js` is checked. If `API_BASE_URL` is still the
   placeholder, uses `localhost`, or is not `https://`, the page shows an
   error saying so and makes no request. The consumer's job is to prove the
   API works *from outside*, so a local URL is refused on purpose.
2. `load()` shows the **loading** state (message, controls disabled). If no
   answer arrives within 4 seconds, the message changes to explain the free
   plan's cold start ("can take up to a minute").
3. It calls `GET /api/v1/restaurants?limit=10&sort=name&order=asc`, adding
   `area=` if chosen and `cursor=` for later pages.
4. The answer decides the state:
   - `data` has rows → **data**: cards plus "Showing 11–20 of 300 · page 2".
     **Next** is enabled only if `meta.hasMore`.
   - `data` is empty → **empty**: "No restaurants found in X. Try another area."
   - an error → **error**: the API's own `error.message`, a friendlier line
     for 429 using `Retry-After`, or a network or timeout message; plus a
     **Try again** button.
5. **Next page** stores `meta.nextCursor` as the page's cursor and loads again.
   Changing the area resets to page 1, because a cursor from one filter means
   nothing for another.

**Why `textContent`, never `innerHTML`.** Restaurant names come from the
API. With `innerHTML`, a name like `<img src=x onerror=...>` would run as code
in the visitor's browser (cross-site scripting). `textContent` always treats it
as plain text.

**Why the request counter (`requestNumber`).** If someone changes the filter
twice quickly, two requests are in flight. The slower one could arrive last
and overwrite the newer result. Each load takes a number, and only the latest
number's answer is shown.

**Why a timeout.** `fetch` has no timeout of its own. Without one, a hung
request would leave the page on "Loading…" forever. An `AbortController`
cancels it after 90 seconds (`REQUEST_TIMEOUT_MS`), which is long enough for
a cold start, and then the error state appears.

### CORS, and the bug the browser test found
A browser only lets a page on `https://x.netlify.app` read a response from
`https://y.onrender.com` if the response says so, via
`Access-Control-Allow-Origin`. The API now sends that header for origins
listed in `CORS_ALLOWED_ORIGINS`, and only for `GET`, since the consumer only reads.

CORS is **not** security for the API itself: curl, scripts and servers ignore
it, and the API stays fully public. It only stops *other websites* from using a
visitor's browser to read the API through their own pages.

**Found by testing in a real browser:** on a 429, the page first said
"Please wait a minute seconds". Browsers hide response headers from
cross-origin pages unless the server lists them in
`Access-Control-Expose-Headers`, so `Retry-After` was invisible to the page.
The fix was `exposedHeaders: ['Retry-After', 'RateLimit', 'RateLimit-Policy']`
plus proper wording for the fallback. A test now checks the header, and the
page says "Please wait 59 seconds, then try again."

### Tested in a real browser
Headless Microsoft Edge, driven through its DevTools protocol, loaded the page
against a local API seeded with Port Harcourt data:
| State | Result |
|---|---|
| Data | 10 cards, "Showing 1–10 of 300 · page 1", Next enabled |
| Next page | "Showing 11–20 of 300 · page 2", no card repeated from page 1, First page button shown |
| Filter: Rumuola | "Showing 1–10 of 25", every card in Rumuola |
| Empty (an area with no restaurants) | "No restaurants found in Atlantis. Try another area.", Next disabled |
| Loading (captured mid-request) | "Loading restaurants…", filter disabled |
| 429 (API with a limit of 2) | "Too many requests. Please wait 59 seconds, then try again." + Try again |
| Placeholder `config.js` (the real file) | "The API URL is not configured…", no request made |

For the test, a copy of the page in a scratch folder pointed at the local API.
The real `consumer/config.js` was never changed, and it still refuses
localhost.

### Alternatives rejected
| Rejected | Why |
|---|---|
| React / Vite | The brief asks for the smallest client that proves the API works. A build step adds nothing to that proof. |
| `Access-Control-Allow-Origin: *` | Works, but lets any website read the API through visitors' browsers. Listing the one consumer origin is explicit. |
| Page-number buttons | The API recommends cursors, and the brief asks for a Next button. |
| Hard-coding the API URL inside `app.js` | One small `config.js` makes "which API does this call?" answerable at a glance. |

### Deploying the consumer (Netlify)
1. Put the live API URL into `consumer/config.js` (`API_BASE_URL`), commit, and push.
2. Netlify → **Add new site → Import an existing project** → GitHub → this
   repository. `netlify.toml` supplies the settings (publish `consumer`, no
   build). Deploy.
   *(Quicker alternative: drag the `consumer` folder onto app.netlify.com/drop.)*
3. Copy the site URL (e.g. `https://rox-restaurants.netlify.app`) into
   Render → the API service → Environment → `CORS_ALLOWED_ORIGINS`. Save,
   and Render restarts the API.
4. Open the Netlify URL. Restaurants appear.

### How to verify
```bash
npm test          # 7 files, 108 tests (4 CORS tests)
# after deploying both:
curl -i -H "Origin: https://YOUR-CONSUMER.netlify.app" "https://YOUR-SERVICE.onrender.com/api/v1/restaurants?limit=1"
# expect: access-control-allow-origin: https://YOUR-CONSUMER.netlify.app
#         access-control-expose-headers: Retry-After,RateLimit,RateLimit-Policy
```
Then open the consumer and try: a filter, Next page, an area switch, and
(after the 429 loop in `docs/EVIDENCE.md`) a reload to see the error state.
