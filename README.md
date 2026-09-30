# Rox Restaurant API

A public, versioned REST API for food delivery in Port Harcourt, Nigeria: restaurants,
their menus, customers, and orders that move through a delivery lifecycle.

| | |
|---|---|
| **Base URL** | `http://localhost:3000` *(the live URL replaces this after deployment)* |
| **Version** | `v1`, and every path starts with `/api/v1` |
| **Format** | JSON in, JSON out |
| **Auth** | None. All reads are public. |
| **Rate limit** | 100 requests per minute per IP |

```bash
# Try it: the two cheapest open grill spots in Rumuola
curl "http://localhost:3000/api/v1/restaurants?area=rumuola&cuisine=grill&isOpen=true&sort=deliveryFeeKobo&limit=2"
```

## Contents
1. [Conventions](#conventions): envelopes, errors, money, ids, pagination, sorting, rate limits
2. [Endpoints](#endpoints)
   - [Restaurants](#restaurants) · [Menu items](#menu-items) · [Customers](#customers) · [Orders](#orders)
3. [Resource design](#resource-design)
4. [Design decisions](#design-decisions)
5. [Running it yourself](#running-it-yourself)
6. [Project layout](#project-layout)

---

## Conventions

### Response envelope
Every successful response puts its payload under `data`.

**One item**
```json
{ "data": { "id": "01a0f12f-…", "name": "Mallam Saheed Suya" } }
```

**A list** also carries `meta`:
```json
{
  "data": [ { "…": "…" } ],
  "meta": { "total": 340, "limit": 20, "hasMore": true, "nextCursor": "eyJzb3J0Ijoi…" }
}
```
| `meta` field | Meaning |
|---|---|
| `total` | Rows matching your filters, across **all** pages. |
| `limit` | Page size actually used, after clamping. |
| `hasMore` | `true` if another page exists. |
| `nextCursor` | Pass as `?cursor=` to get the next page. `null` on the last page. |

### Errors
Every error has the same shape and an honest HTTP status:
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request body failed validation",
    "details": [ { "field": "items.0.quantity", "issue": "must be at least 1" } ]
  }
}
```
`details` appears when specific inputs are at fault, and `field` names each one.

| Status | `code` | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Invalid query string or path: unknown parameter, bad `limit`, unknown `sort`, bad cursor, negative `offset`, `offset` with `cursor`, malformed id, invalid JSON |
| 404 | `NOT_FOUND` | The resource or route does not exist |
| 409 | `CONFLICT` | Valid request, but the resource's current state forbids it (e.g. cancelling a delivered order) |
| 413 | `PAYLOAD_TOO_LARGE` | JSON body over 100 KB |
| 422 | `VALIDATION_FAILED` | JSON body parsed but breaks a rule (missing field, quantity 0, closed restaurant, …) |
| 429 | `RATE_LIMITED` | More than 100 requests in a minute from your IP. See `Retry-After`. |
| 500 | `INTERNAL_ERROR` | Our bug. No internals are exposed. |

The API never returns `200` with an error inside.

### Money
All amounts are **integers in kobo** (1 naira = 100 kobo) with a `currency`
field beside them. `"priceKobo": 250000, "currency": "NGN"` is ₦2,500.00.
Filters take kobo too: under ₦5,000 is `maxPriceKobo=500000`.

### Identifiers
Every `id` is a **UUID v7**, e.g. `01a0f12f-26fd-7059-bc5b-351ccdf7ca8b`.
They cannot be guessed by counting. A malformed id returns `400`; a
well-formed id that doesn't exist returns `404`.

### Pagination (cursor recommended, offset supported)
| Param | Type | Default | Notes |
|---|---|---|---|
| `limit` | integer ≥ 1 | `20` | Values above `100` are **clamped** to 100 (not rejected). `meta.limit` shows what was used. |
| `cursor` | string | none | Copy `meta.nextCursor` from the previous page. Must be used with the same `sort` and `order`. |
| `offset` | integer ≥ 0 | none | Skip this many rows first. Negative → `400`. Cannot be combined with `cursor` (`400`). |

**Cursor (recommended):** keep requesting with `cursor=<meta.nextCursor>`
until `hasMore` is `false`. Every row appears exactly once, even if rows
are added while you page.

**Offset:** `offset=0`, `offset=20`, `offset=40`, … Lets you jump to any
position, but pages can shift if rows are added meanwhile. See
[Design decisions](#cursor-vs-offset) for when to use which. The response
shape is identical in both modes, and `nextCursor` is always included, so you
can switch to cursors after an offset jump.

```bash
# page 1
curl "http://localhost:3000/api/v1/restaurants?area=rumuola&sort=deliveryFeeKobo&limit=2"
# page 2 by cursor: paste meta.nextCursor from page 1
curl "http://localhost:3000/api/v1/restaurants?area=rumuola&sort=deliveryFeeKobo&limit=2&cursor=PASTE_NEXT_CURSOR"
# page 2 by offset
curl "http://localhost:3000/api/v1/restaurants?area=rumuola&sort=deliveryFeeKobo&limit=2&offset=2"
```

### Sorting
`?sort=<field>&order=asc|desc`. Each list documents its sortable fields. Any
other field returns `400` listing the allowed ones. Ties are broken by `id`,
so pagination never skips or repeats a row.

### Filtering
Each list documents its filters. Filters combine with AND. An **unknown
query parameter returns `400`**, so a typo such as `?cusine=pizza` fails
loudly instead of silently returning unfiltered results.

### Rate limiting
100 requests per minute per client IP (configurable). Every response carries
the standard headers `RateLimit: "100-in-1min"; r=<remaining>; t=<seconds to reset>`
and `RateLimit-Policy`. Request 101 gets:
```
HTTP/1.1 429 Too Many Requests
Retry-After: 52
{"error":{"code":"RATE_LIMITED","message":"Too many requests: the limit is 100 per 60 seconds. Retry after the number of seconds in the Retry-After header."}}
```
`GET /health` is not rate limited.

### Privacy
The API is unauthenticated, so it never returns customer **email** or
**phone**, or an order's **delivery address**. They are stored, but not
published.

---

## Endpoints

> **Note (temporary):** the example requests and responses below come from
> an earlier multi-city dataset (`city` instead of `area`) and will be
> re-captured from the live Port Harcourt deployment. Parameter tables are
> already current.

| Method | Path | Purpose |
|---|---|---|
| GET | [`/api/v1/restaurants`](#get-apiv1restaurants) | List restaurants |
| GET | [`/api/v1/restaurants/:id`](#get-apiv1restaurantsid) | One restaurant |
| GET | [`/api/v1/restaurants/:id/menu`](#get-apiv1restaurantsidmenu) | One restaurant's menu |
| GET | [`/api/v1/menu-items`](#get-apiv1menu-items) | List dishes across all restaurants |
| GET | [`/api/v1/menu-items/:id`](#get-apiv1menu-itemsid) | One dish |
| GET | [`/api/v1/customers`](#get-apiv1customers) | List customers (public fields only) |
| GET | [`/api/v1/customers/:id`](#get-apiv1customersid) | One customer |
| GET | [`/api/v1/orders`](#get-apiv1orders) | List orders |
| POST | [`/api/v1/orders`](#post-apiv1orders) | Place an order |
| GET | [`/api/v1/orders/:id`](#get-apiv1ordersid) | One order with its lines |
| PATCH | [`/api/v1/orders/:id`](#patch-apiv1ordersid) | Change status or delivery address |
| DELETE | [`/api/v1/orders/:id`](#delete-apiv1ordersid) | Delete a pending or cancelled order |
| GET | `/health` | Liveness check: `{"data":{"status":"ok"}}` |

### Restaurants

#### `GET /api/v1/restaurants`
| Param | Type | Default | Description |
|---|---|---|---|
| `limit`, `cursor`, `offset` | | 20 | [Pagination](#pagination-cursor-recommended-offset-supported) |
| `sort` | `name` \| `createdAt` \| `deliveryFeeKobo` \| `minimumOrderKobo` | `name` | |
| `order` | `asc` \| `desc` | `asc` | |
| `cuisine` | string | none | `nigerian`, `grill`, `pizza`, `shawarma`, `chinese`, `seafood`, `breakfast` (case-insensitive) |
| `area` | string | none | Port Harcourt area, exact match, case-insensitive (see [Areas](#areas)) |
| `isOpen` | `true` \| `false` | none | Only restaurants currently accepting orders |
| `maxDeliveryFeeKobo` | integer ≥ 0 | none | Delivery fee at most this |

```bash
curl "http://localhost:3000/api/v1/restaurants?city=lagos&cuisine=grill&sort=deliveryFeeKobo&order=asc&limit=2"
```
```json
{
  "data": [
    {
      "id": "01a0f12f-26fd-7059-bc5b-351ccdf7ca8b",
      "slug": "mallam-saheed-suya-lagos-82",
      "name": "Mallam Saheed Suya",
      "cuisine": "grill",
      "city": "Lagos",
      "address": "603 Onoriode Crescent, Lagos",
      "isOpen": true,
      "deliveryFeeKobo": 120000,
      "minimumOrderKobo": 0,
      "currency": "NGN",
      "createdAt": "2025-08-18T13:28:46.352Z",
      "updatedAt": "2026-09-30T07:19:54.362Z"
    },
    {
      "id": "01a0f12f-2700-73ce-bbd1-f7133a9e810c",
      "slug": "mayowa-suya-spot-lagos-227",
      "name": "Mayowa Suya Spot",
      "cuisine": "grill",
      "city": "Lagos",
      "address": "10561 Isaac Radial, Lagos",
      "isOpen": true,
      "deliveryFeeKobo": 120000,
      "minimumOrderKobo": 0,
      "currency": "NGN",
      "createdAt": "2025-04-07T17:18:52.723Z",
      "updatedAt": "2026-09-30T07:19:54.362Z"
    }
  ],
  "meta": {
    "total": 3,
    "limit": 2,
    "hasMore": true,
    "nextCursor": "eyJzb3J0IjoiZGVsaXZlcnlGZWVLb2JvIiwib3JkZXIiOiJhc2MiLCJ2YWx1ZSI6MTIwMDAwLCJpZCI6IjAxYTBmMTJmLTI3MDAtNzNjZS1iYmQxLWY3MTMzYTllODEwYyJ9"
  }
}
```

#### `GET /api/v1/restaurants/:id`
```bash
curl "http://localhost:3000/api/v1/restaurants/01a0f12f-26fd-7059-bc5b-351ccdf7ca8b"
```
```json
{
  "data": {
    "id": "01a0f12f-26fd-7059-bc5b-351ccdf7ca8b",
    "slug": "mallam-saheed-suya-lagos-82",
    "name": "Mallam Saheed Suya",
    "cuisine": "grill",
    "city": "Lagos",
    "address": "603 Onoriode Crescent, Lagos",
    "isOpen": true,
    "deliveryFeeKobo": 120000,
    "minimumOrderKobo": 0,
    "currency": "NGN",
    "createdAt": "2025-08-18T13:28:46.352Z",
    "updatedAt": "2026-09-30T07:19:54.362Z"
  }
}
```
Errors: `400` malformed id · `404` `{"error":{"code":"NOT_FOUND","message":"Restaurant not found"}}`

#### `GET /api/v1/restaurants/:id/menu`
The restaurant's dishes. It takes the same parameters as
[`GET /menu-items`](#get-apiv1menu-items) except `restaurantId`, because
the path already says which restaurant.
```bash
curl "http://localhost:3000/api/v1/restaurants/01a0f12f-26fd-7059-bc5b-351ccdf7ca8b/menu?sort=priceKobo&order=desc&limit=2"
```
```json
{
  "data": [
    {
      "id": "01a0f12f-2c53-71f0-8732-808c9de3a6a9",
      "restaurantId": "01a0f12f-26fd-7059-bc5b-351ccdf7ca8b",
      "name": "Grilled Catfish",
      "description": "Chef's special, prepared in small batches every day.",
      "category": "mains",
      "priceKobo": 825000,
      "currency": "NGN",
      "isAvailable": true,
      "createdAt": "2026-09-30T07:19:55.713Z",
      "updatedAt": "2026-09-30T07:19:55.713Z"
    },
    {
      "id": "01a0f12f-2c53-71f0-8732-8d8f5ebbb705",
      "restaurantId": "01a0f12f-26fd-7059-bc5b-351ccdf7ca8b",
      "name": "Ram Suya",
      "description": "Hearty and filling, served with a side of pepper sauce.",
      "category": "mains",
      "priceKobo": 650000,
      "currency": "NGN",
      "isAvailable": true,
      "createdAt": "2026-09-30T07:19:55.713Z",
      "updatedAt": "2026-09-30T07:19:55.713Z"
    }
  ],
  "meta": { "total": 13, "limit": 2, "hasMore": true, "nextCursor": "eyJzb3J0IjoicHJpY2VLb2JvIiwib3JkZXIiOiJkZXNjIiwidmFsdWUiOjY1MDAwMCwiaWQiOiIwMWEwZjEyZi0yYzUzLTcxZjAtODczMi04ZDhmNWViYmI3MDUifQ" }
}
```
Errors: `400` malformed id or bad query · `404` restaurant does not exist
(an unknown restaurant is a 404, never an empty menu).

### Menu items

#### `GET /api/v1/menu-items`
| Param | Type | Default | Description |
|---|---|---|---|
| `limit`, `cursor`, `offset` | | 20 | [Pagination](#pagination-cursor-recommended-offset-supported) |
| `sort` | `name` \| `priceKobo` \| `createdAt` | `name` | |
| `order` | `asc` \| `desc` | `asc` | |
| `category` | string | none | `mains`, `sides`, `soups`, `drinks`, `desserts` |
| `minPriceKobo` | integer ≥ 0 | none | Price at least this |
| `maxPriceKobo` | integer ≥ 0 | none | Price at most this. `minPriceKobo` > `maxPriceKobo` → 400 |
| `isAvailable` | `true` \| `false` | none | Only dishes that can be ordered now |
| `restaurantId` | UUID | none | Only this restaurant's dishes |

```bash
curl "http://localhost:3000/api/v1/menu-items?category=soups&maxPriceKobo=500000&sort=priceKobo&limit=2"
```
```json
{
  "data": [
    {
      "id": "01a0f12f-2c77-7748-868c-d5489c7cc0b9",
      "restaurantId": "01a0f12f-2700-73ce-bbd1-b8122897c1c1",
      "name": "Ogbono Soup",
      "description": "Rich and well spiced, with assorted meat.",
      "category": "soups",
      "priceKobo": 250000,
      "currency": "NGN",
      "isAvailable": true,
      "createdAt": "2026-09-30T07:19:55.713Z",
      "updatedAt": "2026-09-30T07:19:55.713Z"
    },
    {
      "id": "01a0f12f-2c88-765d-b060-cc8d3b7c524d",
      "restaurantId": "01a0f12f-2702-751f-9123-6a4f434635bd",
      "name": "Ogbono Soup",
      "description": "Loaded with fish and meat, a local favourite.",
      "category": "soups",
      "priceKobo": 250000,
      "currency": "NGN",
      "isAvailable": true,
      "createdAt": "2026-09-30T07:19:55.713Z",
      "updatedAt": "2026-09-30T07:19:55.713Z"
    }
  ],
  "meta": { "total": 130, "limit": 2, "hasMore": true, "nextCursor": "eyJzb3J0IjoicHJpY2VLb2JvIiwib3JkZXIiOiJhc2MiLCJ2YWx1ZSI6MjUwMDAwLCJpZCI6IjAxYTBmMTJmLTJjODgtNzY1ZC1iMDYwLWNjOGQzYjdjNTI0ZCJ9" }
}
```

#### `GET /api/v1/menu-items/:id`
```bash
curl "http://localhost:3000/api/v1/menu-items/01a0f12f-2c77-7748-868c-d5489c7cc0b9"
```
```json
{
  "data": {
    "id": "01a0f12f-2c77-7748-868c-d5489c7cc0b9",
    "restaurantId": "01a0f12f-2700-73ce-bbd1-b8122897c1c1",
    "name": "Ogbono Soup",
    "description": "Rich and well spiced, with assorted meat.",
    "category": "soups",
    "priceKobo": 250000,
    "currency": "NGN",
    "isAvailable": true,
    "createdAt": "2026-09-30T07:19:55.713Z",
    "updatedAt": "2026-09-30T07:19:55.713Z"
  }
}
```
Errors: `400` malformed id · `404` not found

### Customers
Only public fields are returned: **no email, no phone**.

#### `GET /api/v1/customers`
| Param | Type | Default | Description |
|---|---|---|---|
| `limit`, `cursor`, `offset` | | 20 | [Pagination](#pagination-cursor-recommended-offset-supported) |
| `sort` | `name` \| `createdAt` | `createdAt` | |
| `order` | `asc` \| `desc` | `desc` | Newest first by default |
| `area` | string | none | Port Harcourt area, exact match, case-insensitive |
| `name` | string, ≥ 2 characters | none | Partial match, case-insensitive (`ade` matches "Adeboye") |

```bash
curl "http://localhost:3000/api/v1/customers?city=abuja&sort=name&limit=2"
```
```json
{
  "data": [
    {
      "id": "01a0f12f-2ecd-710b-b728-8d13078fdc36",
      "name": "Zainab Omolara",
      "city": "Abuja",
      "createdAt": "2025-01-26T03:37:21.865Z",
      "updatedAt": "2026-09-30T07:19:56.362Z"
    },
    {
      "id": "01a0f12f-2ecb-712e-b93a-49c10a6bdc97",
      "name": "Zainab Oladeji",
      "city": "Abuja",
      "createdAt": "2025-12-07T15:22:38.449Z",
      "updatedAt": "2026-09-30T07:19:56.362Z"
    }
  ],
  "meta": { "total": 67, "limit": 2, "hasMore": true, "nextCursor": "eyJzb3J0IjoibmFtZSIsIm9yZGVyIjoiZGVzYyIsInZhbHVlIjoiWmFpbmFiIE9sYWRlamkiLCJpZCI6IjAxYTBmMTJmLTJlY2ItNzEyZS1iOTNhLTQ5YzEwYTZiZGM5NyJ9" }
}
```

#### `GET /api/v1/customers/:id`
```bash
curl "http://localhost:3000/api/v1/customers/01a0f12f-2ecd-710b-b728-8d13078fdc36"
```
```json
{
  "data": {
    "id": "01a0f12f-2ecd-710b-b728-8d13078fdc36",
    "name": "Zainab Omolara",
    "city": "Abuja",
    "createdAt": "2025-01-26T03:37:21.865Z",
    "updatedAt": "2026-09-30T07:19:56.362Z"
  }
}
```
Errors: `400` malformed id · `404` not found

### Orders

#### Status lifecycle
```
pending ──▶ confirmed ──▶ preparing ──▶ out_for_delivery ──▶ delivered
   │            │
   └────────────┴──▶ cancelled
```
Only these moves are allowed. `delivered` and `cancelled` are final.
Cancelling is not possible once an order is `preparing`.

#### `GET /api/v1/orders`
Orders without their lines. Use [`GET /orders/:id`](#get-apiv1ordersid) for the lines.

| Param | Type | Default | Description |
|---|---|---|---|
| `limit`, `cursor`, `offset` | | 20 | [Pagination](#pagination-cursor-recommended-offset-supported) |
| `sort` | `createdAt` \| `totalKobo` | `createdAt` | |
| `order` | `asc` \| `desc` | `desc` | Newest first by default |
| `status` | `pending` \| `confirmed` \| `preparing` \| `out_for_delivery` \| `delivered` \| `cancelled` | none | |
| `restaurantId` | UUID | none | |
| `customerId` | UUID | none | |
| `createdAfter` | ISO 8601 date-time | none | e.g. `2026-08-01T00:00:00Z` (inclusive) |
| `createdBefore` | ISO 8601 date-time | none | inclusive; must not be before `createdAfter` |

```bash
curl "http://localhost:3000/api/v1/orders?status=delivered&sort=totalKobo&order=desc&limit=2"
```
```json
{
  "data": [
    {
      "id": "01a0f12f-301d-7167-b83f-2ff070f744ee",
      "reference": "ROX-RWYFWUZ6",
      "customerId": "01a0f12f-2ecd-710b-b727-f34b83012723",
      "restaurantId": "01a0f12f-26fd-7059-bc5b-32e3738e21e3",
      "status": "delivered",
      "subtotalKobo": 7120000,
      "deliveryFeeKobo": 110000,
      "totalKobo": 7230000,
      "currency": "NGN",
      "createdAt": "2026-08-03T20:19:31.906Z",
      "updatedAt": "2026-09-30T07:19:56.693Z"
    },
    {
      "id": "01a0f12f-301e-702c-bf3f-bbcde6d3b787",
      "reference": "ROX-ZNJKMTVG",
      "customerId": "01a0f12f-2ece-7666-bc6f-3c9837b25530",
      "restaurantId": "01a0f12f-26fc-77e5-ae1d-4413a17271be",
      "status": "delivered",
      "subtotalKobo": 6540000,
      "deliveryFeeKobo": 60000,
      "totalKobo": 6600000,
      "currency": "NGN",
      "createdAt": "2026-06-20T20:03:30.329Z",
      "updatedAt": "2026-09-30T07:19:56.693Z"
    }
  ],
  "meta": { "total": 465, "limit": 2, "hasMore": true, "nextCursor": "eyJzb3J0IjoidG90YWxLb2JvIiwib3JkZXIiOiJkZXNjIiwidmFsdWUiOjY2MDAwMDAsImlkIjoiMDFhMGYxMmYtMzAxZS03MDJjLWJmM2YtYmJjZGU2ZDNiNzg3In0" }
}
```

#### `POST /api/v1/orders`
Places an order. **Prices are never sent by the client.** The server reads
them from the menu, stores a snapshot of each dish's name and price, and
computes the totals.

| Body field | Type | Required | Rules |
|---|---|---|---|
| `customerId` | UUID | yes | must exist |
| `restaurantId` | UUID | yes | must exist and be open |
| `deliveryAddress` | string | yes | 5–300 characters (stored, never returned) |
| `items` | array | yes | 1–20 lines |
| `items[].menuItemId` | UUID | yes | on this restaurant's menu, available, not repeated |
| `items[].quantity` | integer | yes | 1–99 |

Any other field (e.g. `totalKobo`) is rejected. The subtotal must reach the
restaurant's `minimumOrderKobo`.

```bash
curl -i -X POST "http://localhost:3000/api/v1/orders" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"01a0f12f-2ecd-710b-b728-8d13078fdc36","restaurantId":"01a0f12f-26f8-71f2-b45c-04049ab06ec9","deliveryAddress":"12 Admiralty Way, Lekki, Lagos","items":[{"menuItemId":"01a0f12f-2c41-776f-aee1-8088e1bdaaec","quantity":2},{"menuItemId":"01a0f12f-2c41-776f-aee1-89cf26dc0a00","quantity":1}]}'
```
`201 Created`, `Location: /api/v1/orders/01a0f12f-9981-7321-918e-410df0a5fdc3`
```json
{
  "data": {
    "id": "01a0f12f-9981-7321-918e-410df0a5fdc3",
    "reference": "ROX-VY8U5UVW",
    "customerId": "01a0f12f-2ecd-710b-b728-8d13078fdc36",
    "restaurantId": "01a0f12f-26f8-71f2-b45c-04049ab06ec9",
    "status": "pending",
    "subtotalKobo": 3705000,
    "deliveryFeeKobo": 140000,
    "totalKobo": 3845000,
    "currency": "NGN",
    "createdAt": "2026-09-30T07:20:23.682Z",
    "updatedAt": "2026-09-30T07:20:23.682Z",
    "items": [
      {
        "id": "01a0f12f-9992-7729-823d-05af679faff3",
        "menuItemId": "01a0f12f-2c41-776f-aee1-89cf26dc0a00",
        "nameSnapshot": "BBQ Chicken Pizza",
        "unitPriceKobo": 1165000,
        "quantity": 1,
        "lineTotalKobo": 1165000,
        "currency": "NGN"
      },
      {
        "id": "01a0f12f-9992-7729-823d-00124fee82e3",
        "menuItemId": "01a0f12f-2c41-776f-aee1-8088e1bdaaec",
        "nameSnapshot": "Meat Lovers Pizza",
        "unitPriceKobo": 1270000,
        "quantity": 2,
        "lineTotalKobo": 2540000,
        "currency": "NGN"
      }
    ]
  }
}
```

Errors. Every problem is reported at once, each naming its field:
```bash
curl -X POST "http://localhost:3000/api/v1/orders" -H "Content-Type: application/json" \
  -d '{"restaurantId":"01a0f12f-26f8-71f2-b45c-04049ab06ec9","items":[{"menuItemId":"01a0f12f-2c41-776f-aee1-8088e1bdaaec","quantity":0}]}'
```
`422`
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request body failed validation",
    "details": [
      { "field": "customerId", "issue": "is required" },
      { "field": "deliveryAddress", "issue": "is required" },
      { "field": "items.0.quantity", "issue": "must be at least 1" }
    ]
  }
}
```
| Status | Cause |
|---|---|
| 400 | Body is not valid JSON |
| 413 | Body larger than 100 KB |
| 422 | Missing or invalid field, unknown field, repeated dish, unknown customer/restaurant, restaurant closed, dish not on this menu, dish unavailable, below minimum order |

#### `GET /api/v1/orders/:id`
One order **with** its lines. The line shape is shown in the `POST` example above.
```bash
curl "http://localhost:3000/api/v1/orders/01a0f12f-301d-7167-b83f-2ff070f744ee"
```
```json
{
  "data": {
    "id": "01a0f12f-301d-7167-b83f-2ff070f744ee",
    "reference": "ROX-RWYFWUZ6",
    "customerId": "01a0f12f-2ecd-710b-b727-f34b83012723",
    "restaurantId": "01a0f12f-26fd-7059-bc5b-32e3738e21e3",
    "status": "delivered",
    "subtotalKobo": 7120000,
    "deliveryFeeKobo": 110000,
    "totalKobo": 7230000,
    "currency": "NGN",
    "createdAt": "2026-08-03T20:19:31.906Z",
    "updatedAt": "2026-09-30T07:19:56.693Z",
    "items": [
      { "id": "01a0f12f-32b7-77cd-ac8d-8111632c5677", "menuItemId": "01a0f12f-2c53-71f0-8732-673ecc8c322a", "nameSnapshot": "Fisherman Soup", "unitPriceKobo": 1330000, "quantity": 3, "lineTotalKobo": 3990000, "currency": "NGN" },
      { "id": "01a0f12f-32b7-77cd-ac8d-7d352cf4dc2e", "menuItemId": "01a0f12f-2c53-71f0-8732-4ae07e2f687c", "nameSnapshot": "Goat Meat Pepper Soup", "unitPriceKobo": 670000, "quantity": 2, "lineTotalKobo": 1340000, "currency": "NGN" },
      { "id": "01a0f12f-32b7-77cd-ac8d-78b5d5a0517f", "menuItemId": "01a0f12f-2c53-71f0-8732-4d7b2ded948e", "nameSnapshot": "Grilled Prawns", "unitPriceKobo": 1600000, "quantity": 1, "lineTotalKobo": 1600000, "currency": "NGN" },
      { "id": "01a0f12f-32b7-77cd-ac8d-85e551f8b1cd", "menuItemId": "01a0f12f-2c53-71f0-8732-400a054ee561", "nameSnapshot": "Malt Drink", "unitPriceKobo": 95000, "quantity": 2, "lineTotalKobo": 190000, "currency": "NGN" }
    ]
  }
}
```
Errors: `400` malformed id · `404` not found

#### `PATCH /api/v1/orders/:id`
Change the status (following the [lifecycle](#status-lifecycle)) and/or the
delivery address. At least one field is required, and nothing else can change.

| Body field | Type | Rules |
|---|---|---|
| `status` | one of the six statuses | must be an allowed next step, or the current status (no-op) |
| `deliveryAddress` | string, 5–300 chars | only while `pending` or `confirmed` |

```bash
curl -X PATCH "http://localhost:3000/api/v1/orders/01a0f12f-9981-7321-918e-410df0a5fdc3" \
  -H "Content-Type: application/json" -d '{"status":"confirmed"}'
```
`200`, with the full updated order (same shape as `GET /orders/:id`), now `"status": "confirmed"`.

An illegal move:
```bash
curl -X PATCH "http://localhost:3000/api/v1/orders/01a0f12f-9981-7321-918e-410df0a5fdc3" \
  -H "Content-Type: application/json" -d '{"status":"delivered"}'
```
`409`
```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Cannot change status from confirmed to delivered",
    "details": [ { "field": "status", "issue": "from confirmed the next status can only be: preparing, cancelled" } ]
  }
}
```
| Status | Cause |
|---|---|
| 400 | Malformed id |
| 404 | Order not found |
| 409 | Illegal status move; address change after `confirmed`; the order was changed by another request at the same moment (fetch and retry) |
| 422 | Empty body, unknown field, invalid status value |

Sending the status an order already has returns `200` and changes nothing
(not even `updatedAt`), so repeating a PATCH is safe.

#### `DELETE /api/v1/orders/:id`
Only `pending` or `cancelled` orders can be deleted. Anything that reached
the kitchen is kept as history.
```bash
curl -i -X DELETE "http://localhost:3000/api/v1/orders/01a0f12f-9981-7321-918e-410df0a5fdc3"
```
`204 No Content` (empty body). Deleting it again returns `404`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/orders/01a0f12f-301d-7167-b83f-2ff070f744ee"
```
`409`
```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Cannot delete a delivered order",
    "details": [ { "field": "status", "issue": "only pending or cancelled orders can be deleted" } ]
  }
}
```

---

## Resource design

### Relationships
```
restaurants 1 ──< many  menu_items
restaurants 1 ──< many  orders
customers   1 ──< many  orders
orders      1 ──< many  order_items
menu_items  1 ──< many  order_items

(1 ──< many  reads "one ... has many ...")
order_items is the join table between orders and menu_items.
```

- A **restaurant** has many **menu items** and receives many **orders**.
- A **customer** places many **orders**.
- An **order** belongs to exactly one restaurant and one customer, and
  contains many **order items**.
- An **order item** links one order to one menu item, and records the
  quantity plus the name and price *as they were when the order was placed*.

### Conventions that apply to every table
| Rule | Why |
|---|---|
| `id` is a UUID v7, generated by the application | Not guessable by counting. v7 is time-ordered, so new rows append to the end of the index. |
| Money is an integer number of **kobo** with a `currency` column beside it | Floats cannot represent 0.10 exactly; integers can. |
| Every table has `createdAt` and `updatedAt` | Sorting, cursors, debugging. |

### Fields

**restaurants**

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid (v7) | yes | generated |
| slug | string | yes | unique, URL-friendly, e.g. `mama-ibiere-kitchen-rumuola-42`; the seed's stable key |
| name | string | yes | |
| cuisine | string | yes | `nigerian`, `grill`, `seafood`, `pizza`, `shawarma`, `chinese`, `breakfast` |
| area | string | yes | Port Harcourt area, e.g. `GRA Phase 2`, `Rumuola`, `Trans-Amadi` (full list under [Areas](#areas)) |
| address | string | yes | e.g. `14 Aba Road, Rumuola, Port Harcourt` |
| isOpen | boolean | yes | closed restaurants cannot receive orders |
| deliveryFeeKobo | integer ≥ 0 | yes | |
| minimumOrderKobo | integer ≥ 0 | yes | |
| currency | string (3) | yes | ISO 4217, e.g. `NGN` |
| createdAt, updatedAt | timestamp | yes | |

**menu_items**

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid (v7) | yes | generated |
| restaurantId | uuid | yes | → restaurants.id |
| name | string | yes | unique within one restaurant |
| description | string | no | |
| category | string | yes | `mains`, `sides`, `soups`, `drinks`, `desserts` |
| priceKobo | integer > 0 | yes | |
| currency | string (3) | yes | |
| isAvailable | boolean | yes | unavailable items cannot be ordered |
| createdAt, updatedAt | timestamp | yes | |

**customers**

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid (v7) | yes | generated |
| email | string | yes | unique (the seed's stable key); **never returned by the API** |
| phone | string | yes | **never returned by the API** |
| name | string | yes | |
| area | string | yes | Port Harcourt area |
| createdAt, updatedAt | timestamp | yes | |

#### Areas
The market is Port Harcourt, Rivers State. Every restaurant and customer is in
one of these areas: `GRA Phase 2`, `Old GRA`, `Rumuola`, `Trans-Amadi`,
`D-Line`, `Woji`, `Rumuokoro`, `Eliozu`, `Ada George`, `Choba`, `Diobu`,
`Borokiri`, `Elelenwo`, `Peter Odili Road`.

**orders**

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid (v7) | yes | generated |
| reference | string | yes | unique, random, human-readable, e.g. `ROX-VY8U5UVW` |
| customerId | uuid | yes | → customers.id |
| restaurantId | uuid | yes | → restaurants.id |
| status | enum | yes | see [lifecycle](#status-lifecycle) |
| deliveryAddress | string | yes | **never returned by the API** |
| subtotalKobo | integer ≥ 0 | yes | sum of line totals, computed by the server |
| deliveryFeeKobo | integer ≥ 0 | yes | copied from the restaurant at order time |
| totalKobo | integer ≥ 0 | yes | = subtotal + delivery fee (database check) |
| currency | string (3) | yes | |
| createdAt, updatedAt | timestamp | yes | |

**order_items**

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid (v7) | yes | generated |
| orderId | uuid | yes | → orders.id (deleted with its order) |
| menuItemId | uuid | yes | → menu_items.id; unique together with orderId |
| nameSnapshot | string | yes | dish name at order time |
| unitPriceKobo | integer ≥ 0 | yes | dish price at order time |
| quantity | integer ≥ 1 | yes | at most 99 (configurable) |
| lineTotalKobo | integer ≥ 0 | yes | = unit price × quantity (database check) |
| currency | string (3) | yes | |
| createdAt, updatedAt | timestamp | yes | |

---

## Design decisions

### Why these resources
A food-delivery market needs four things: who sells (**restaurants**), what
they sell (**menu items**), who buys (**customers**), and the purchase
(**orders**). An order contains many dishes and a dish appears in many
orders, a many-to-many relationship, so **order_items** is the join table.
It also carries the quantity and a *snapshot* of the name and price. A
receipt must keep showing what the customer paid even after the restaurant
changes its menu. Nothing else was added: no reviews, drivers or payments,
because the brief asks for three to five related resources and the API is
the product.

### Why generated identifiers
Sequential ids (`/restaurants/1`, `/2`, `/3`…) let anyone download the whole
dataset with a loop and reveal how many orders exist. Every id here is a
**UUID v7**, which is not guessable. The **v7** variant starts with a
timestamp, so new ids are always larger than old ones. That keeps database
indexes compact (inserts go at the end, not scattered) and gives a natural
tie-breaker for sorting. Order `reference` codes (`ROX-VY8U5UVW`) are random
for the same reason.

### Cursor vs offset
Both are supported, so the trade-off can be seen, not just described.

**Offset** (`?offset=40&limit=20`) means "skip 40 rows, return the next 20".
- **It drifts.** If an order is created while you are on page 2, every row
  shifts down by one, and page 3 starts with a row you already saw (or, after
  a delete, skips one). An automated test inserts an order between two page
  requests and shows exactly this: offset page 2 changes and repeats a row,
  while the cursor page 2 does not change.
- **It slows down with depth.** `OFFSET 100000` makes the database read and
  throw away 100,000 rows before returning anything.
- **But it can jump.** "Go to page 7" is just `offset=120`.

**Cursor** (`?cursor=<meta.nextCursor>`) means "continue after *this* row",
the last row's sort value plus its `id`. The database finds that position
directly through an index, and inserts elsewhere cannot move it. It can only
go forward, one page at a time.

**When each is better:**
| Use offset when | Use cursor when |
|---|---|
| Users need numbered pages or "jump to page 7" | Users click "next" or scroll (feeds, the consumer page) |
| The data changes rarely (an admin table, a report) | Rows are inserted often (orders arrive all the time) |
| The table is small, so deep offsets stay cheap | The table is large, or clients read everything (exports, syncs) |

This API **recommends cursors** (the consumer uses them) because orders are
written constantly and correctness beats random access.

**"What if I ask for page 50 of 30?"** With offset, `offset` past the end
returns `200`, an empty `data` array, the real `total`, and `hasMore: false`.
The collection exists; there is just nothing at that position. A cursor
pointing past the last row behaves the same way. Neither is a 404.

### Envelope shape, and why
```json
{ "data": ..., "meta": { "total", "limit", "hasMore", "nextCursor" } }
{ "error": { "code", "message", "details"? } }
```
- **One key for the payload (`data`) everywhere.** Clients write one parser.
  Lists and single items differ only in whether `data` is an array.
- **`meta` exists so pagination can grow** (e.g. adding `prevCursor` later)
  without touching `data`.
- **Errors have a stable machine-readable `code`** for program logic and a
  human `message` for developers. `details` names each bad input so forms
  can highlight the right field.
- **The HTTP status is always honest.** No `200` with `"success": false`.

### Why versioned from the first commit (`/api/v1`)
Once someone depends on the API, renaming a field or path breaks them. `v1`
is a promise: *this shape will not change incompatibly*. When a breaking
change is needed, `/api/v2` is added alongside, and `v1` clients keep working
until they migrate.

**Adding a field without breaking clients** (e.g. `rating` on restaurants):
1. Add the column with a default or as nullable, in a new migration, so
   existing rows stay valid.
2. Add it to `restaurantSelect` so it appears in responses.
3. Optionally add it to the sort or filter allow-lists.

Existing clients ignore fields they don't know, so this is **additive and
stays in `v1`**. Removing or renaming a field, or changing its type or
meaning, is breaking, and that is what `v2` is for.

### Where the tunable numbers live
Every limit (page sizes, rate limit, body size, order limits, retry count,
seed volumes) is an environment variable, validated at startup in
[`src/config.ts`](src/config.ts). The rate limit is `RATE_LIMIT_MAX_REQUESTS`
and `RATE_LIMIT_WINDOW_MS`. They live there because they are operational
decisions: tightening the limit during an attack is a change in the host's
dashboard, not a code change and redeploy. [`.env.example`](.env.example)
documents each one.

### Other decisions
- **Server-side pricing:** clients send dish ids and quantities, never prices.
- **Privacy on a public API:** customer email/phone and order addresses are
  stored but never returned.
- **State machine with 409:** illegal status moves are rejected. Concurrent
  changes are handled with a conditional update, so two simultaneous requests
  can never both "win".
- **Database-level checks:** `total = subtotal + fee`, `line = price × quantity`,
  positive prices and valid currency codes are enforced by PostgreSQL itself.

A step-by-step account of every decision, including the alternatives
rejected, is in [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md).

---

## Consumer

[`consumer/`](consumer/) is the smallest client that proves the API works
from outside: one HTML page with plain JavaScript, deployed separately
(Netlify). It calls the **public** API URL set in
[`consumer/config.js`](consumer/config.js) and refuses `localhost`.

- Restaurant list, an **Area** filter, and a **Next page** button that follows `meta.nextCursor`
- Explicit **loading** (including a "waking up" notice for the free plan's cold start), **empty**, and **error** states, with a Try again button
- Reads `Retry-After` on a 429, which the API exposes through CORS

**Live consumer:** `https://YOUR-CONSUMER.netlify.app` *(set after deployment)*

The API only allows browser requests from origins listed in
`CORS_ALLOWED_ORIGINS`, so that variable must contain the consumer's URL.

---

## Running it yourself

**Requires:** Node.js 24+, PostgreSQL 14+.

```bash
git clone <this repository>
cd rox-restaurant-api
npm install                    # also generates the Prisma client
cp .env.example .env           # PowerShell: Copy-Item .env.example .env
#   then edit DATABASE_URL in .env to point at your Postgres
npm run db:migrate             # creates the database and tables
npm run db:seed                # 300 restaurants, ~3,350 dishes, 500 customers, 800 orders
npm run dev                    # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run dev` | Start with auto-reload |
| `npm run build` / `npm start` | Compile to `dist/` / run the compiled server |
| `npm test` | 108 tests against a throwaway `*_test` database |
| `npm run typecheck` | TypeScript check of `src/` and `tests/` |
| `npm run db:migrate` | Apply migrations (development) |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:seed` | Seed (`scripts/seed.ts`), safe to run repeatedly (no duplicates) |

## Project layout
```
src/
  config.ts              every tunable number, validated at startup
  app.ts, server.ts      Express app / process entry point
  db.ts                  Prisma client
  http/                  envelopes, errors, validation, pagination, rate limiting
  modules/<resource>/    schemas.ts (Zod), service.ts (queries), routes.ts (handlers)
scripts/                 seed.ts (repeatable seed) and catalogue.ts (areas, streets, dishes)
consumer/                the minimal client: index.html, app.js, config.js (API URL)
prisma/                  schema and migrations (including hand-written CHECK constraints)
tests/                   integration tests (Vitest + supertest)
docs/WALKTHROUGH.md      step-by-step explanation of every decision
docs/EVIDENCE.md         screenshot checklist with the commands to produce each one
```
