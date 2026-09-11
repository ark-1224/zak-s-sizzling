# Zak's Sizzling Hub — Kiosk & Inventory System

Web-based self-service kiosk with integrated real-time stock inventory and transaction
management, built for Zak's Sizzling Hub (STI College Bacoor capstone project).

All 5 sprints from the original plan are built and verified — see "Status" below for
what's been confirmed live versus what's still a known gap (PWA/offline sync, hardware
receipt printing, Railway deployment).

## Structure

```
apps/
  web/      Next.js 14 App Router — kiosk, staff, admin, kitchen UI
  api/      Express REST + Socket.IO server, Prisma/PostgreSQL
  worker/   Scheduled jobs — nightly DB backup, hourly low-stock sweep (node-cron)
packages/
  shared-types/   Types shared between web and api (entities, WS event map)
```

## Status

Sprints 1-3 are built and verified end-to-end against the local PostgreSQL database:
- **Sprint 1** — auth, roles, read-only catalog. Admin login → JWT → `/admin` redirect
  confirmed working.
- **Sprint 2** — cart, ordering workflow, kiosk session management. Add-to-cart, qty
  adjust, remove, and order creation all confirmed working live. Idle-timeout
  warning/reset (`useIdleTimer`) is implemented but not live-tested end to end (it's a
  plain 60s/20s setTimeout chain — quick to verify by leaving the kiosk idle in a
  browser).
- **Sprint 3** — payment method selection, order placement, and receipts. Confirmed
  live: placing a "Pay at counter" order creates a `pending` payment record, and a
  staff/admin user can confirm it from `/staff/orders`, flipping the order to
  `confirmed`. The GCash/Maya path (`POST /api/payments/intent`, PayMongo checkout
  sessions, webhook signature verification) is fully wired but **not yet tested against
  a real PayMongo sandbox** — this environment has no PayMongo credentials. Until
  `PAYMONGO_SECRET_KEY` is set, choosing GCash/Maya at checkout gracefully falls back to
  the counter-payment receipt with a toast explaining online payment isn't set up yet
  (verified live). See "Payments" below for what's needed to test the real gateway path.

- **Sprint 4** — inventory management, barcode scanning, real-time stock. Full product
  CRUD (`/admin/products`) and stock management (`/admin/inventory`, low-stock alerts)
  confirmed live. Barcode lookup (`GET /api/products/barcode/:code`) confirmed via a
  manually-entered barcode; the scanner-speed keystroke detection (`useBarcodeScanner`)
  follows the standard HID keyboard-wedge pattern but wasn't distinctly verified against
  real scanner hardware — hard to simulate genuine scanner-speed input through browser
  automation. Most notably: **stock deduction tied to payment confirmation and its
  real-time WebSocket broadcast were verified live** — confirming a paid order deducted
  stock in the database, and a kiosk browser tab that was never refreshed flipped the
  affected product to "SOLD OUT" purely from the `inventory:updated` Socket.IO event.
  One bug was found and fixed during this: a product-deletion safety check (blocking
  deletion of products with order history) wasn't catching the actual Prisma error type
  Postgres returns for that constraint, silently falling through to a raw 500 — now
  returns a proper 409 with a clear message.

