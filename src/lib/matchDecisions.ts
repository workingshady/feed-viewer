/**
 * A reviewer's verdict on a suggested "same property" group, kept per browser. Keyed by the sorted
 * listing ids so the decision survives re-runs as long as the same listings are grouped.
 */
export type MatchDecision = "same" | "different";

const KEY = "feedviewer.matchDecisions.v1";

export const groupKey = (ids: string[]) => [...ids].sort().join("|");

export function readDecisions(): Record<string, MatchDecision> {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : {};
    return v && typeof v === "object" ? (v as Record<string, MatchDecision>) : {};
  } catch {
    return {};
  }
}

export function writeDecisions(d: Record<string, MatchDecision>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* private mode: decisions just won't persist */
  }
}
