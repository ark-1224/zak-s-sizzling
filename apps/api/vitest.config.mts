import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const apiDir = fileURLToPath(new URL(".", import.meta.url));

// Tests reuse the JWT secrets and Postgres server from apps/api/.env, but never its
// database: they run against TEST_DATABASE_URL, or the dev database name with "_test"
// appended. The global setup wipes that database on every run, so refuse anything
// whose name doesn't end in "_test".
loadEnv({ path: `${apiDir}.env`, quiet: true });

function resolveTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in apps/api/.env or TEST_DATABASE_URL to run tests");
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `${url.pathname.replace(/^\//, "")}_test`;
  return url.toString();
}

const testDatabaseUrl = resolveTestDatabaseUrl();
const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, "");
if (!databaseName.endsWith("_test")) {
  throw new Error(`Refusing to run tests against "${databaseName}": the test database name must end in "_test"`);
}

// Set here too (not only in test.env) so the global setup, which runs in this process,
// migrates and seeds the test database rather than the dev one.
process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = "test";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    env: { DATABASE_URL: testDatabaseUrl, NODE_ENV: "test" },
    // Every file shares one seeded database, so run files one at a time.
    fileParallelism: false,
    hookTimeout: 120_000,
  },
});
