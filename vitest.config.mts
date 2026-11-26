import path from "node:path";
import { defineConfig } from "vitest/config";

const root = process.cwd();

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      // `server-only` throws outside the React Server bundle; tests run server code directly.
      "server-only": path.resolve(root, "tests/support/empty-module.ts"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["tests/support/test-env.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/support/global-setup.ts"],
          // One database: run files sequentially; tests inside a file share fixtures.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/server/**/*.ts", "src/lib/**/*.ts"],
      exclude: ["src/server/db/schema/**", "**/*.d.ts"],
      reporter: ["text-summary", "text", "html"],
    },
  },
});
