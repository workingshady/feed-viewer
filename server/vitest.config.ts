import { defineConfig, loadEnv } from "vite";

// TEST_DATABASE_URL comes from .env (a separate database from dev; tests truncate its tables).
const { TEST_DATABASE_URL } = loadEnv("test", process.cwd(), "");
if (!TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL in .env (see private/SETUP.md).");

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/test/**/*.test.ts"],
    fileParallelism: false,
    globalSetup: ["server/test/globalSetup.ts"],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      DATABASE_URL_UNPOOLED: TEST_DATABASE_URL,
      NODE_ENV: "test",
    },
  },
});
