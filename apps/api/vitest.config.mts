import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const apiDir = fileURLToPath(new URL(".", import.meta.url));

// Two projects:
// - unit: single functions and middleware in isolation, no database or server.
// - integration: real HTTP requests through the Express app into PostgreSQL.
//
// Integration tests reuse the JWT secrets and Postgres server from apps/api/.env, but
// never its database: they run against TEST_DATABASE_URL, or the dev database name
// with "_test" appended. Their global setup empties that database on every run, so
// anything whose name doesn't end in "_test" is refused.
loadEnv({ path: `${apiDir}.env`, quiet: true });

function resolveTestDatabaseUrl(): string | undefined {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (!process.env.DATABASE_URL) return undefined;
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `${url.pathname.replace(/^\//, "")}_test`;
  return url.toString();
}

const testDatabaseUrl = resolveTestDatabaseUrl();
if (testDatabaseUrl) {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, "");
  if (!databaseName.endsWith("_test")) {
    throw new Error(`Refusing to run tests against "${databaseName}": the test database name must end in "_test"`);
  }
  // Set here too (not only in the project's env) so the integration global setup,
  // which runs in this process, migrates and seeds the test database, not the dev one.
  process.env.DATABASE_URL = testDatabaseUrl;
}
process.env.NODE_ENV = "test";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["test/unit/**/*.test.ts"],
          // Fixed secrets so unit tests never depend on (or read) the real .env values.
          env: {
            NODE_ENV: "test",
            JWT_ACCESS_SECRET: "unit-test-access-secret",
            JWT_REFRESH_SECRET: "unit-test-refresh-secret",
            KIOSK_SESSION_SECRET: "unit-test-kiosk-secret",
          },
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["test/integration/**/*.test.ts"],
          globalSetup: ["./test/integration/global-setup.ts"],
          env: { NODE_ENV: "test", ...(testDatabaseUrl ? { DATABASE_URL: testDatabaseUrl } : {}) },
          // Every file shares one seeded database, so run files one at a time.
          fileParallelism: false,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
