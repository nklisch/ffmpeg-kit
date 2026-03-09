import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "__tests__/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 15_000,
    pool: "forks",
    maxWorkers: 4,
    minWorkers: 1,
    globals: false,
    environment: "node",
    passWithNoTests: true,
  },
});
