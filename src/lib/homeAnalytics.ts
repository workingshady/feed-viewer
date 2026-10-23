/**
 * Lightweight home funnel hooks. Pushes to dataLayer when present; no-op in production without GTM.
 */
export function trackHomeEvent(
  name: string,
  payload?: Record<string, string | number | boolean | undefined>,
): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug("[home]", name, payload ?? {});
  }
  const w = typeof window !== "undefined" ? window : undefined;
  const dl = w && Array.isArray((w as unknown as { dataLayer?: unknown[] }).dataLayer)
    ? ((w as unknown as { dataLayer: unknown[] }).dataLayer)
    : null;
  if (dl) {
    dl.push({ event: name, ...payload });
  }
}
