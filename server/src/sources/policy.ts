/** A new version that loses more than this share of the live listings is saved but not applied. */
export const MAX_AUTO_APPLY_DROP = 0.3;

export function decideAutoApply(
  liveCount: number | null,
  newCount: number,
): { apply: true } | { apply: false; reason: "count_drop" } {
  if (liveCount && liveCount > 0 && newCount < (1 - MAX_AUTO_APPLY_DROP) * liveCount) {
    return { apply: false, reason: "count_drop" };
  }
  return { apply: true };
}

/**
 * Versions to delete so that at most `retain` remain. Pinned and live versions are never
 * pruned but do count toward `retain`; the oldest prunable versions go first.
 */
export function selectVersionsToPrune(
  versions: { id: string; number: number; pinned: boolean }[],
  retain: number,
  liveId: string | null,
): string[] {
  const excess = versions.length - retain;
  if (excess <= 0) return [];
  return [...versions]
    .sort((a, b) => a.number - b.number)
    .filter((v) => !v.pinned && v.id !== liveId)
    .slice(0, excess)
    .map((v) => v.id);
}
