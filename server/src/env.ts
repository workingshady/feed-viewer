function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/** Mutable so tests can flip flags (e.g. ALLOW_SIGNUP) per case. */
export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? "8788"),
  DATABASE_URL: required("DATABASE_URL"),
  ALLOW_SIGNUP: process.env.ALLOW_SIGNUP === "true",
  SESSION_TTL_DAYS: Number(process.env.SESSION_TTL_DAYS ?? "30"),
};

export const isProduction = () => env.NODE_ENV === "production";
