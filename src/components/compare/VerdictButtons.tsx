import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useDecide, useMatchDecisions } from "@/hooks/useMatching";
import { pairKey, type MatchContext } from "@/lib/propertyMatch";
import { hasRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { ListingSnapshot } from "@/lib/matchingApi";
import type { Listing } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";

/** What gets stored with a verdict, so the review log still reads after listings leave the feed. */
function snapshotOf(l: Listing): ListingSnapshot {
  return {
    id: l.id,
    agency: l.sourceAgency,
    reference: l.reference || undefined,
    title: (l.title || "").slice(0, 300) || undefined,
    price: l.price > 0 ? l.price : undefined,
    currency: l.currency || undefined,
    image: l.images?.[0]?.slice(0, 1000),
    community: l.community || undefined,
    beds: Number.isFinite(l.beds) ? l.beds : undefined,
    area: l.area > 0 ? Math.round(l.area) : undefined,
    permit: l.permitNumber || undefined,
  };
}

/**
 * Reviewer verdict on a suggested match: shared with the team, applied immediately, and used as
 * labelled data by the next training run. Viewers see the verdict; editors can set it.
 */
export function VerdictButtons({ listings, context, className }: { listings: Listing[]; context: MatchContext; className?: string }) {
  const ids = listings.map((l) => l.id);
  const { user } = useAuth();
  const { byKey } = useMatchDecisions();
  const decide = useDecide();
  const current = byKey.get(pairKey(ids));
  const canEdit = hasRole(user?.role, "editor");
  const set = (v: "same" | "different") =>
    decide.mutate({ listingIds: ids, verdict: current?.verdict === v ? null : v, context, snapshot: listings.slice(0, 12).map(snapshotOf) });
  const by = current?.by ? ` by ${current.by}` : "";
  return (
    <span className={cn("inline-flex overflow-hidden rounded-lg border border-border", className)} role="group" aria-label="Your verdict">
      <button
        type="button"
        disabled={!canEdit}
        aria-pressed={current?.verdict === "same"}
        title={current?.verdict === "same" ? `Confirmed${by}` : "Confirm: same property"}
        onClick={() => set("same")}
        className={cn(
          "inline-flex h-8 items-center gap-1 px-2.5 text-xs disabled:cursor-not-allowed",
          current?.verdict === "same" ? "bg-success/15 text-success" : "text-muted-foreground hover:bg-muted",
        )}
      >
        <ThumbsUp className="h-3.5 w-3.5" aria-hidden /> Same
      </button>
      <button
        type="button"
        disabled={!canEdit}
        aria-pressed={current?.verdict === "different"}
        title={current?.verdict === "different" ? `Marked not the same${by}` : "Not the same property"}
        onClick={() => set("different")}
        className={cn(
          "inline-flex h-8 items-center gap-1 border-l border-border px-2.5 text-xs disabled:cursor-not-allowed",
          current?.verdict === "different" ? "bg-destructive/10 text-destructive-text" : "text-muted-foreground hover:bg-muted",
        )}
      >
        <ThumbsDown className="h-3.5 w-3.5" aria-hidden /> Not the same
      </button>
    </span>
  );
}
