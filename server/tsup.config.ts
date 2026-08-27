import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  sourcemap: true,
  // Prisma's generated client loads its query engine at runtime, so it must
  // stay external and resolve from node_modules.
  external: ["@prisma/client"],
});
