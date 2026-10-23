import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { defineConfig, devices } from "@playwright/test";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(rootDir, ".env") });

/**
 * E2E against production build + preview (no dependency on lovable-agent-playwright-config).
 * Set `E2E_EXTERNAL_SERVER=1` and optionally `E2E_BASE_URL` (e.g. dev on :8080) to skip the managed preview.
 * Plain `E2E_BASE_URL` in `.env` alone is ignored so local dev URLs do not break `npm run test:e2e`.
 */
const useExternalServer = process.env.E2E_EXTERNAL_SERVER === "1";
const baseURL = useExternalServer
  ? (process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:8080")
  : "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: useExternalServer
    ? undefined
    : {
        command: "npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
