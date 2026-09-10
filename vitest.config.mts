import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

// Two projects, because the two kinds of test want different worlds.
// domain/ is pure and runs in Node in milliseconds; only components need a DOM.
export default defineConfig({
  test: {
    // Deliberately not passWithNoTests. It was set when neither project had
    // tests yet, and it went on to hide a broken one: jsdom could not start
    // at all, the ui project found nothing to run, and the suite reported
    // green. A project with no tests is a bug, not a pass.
    projects: [
      {
        resolve: { alias },
        test: {
          name: "domain",
          environment: "node",
          include: ["tests/**/*.test.ts", "src/domain/**/*.test.ts"],
          testTimeout: 20_000,
          // tests/integration needs a real database, and this project must
          // not. Without the exclusion the glob above swallows it and
          // `pnpm test` stops being runnable from a cold clone.
          exclude: ["tests/integration/**"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          // Real Postgres, one worker. These tests assert what the database
          // guarantees under concurrency, so running them against a mock
          // would assert only that the mock was written to agree.
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./tests/setup.ui.ts"],
        },
      },
    ],
  },
});
