/** Dedicated test database — never run tests against the dev database. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://syncroom:syncroom@localhost:5433/syncroom_test?schema=public";
