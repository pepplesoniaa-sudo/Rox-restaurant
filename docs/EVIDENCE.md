# Evidence checklist

Screenshots the brief requires, with the exact commands to produce them.
Save each image in `docs/evidence/` under the file name given, then tick the box.

Replace `YOUR-SERVICE` below with the real Render service name, and
`YOUR-CONSUMER` with the Netlify site name.

| | Item | File |
|---|---|---|
| ☐ | Live API URL recorded below | none |
| ☐ | curl hitting the live URL, showing a paginated response | `docs/evidence/01-curl-paginated.png` |
| ☐ | The 429 response after exceeding the rate limit | `docs/evidence/02-rate-limit-429.png` |
| ☐ | The consumer showing live data | `docs/evidence/03-consumer-live.png` |
| ☐ | The seed script is in the repository | [`scripts/seed.ts`](../scripts/seed.ts) |
| ☐ | *(recommended)* Consumer on a phone using mobile data | `docs/evidence/04-consumer-phone.png` |

**Live API:** `https://YOUR-SERVICE.onrender.com`
**Consumer:** `https://YOUR-CONSUMER.netlify.app`

> Render's free plan sleeps after ~15 idle minutes. Open
> `https://YOUR-SERVICE.onrender.com/health` first and wait for
> `{"data":{"status":"ok"}}` before taking any screenshot.

---

## 1. curl: paginated response from the live URL

The screenshot must show the **command with the live URL** and a response
whose `meta` has `total`, `limit`, `hasMore: true` and a `nextCursor`.

```bash
# page 1 (-i shows the status line and the RateLimit headers too)
curl -i "https://YOUR-SERVICE.onrender.com/api/v1/restaurants?area=rumuola&sort=deliveryFeeKobo&limit=3"
```
Optionally show page 2 in the same screenshot by pasting `meta.nextCursor`:
```bash
curl "https://YOUR-SERVICE.onrender.com/api/v1/restaurants?area=rumuola&sort=deliveryFeeKobo&limit=3&cursor=PASTE_NEXT_CURSOR"
```
If `jq` is installed, `| jq` makes the JSON easier to read (drop `-i` when piping).

## 2. The 429 after exceeding the rate limit

The limit is 100 requests per minute per IP. This loop sends 100 requests,
prints the status of the last few, then sends one more with headers visible.
Run it all within one minute.

**bash (Git Bash, macOS, Linux):**
```bash
URL="https://YOUR-SERVICE.onrender.com/api/v1/restaurants?limit=1"
for i in $(seq 1 100); do
  echo "$i $(curl -s -o /dev/null -w '%{http_code}' "$URL")"
done | tail -3
# request 101: status line, Retry-After header and the error envelope
curl -i "$URL"
```

**PowerShell** (use `curl.exe`, not `curl`):
```powershell
$URL = "https://YOUR-SERVICE.onrender.com/api/v1/restaurants?limit=1"
1..100 | ForEach-Object { "$_ " + (curl.exe -s -o NUL -w "%{http_code}" $URL) } | Select-Object -Last 3
curl.exe -i $URL
```

The screenshot must show:
- `HTTP/1.1 429 Too Many Requests` (or `HTTP/2 429`)
- a `Retry-After:` header with a number of seconds
- the body `{"error":{"code":"RATE_LIMITED","message":"Too many requests: ..."}}`

If every request comes back 200, the loop took longer than a minute
(the first request can be slow while the service wakes up). Run it again
straight away.

## 3. The consumer showing live data

Open `https://YOUR-CONSUMER.netlify.app` in a normal browser window. The
screenshot must show:
- the **address bar** with the Netlify URL (not `localhost`)
- restaurant cards and the "Showing 1–10 of 300 · page 1" line
- the footer "Data from https://YOUR-SERVICE.onrender.com"

Worth capturing as well, to show the page handles more than the happy path:
- after choosing an **Area** and pressing **Next page** (page 2 of a filtered list)
- the **error state**: run the 429 loop above from the same network, then reload the page

## 4. (Recommended) From a device that is not yours

The brief asks you to confirm the API answers from the public internet from
a machine that is not yours, or a phone on mobile data. Turn Wi-Fi off on a
phone, open the consumer URL, and screenshot it.
