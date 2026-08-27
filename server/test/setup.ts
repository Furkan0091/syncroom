import { TEST_DATABASE_URL } from "./db-url";

// The Prisma client is instantiated at import time, so force the test database
// before any source module is loaded.
process.env.DATABASE_URL = TEST_DATABASE_URL;
