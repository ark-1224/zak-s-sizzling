# Zak's Sizzling Hub

Self-service kiosk with real-time inventory and order management (capstone project). TypeScript monorepo on npm workspaces.

## Workspaces

- `apps/web` (package `web`): Next.js 16 App Router UI, which includes the customer kiosk (`/`, `/checkout`), the staff and admin screens, and the kitchen display. It talks to the API over REST and Socket.IO. This Next.js version differs from what you may know, so read `apps/web/AGENTS.md` before writing Next code.
- `apps/api` (`@zaks/api`): Express REST API plus the Socket.IO server. It owns the Prisma schema, migrations and seed in `apps/api/prisma/`.
- `apps/worker` (`@zaks/worker`): node-cron jobs. It runs an hourly low-stock sweep and a `pg_dump` backup that is only scheduled when `NODE_ENV=development`. It generates its Prisma client from the api's schema.
- `packages/shared-types` (`@zaks/shared-types`): types shared by web and api, used as source (`src/index.ts`) with no build step. Change shared types here and never duplicate them inside an app.

## Commands

Run everything from the repo root.

| Task | Command |
|---|---|
| Dev (api + web) | `npm run dev` |
| Dev, one app | `npm run dev:api` · `npm run dev:web` · `npm run dev:worker` (the worker is not part of `npm run dev`) |
| Build | `npm run build -w apps/api` · `npm run build -w apps/web` · `npm run build -w apps/worker` |
| Lint | `npm run lint -w apps/web` (only web has a lint script; api and worker have none) |
| Typecheck | No script. Use `npx tsc --noEmit -p apps/api/tsconfig.json`, and the same with `apps/worker` or `apps/web` |
| Test | None. There is no test runner and there are no test files yet, so never claim tests pass |
| Worker jobs, once | `npm run low-stock:now` · `npm run backup:now` (needs `PG_DUMP_PATH`) |

## Prisma

The schema is at `apps/api/prisma/schema.prisma`, and migrations are in `apps/api/prisma/migrations/`.

- Generate the client with `npm run db:generate -w apps/api`. It also runs automatically on root `npm install` (postinstall).
- Create a migration in development with `npm run db:migrate -w apps/api -- --name <change>`. This runs `prisma migrate dev`, which is interactive and for development only.
- Apply existing migrations with `npm run db:migrate:deploy -w apps/api`. The api's Railway start command already runs this.
- Seed with `npm run db:seed`, and browse data with `npm run db:studio`.

## Environment

- The api loads `apps/api/.env` through `import "dotenv/config"`, which reads `.env` from the workspace folder it runs in. The Prisma CLI reads the same file.
- The web app reads `apps/web/.env.local`. The template for both is the root `.env.example`.
- The worker also uses `dotenv/config`, so it reads `apps/worker/.env`. The README setup doesn't create that file, so set the worker's variables yourself.
- Hosting is on Railway, with separate web, api and worker services plus managed Postgres.

## Rules

- Always run commands from the repo root, using `-w <workspace>`.
- Before saying a task is done, run typecheck and lint for every workspace you changed. Lint on `main` already has errors, so compare against `main` before blaming your change.
- DBHub (MCP) is connected to the local development database only. Never run destructive SQL (`DELETE`, `UPDATE`, `DROP`, `TRUNCATE`, `ALTER`) without asking first.
- Never commit secrets or `.env` / `.env.local` files, and never write keys, passwords or connection strings into tracked files.
- Adviser/panel requirement: the app sidebar stays visible at every screen width, as an icon rail on mobile. Never hide it.
