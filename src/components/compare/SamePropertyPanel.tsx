import { useMemo } from "react";
import { ChangeChip } from "@/components/compare/ListingChangeRow";
import { EvidenceList, ScoreMeter, VerdictBadge } from "@/components/compare/MatchEvidence";
import { listingChangeSet } from "@/lib/listingChanges";
import { prepareListings, scorePair } from "@/lib/propertyMatch";
import { MATCH_WEIGHTS } from "@/lib/propertyMatchWeights";
import type { Listing } from "@/lib/types";

const name = (l: Listing, i: number) => `#${i + 1} ${l.sourceAgency ? `${l.sourceAgency} · ` : ""}${l.reference || "no ref"}`;

/**
 * For every pair of compared listings: are they the same property (with the evidence), and what
 * actually differs between them once formatting noise is ignored.
 */
export function SamePropertyPanel({ listings }: { listings: Listing[] }) {
  const pairs = useMemo(() => {
    const items = prepareListings(listings.map((l, i) => ({ group: `${l.sourceAgency ?? ""}#${i}`, listings: [l] })));
    const out: { i: number; j: number; score: ReturnType<typeof scorePair>; changes: ReturnType<typeof listingChangeSet> }[] = [];
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++) {
        const sameAgency = (listings[i].sourceAgency ?? "") === (listings[j].sourceAgency ?? "");
        out.push({ i, j, score: scorePair(items[i], items[j], sameAgency ? "versions" : "agencies"), changes: listingChangeSet(listings[i], listings[j]) });
      }
    return out;
  }, [listings]);

  if (pairs.length === 0) return null;
  return (
    <section aria-label="Same property check" className="mb-5 space-y-2 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <h2 className="text-sm font-semibold text-foreground">Same property?</h2>
      <ul className="space-y-3">
        {pairs.map(({ i, j, score, changes }) => {
          const sameAgency = (listings[i].sourceAgency ?? "") === (listings[j].sourceAgency ?? "");
          return (
            <li key={`${i}-${j}`} className="space-y-2 border-t border-border/70 pt-3 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-foreground">{name(listings[i], i)}</span>
                <span className="text-muted-foreground">vs</span>
                <span className="font-medium text-foreground">{name(listings[j], j)}</span>
                <VerdictBadge verdict={score.verdict} />
                <ScoreMeter score={score.score} threshold={MATCH_WEIGHTS[sameAgency ? "versions" : "agencies"].match} />
              </div>
              <EvidenceList evidence={score.evidence} limit={6} compact />
              {changes.material.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  <span className="self-center text-[11px] font-medium text-muted-foreground">Differs:</span>
                  {changes.material.map((c) => (
                    <ChangeChip key={c.key} change={c} />
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">No differences beyond formatting.</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