- **Sprint 5** — kitchen display, analytics, backups, data export. **The core
  requirement — a paid order reaching the kitchen and its status changes broadcasting
  live — was verified end to end**: confirmed a payment via the API, watched the order
  appear on `/kitchen` in a browser tab that was never refreshed (via the `order:created`
  WebSocket event), advanced it Pending → In Progress → Completed (each step confirmed
  live via `kitchen:task_updated`, with `startedAt`/`completedAt` timestamps set
  correctly), and watched it drop off the active queue on completion. `/admin/analytics`
  renders real aggregate queries (sales by day/week/month, top-selling products,
  inventory movement) — confirmed against actual order data, charts included, not just
  the API response. CSV export confirmed working for all three report types; PDF/XLSX
  export are **not implemented** (would need `pdfkit`/`exceljs` — flagged rather than
  half-built) and return a clear `501` instead of failing silently. The worker's nightly
  backup job was run manually (can't wait for the real 2 AM trigger) and produced a real,
  valid 28KB PostgreSQL dump; the hourly low-stock sweep was also run manually and
  correctly identified all 3 out-of-stock products. Two things worth knowing:
  "inventory movement" is derived from confirmed order items (units sold), not a
  dedicated stock-adjustment ledger — the schema doesn't have one, so manual stock
  corrections aren't reflected in that report, only sales-driven movement. And the
  worker's backup file is only written to local disk — uploading it to off-server
  storage (needed once this runs on Railway, whose filesystem is ephemeral) isn't
  implemented, since no object storage credentials are configured in this environment.

All 5 sprints from the original plan are now built. Remaining known gaps: PWA/offline
sync, hardware receipt-printer integration, and actual deployment to Railway — none of
this has run anywhere but `localhost` yet.

- **Post-Sprint-5: bulk import, user management, cost/profitability, admin redesign**
  — three gaps identified against a UI mockup reference and the manuscript's own
  requirements (bulk CSV import and user administration were both explicitly required
  but never built; per-item profitability needed a `cost` field the schema didn't
  have). All three were built and verified live: a CSV with a mix of new, updating,
  and invalid rows produced exactly the expected created/updated/error counts (matched
  by barcode); a staff account was created, confirmed it can log in, confirmed its
  sidebar correctly hides "Users & roles", and confirmed hitting `/admin/users`
  directly still redirects it away — **and confirmed the server itself rejects a staff
  token with a real 403** (not just a client-side redirect), confirmed an admin can't
  self-suspend or self-demote (400), and confirmed a suspended account is actually
  refused login (401), not just hidden in the UI. Profitability renders real
  cost/price margins from actual sales. The admin/back-office UI was also restyled to
  a distinct data-dense look (Archivo + Space Mono, new `adm-*` design tokens,
  persistent sidebar) — deliberately kept separate from the customer kiosk's warm
  branding, which is untouched. Two scope decisions made and documented in code
  comments: the mockup's "kiosk/admin/super" role model was **not** adopted (kept our
  existing admin/staff/customer roles, matching the manuscript's own User Level
  Diagram); and payment void/refund tracking from the mockup was **not** built, since
  the manuscript's Limitations section explicitly excludes it.

- **Stock adjustment log** — a manuscript-review pass against the live app surfaced
  a real gap: the Stock Adjustments feature explicitly requires "maintaining a log of
  adjustments," and while `/admin/inventory` could already change stock counts, nothing
  recorded who changed them, by how much, or why. Added a `stock_adjustments` table
  (product, delta, previous/new qty, reason, optional note, who, when) and rebuilt the
  inventory page around it: every adjustment now goes through a modal (`Add/remove` or
  `Set exact count`, with a live "12 → 15 (+3)" preview) that requires a reason —
  restock, customer return, damaged goods, spoilage, manual correction, or other,
  covering the manuscript's named causes plus the two most common real ones. A "Recent
  adjustments" panel on the same page shows the log itself (filterable by product), not
  just a changed number. Automatic stock deduction when an order is paid is deliberately
  **not** written to this log — that's sales-driven movement already tracked via
  orders/order_items and the inventory-movement report, not an "authorized user"
  adjustment, so the log stays meaningful instead of being flooded by every sale.
  Verified live end to end: a +30 restock and a set-to-12 spoilage correction both
  appeared correctly in the log with accurate before/after quantities, and the kiosk's
  SOLD OUT ribbon cleared in real time for both restocked items without a refresh.
  Also verified server-side, not just in the UI: `PATCH /api/inventory/:id` returns a
  real `400` if a quantity change is submitted without a reason, and an anonymous kiosk
  session gets a real `403` from both the adjustment endpoint and the log endpoint —
  confirmed by hitting the API directly with curl, bypassing the UI entirely.

