/**
 * Creates (or resets) an administrator account with a strong random password.
 *
 *   npm run create-admin                      → user "admin"
 *   npm run create-admin -- myname            → user "myname"
 *   npm run create-admin -- admin --reset     → new password for an existing user
 *
 * The password is never printed. It is written to `private/admin-credentials.md` (the whole
 * `private/` folder is git-ignored). Run with DATABASE_URL set to target another database.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { prisma } from "../src/db.js";

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const username = args.find((a) => !a.startsWith("--")) ?? "admin";

if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) {
  console.error("Username must be 3–32 characters: letters, digits, _ or -.");
  process.exit(1);
}

const password = randomBytes(18).toString("base64url");
const passwordHash = await bcrypt.hash(password, 12);
const existing = await prisma.user.findUnique({ where: { username } });

if (existing && !reset) {
  console.error(`User "${username}" already exists. Re-run with --reset to give it a new password.`);
  process.exit(1);
}

await prisma.user.upsert({
  where: { username },
  create: { username, passwordHash, role: "admin" },
  update: { passwordHash, role: "admin" },
});
// A reset signs the account out everywhere.
if (existing) await prisma.session.deleteMany({ where: { userId: existing.id } });

const host = new URL(process.env.DATABASE_URL ?? "postgresql://unknown").hostname;
mkdirSync(path.resolve("private"), { recursive: true });
const file = path.resolve("private", "admin-credentials.md");
writeFileSync(
  file,
  [
    "# Feed Viewer Pro — administrator login (private, git-ignored)",
    "",
    `- Status: ${existing ? "password reset" : "created"} ${new Date().toISOString()}`,
    `- Database host: \`${host}\``,
    `- Username: \`${username}\``,
    `- Password: \`${password}\``,
    "",
    "Sign in, change this password on the Account page, then delete this file.",
    "",
  ].join("\n"),
  { mode: 0o600 },
);
await prisma.$disconnect();
console.log(`Admin "${username}" ${existing ? "reset" : "created"} on ${host}. Credentials saved to ${file}`);
