import { execSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { TEST_DATABASE_URL } from "./db-url";

/**
 * Runs once before the test suite: creates the test database if it does not
 * exist, then applies the migrations.
 */
export default async function globalSetup() {
  const dbName = new URL(TEST_DATABASE_URL).pathname.split("/")[1];

  // Connect to the maintenance `postgres` database. `pgbouncer=true` makes
  // Prisma run CREATE DATABASE outside a transaction block.
  const adminUrl = (() => {
    const url = new URL(TEST_DATABASE_URL);
    url.pathname = "/postgres";
    url.searchParams.set("pgbouncer", "true");
    return url.toString();
  })();

  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    console.log(`[test] Created database ${dbName}`);
  } catch {
    // Database already exists.
  } finally {
    await admin.$disconnect();
  }

  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
