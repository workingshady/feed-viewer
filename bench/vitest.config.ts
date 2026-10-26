import { defineConfig } from "vitest/config";
import path from "path";

/** Accuracy benchmarks against real feeds on disk. Not part of `npm test`; run with `npm run bench:match`. */
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["bench/**/*.bench.test.ts"],
    testTimeout: 1_800_000,
    hookTimeout: 1_800_000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "../src") } },
});
