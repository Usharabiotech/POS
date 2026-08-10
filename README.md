# CafePOS — economical single-store cloud POS

A lean, sellable point-of-sale for a fast-service **fruit café**. Re-scoped from an
enterprise PRD down to what one store actually needs on day one, on a stack that costs
~₹600–1,500/month to run instead of ₹5,000+.

## What it does (MVP)

- **Fast Cashier POS** — category tabs, emoji product tiles, search, cart, discount,
  Cash / UPI / Card checkout with change calculation, optional customer phone + loyalty points.
- **Speed model from the PRD** — ready-made items (80–90% of sales) complete instantly on
  payment; only freshly-prepared items open a **Kitchen Display** ticket.
- **Kitchen Display (KDS)** — live ticket cards, tap to advance Pending → Preparing → Ready →
  Completed. Cheap "realtime" via 3-second polling (no WebSocket server to host).
- **Finished-goods inventory** — per-product stock, auto-deducted on sale, out-of-stock guard,
  low-stock endpoint.
- **Day reports** — sales, order count, avg order, tax, payment mix, top sellers, sales-by-hour.
- **PWA** — opens in a browser, installable, no desktop install.

## Deliberately deferred (paid add-ons / later phases)

Multi-branch, native mobile app, WhatsApp/online/delivery channels, recipe-based inventory,
purchase orders, kiosk, loyalty wallet/memberships. These are how you upsell — not MVP scope.

## Stack (cheap to build + run)

- **One Node process**: Fastify + Prisma + PostgreSQL (no NestJS, no Redis, no message broker).
- **Client**: Vite + React + TypeScript + Tailwind, served by the same process in production.
- Deployable on a single small VPS or Railway/Render + one managed Postgres.

## Run locally (Windows)

Postgres (portable build already used by this machine) on port **5434**:

```bash
# start db (already initialized at .pgdata)
R:\Code\.pglocal\pgsql\bin\pg_ctl.exe -D R:\Code\cafepos\.pgdata -o "-p 5434" -l R:\Code\cafepos\.pgdata\server.log start
```

Then:

```bash
npm install
npm run db:deploy     # apply schema
npm run db:seed       # fruit-cafe catalog + demo users
npm run dev           # server :4000 + client :5173
```

Open http://localhost:5173 — sign in with **admin / admin123** (or **cashier / cashier123**).

## Deploy (single container)

`docker build` the included Dockerfile pattern, set `DATABASE_URL`, `JWT_SECRET`, and
`PUBLIC_DIR=/app/client/dist` so the API also serves the built SPA. One box, one Postgres.

## Selling it / margin

- One-time setup fee + monthly SaaS (hosting + support). Your run cost ≈ ₹800/mo; charge ₹2–5k/mo.
- Same codebase resells to the next café (add light multi-tenancy in Phase 2) → recurring margin.
