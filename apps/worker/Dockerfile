# The background worker's image: Node.js plus the PostgreSQL 18 client, so the nightly
# backup's pg_dump matches the PostgreSQL 18 server on Railway. Debian's own pg_dump is
# version 17, and pg_dump refuses to back up a newer server, so the client comes from
# PostgreSQL's official package repository (apt.postgresql.org).
#
# Built from the repository root (the npm workspaces need the root lockfile). On
# Railway, the worker service uses this file: Settings → Build → Dockerfile path
# apps/worker/Dockerfile. The other services still build with Railpack.
FROM node:22-trixie-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl openssl \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt trixie-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-18 \
  && apt-get purge -y curl \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/* \
  && pg_dump --version

WORKDIR /app

# Same install and build as the Railpack build this replaces. Dev dependencies are
# needed to build (tsc, prisma); the root postinstall generates the Prisma client.
COPY . .
RUN npm ci && npm run build -w apps/worker

ENV NODE_ENV=production
CMD ["npm", "run", "start", "-w", "apps/worker"]
