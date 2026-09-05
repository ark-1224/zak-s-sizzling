# Zak's Sizzling Hub — Kiosk & Inventory System

Web-based self-service kiosk with integrated real-time stock inventory and transaction
management, built for Zak's Sizzling Hub (STI College Bacoor capstone project).

Full roadmap: see the plan this was scaffolded from — Sprint 1 (auth, roles, read-only
catalog) is the current milestone. Sprints 2-5 (cart/ordering, payments, inventory/barcode,
kitchen display/analytics) are not built yet.

## Structure

```
apps/
  web/      Next.js 14 App Router — kiosk, staff, admin, kitchen UI
  api/      Express REST + Socket.IO server, Prisma/PostgreSQL
  worker/   Scheduled jobs (backups, low-stock sweep) — added in Sprint 5
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

Sprint 4 (inventory management, barcode scanning, real-time stock) is next.

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
`http://localhost:3000` together (via `concurrently`).

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
