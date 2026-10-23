import { execSync } from "node:child_process";
import { loadEnv } from "vite";

/** Applies migrations to the test database (tests truncate their own tables). Needs `npm run db:up`. */
export default function setup() {
  const url = loadEnv("test", process.cwd(), "").TEST_DATABASE_URL;
  try {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url }, stdio: "pipe" });
  } catch (e) {
    throw new Error(`Test database unavailable — run \`npm run db:up\` first.\n${(e as Error).message}`);
  }
}
