import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://syncroom:syncroom@localhost:5432/syncroom_test?schema=public";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup.ts"],
    // All test files share one database, so they must run sequentially.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      // Everything under test runs against the dedicated test database.
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: "test-secret",
      JWT_EXPIRES_IN: "1h",
      CLIENT_ORIGIN: "http://localhost:5173",
      NODE_ENV: "test",
      PORT: "0",
    },
  },
});
