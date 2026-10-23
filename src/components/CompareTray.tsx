import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GitCompare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/AuthProvider";
import { useAppData } from "@/providers/DataProvider";
import {
  COMPARE_UPDATED_EVENT,
  getCompareListingIds,
  removeCompareListingId,
} from "@/lib/compareSelection";
import { cn } from "@/lib/utils";

export function CompareTray() {
  const { user } = useAuth();
  const { listings } = useAppData();
  const [ids, setIds] = useState(() => getCompareListingIds());
  useEffect(() => {
    const sync = () => setIds(getCompareListingIds());
    sync();
    window.addEventListener(COMPARE_UPDATED_EVENT, sync);
    return () => window.removeEventListener(COMPARE_UPDATED_EVENT, sync);
  }, []);

  const labels = useMemo(() => {
    const byId = new Map(listings.map((l) => [l.id, l]));
    return ids.map((id) => {
      const l = byId.get(id);
      const label = l?.title || l?.reference || id;
      return { id, label: label.length > 42 ? `${label.slice(0, 40)}…` : label };
    });
  }, [ids, listings]);

  if (!user || ids.length === 0) return null;

  const canOpen = ids.length >= 2;

  return (
    <div
      className={cn(
        "fixed z-[45] bottom-0 left-0 right-0 p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none",
        "flex justify-center",
      )}
      aria-label="Compare tray"
    >
      <div
        className={cn(
          "pointer-events-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3",
          "max-w-2xl w-full rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-lg px-3 py-2.5 sm:px-4",
        )}
      >
        <div className="flex items-center gap-2 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <GitCompare className="w-4 h-4 text-primary-text" aria-hidden />
          Compare
          <span className="tabular-nums rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-foreground">{ids.length}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
          {labels.map(({ id, label }) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 max-w-[200px] rounded-lg bg-muted/80 pl-2 pr-1 py-0.5 text-xs text-foreground border border-border/60"
            >
              <span className="truncate" title={label}>
                {label}
              </span>
              <button
                type="button"
                className="shrink-0 rounded-md p-0.5 hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Remove ${label} from compare`}
                onClick={() => removeCompareListingId(id)}
              >
                <X className="w-3.5 h-3.5 opacity-70" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0 justify-end">
          {canOpen ? (
            <Button asChild size="sm" variant="default" className="rounded-xl">
              <Link to="/compare">Open</Link>
            </Button>
          ) : (
            <Button type="button" size="sm" variant="secondary" className="rounded-xl" disabled>
              Need 2+ to compare
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