- **Silent access-token refresh** — staff/admin JWTs expire after 15 minutes by
  design, but there was no refresh flow wired up yet (a `TODO(Sprint 2+)` sat in
  `auth/routes.ts` since Sprint 1), so every admin page independently surfaced the raw
  "Invalid or expired token" string from whichever API call happened to fire after the
  15 minutes ran out — confusing, and looked like a per-module bug rather than the
  session-wide issue it actually was. Built the originally-planned flow: login now also
  sets an httpOnly, `/api/auth`-scoped refresh cookie (7 days); `POST /api/auth/refresh`
  exchanges it for a new access token, re-checking the user's `isActive`/role against
  the database on every use (not just the token's signature) so a suspended account
  loses refresh access within one cycle instead of keeping whatever was baked into the
  token for up to 7 days. The frontend refreshes proactively in the background
  (`scheduleTokenRefresh`, started from `StaffGuard` — the shared gate for `/admin`,
  `/staff`, and `/kitchen`) and reactively on any 401 (`apiFetch`, with concurrent
  401s sharing one in-flight refresh instead of racing), retrying the original request
  once before giving up. Verified live: confirmed via curl that login sets the cookie
  correctly (`HttpOnly`, scoped to `/api/auth`), that `/refresh` succeeds with it and
  fails cleanly without it, and — the important security case — that suspending a
  still-logged-in account causes its very next refresh to fail even though its refresh
  token hasn't expired. In the browser, corrupted the stored access token in
  localStorage (simulating expiry) with a valid refresh cookie still present and
  confirmed the page loaded normally with no visible error; then cleared the refresh
  cookie too (via `/api/auth/logout`) and confirmed a clean redirect to `/login` instead
  of a raw error string.

**Rotate the seeded admin password** (`admin@zakssizzlinghub.ph` / `ChangeMe123!`) before
any real deployment — it's a dev-only default.

## Prerequisites

- Node.js 20+ and npm
- A running PostgreSQL instance. This machine already has PostgreSQL installed at
  `E:\PostgreSQL` — start it via the "postgresql-x64" Windows service, or run
  `E:\PostgreSQL\bin\pg_ctl.exe` against `E:\PostgreSQL\data`, then create a database:
  ```
  E:\PostgreSQL\bin\createdb.exe -U postgres zaks_sizzling_hub
  ```

## First-time setup

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL and the JWT secrets
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local

npm run db:migrate -w apps/api -- --name init
npm run db:seed -w apps/api
```

The seed script creates 3 roles, one admin user, and the full product catalog ported
from the `kiosk.html` prototype. It prints the seeded admin's email/password on success —
**rotate that password before any real deployment.**

## Running locally

```bash
npm run dev
```

This starts the Express API on `http://localhost:4000` and the Next.js app on
`http://localhost:3000` together (via `concurrently`). The worker isn't part of this —
run it separately (`npm run dev:worker`) only when you want the scheduled jobs live, or
trigger a job once without waiting for its schedule:

```bash
npm run backup:now      # requires PG_DUMP_PATH set to pg_dump's location on this machine
npm run low-stock:now
```

Backups are written to `apps/worker/backups/` (gitignored — these are real dumps of
whatever data is in the database, not something to commit).

## Sprint 1 verification checklist

- `POST http://localhost:4000/api/auth/login` with the seeded admin credentials returns
  a JWT.
- `GET http://localhost:4000/api/products` returns the seeded catalog.
- `http://localhost:3000` renders the kiosk home page (header, category rail, product
  grid, product modal) pulling live from the API — not mock data.
- Visiting `/admin` while logged out redirects to `/login`.

## Payments (Sprint 3)

GCash/Maya go through [PayMongo](https://paymongo.com), a PH payment aggregator — see
the plan's rationale for why (direct GCash/Maya merchant API access needs a registered
business account, generally out of reach for a capstone). To test the real gateway path:

1. Create a PayMongo account and grab your **test** secret/public keys from the
   dashboard, plus a webhook signing secret after registering a webhook endpoint.
2. Fill in `apps/api/.env`: `PAYMONGO_SECRET_KEY`, `PAYMONGO_PUBLIC_KEY`,
   `PAYMONGO_WEBHOOK_SECRET`.
3. Register a webhook in the PayMongo dashboard pointing at
   `http://<your-tunnel-url>/api/payments/webhook` (use `ngrok http 4000` or similar for
   local testing, since PayMongo can't reach `localhost` directly), subscribed to
   `checkout_session.payment.paid`.
4. Run through checkout choosing GCash or Maya — you should land on PayMongo's hosted
   checkout page, and completing a test payment there should redirect back to
   `/checkout/success` and flip the order to `confirmed` once the webhook lands.

The integration code (`apps/api/src/lib/paymongo.ts`) follows PayMongo's [Checkout
Sessions API](https://developers.paymongo.com/reference/create-a-checkout-session) as
documented, but hasn't been exercised against a live account — double check the request/
response shapes there if PayMongo's API has moved on since this was written.
