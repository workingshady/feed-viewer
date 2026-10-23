/** Sends browser errors to the API (logged in Vercel and listed in Admin → Status). */

type Kind = "error" | "unhandledrejection" | "render";

const sent = new Set<string>();
const MAX_PER_PAGE_LOAD = 10;

export function reportClientError(error: unknown, kind: Kind = "error"): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const key = `${kind}:${err.message}`;
  if (sent.has(key) || sent.size >= MAX_PER_PAGE_LOAD) return;
  sent.add(key);
  const body = JSON.stringify({
    message: err.message.slice(0, 500) || "Unknown error",
    stack: err.stack?.slice(0, 4000),
    path: location.pathname,
    kind,
  });
  // keepalive lets the report survive a navigation or reload.
  void fetch("/api/telemetry/error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    keepalive: true,
    body,
  }).catch(() => undefined);
}

export function installGlobalErrorReporting(): void {
  window.addEventListener("error", (e) => reportClientError(e.error ?? e.message, "error"));
  window.addEventListener("unhandledrejection", (e) => reportClientError(e.reason, "unhandledrejection"));
}
