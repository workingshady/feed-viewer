import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Download, GitCompare, Loader2 } from "lucide-react";
import { completenessDelta } from "@/lib/feedValidation";
import { changesCsv } from "@/lib/reports";
import { downloadText } from "./format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { olderVersion } from "@/components/SourcePicker";
import { useVersionListings } from "@/hooks/useSources";
import { formatPriceCompact } from "@/lib/displayPrice";
import { liveVersionOf, type SourceDTO } from "@/lib/sourcesApi";
import { changedFieldCounts, priceMoves, type PriceMove } from "@/lib/sourceInsights";
import { diffListings } from "@/lib/versionDiff";
import { UI_FIELDS, type Listing } from "@/lib/types";
import { BarList, listingHref } from "./BarList";
import { DiffBadges } from "./VersionRow";
import { ListingChangeRow } from "@/components/compare/ListingChangeRow";
import { EvidenceList } from "@/components/compare/MatchEvidence";

const FIELD_LABEL = Object.fromEntries(UI_FIELDS.map((f) => [f.key, f.label])) as Record<string, string>;
const PAGE = 25;

function ListingLinks({ sourceId, listings, linked = true }: { sourceId: string; listings: Listing[]; linked?: boolean }) {
  const [shown, setShown] = useState(PAGE);
  if (!listings.length) return <p className="py-4 text-sm text-muted-foreground">None.</p>;
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border rounded-lg border">
        {listings.slice(0, shown).map((l) => (
          <li key={l.reference || l.id}>
            {(() => {
              const row = (
                <>
                  <span className="hidden w-28 shrink-0 truncate font-mono text-xs text-muted-foreground sm:inline">{l.reference}</span>
                  <span className="min-w-0 flex-1 truncate">{l.title || "Untitled"}</span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{l.community}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums">{l.price > 0 ? formatPriceCompact(l.price) : "—"}</span>
                </>
              );
              const cls = "flex items-center gap-3 px-3 py-2 text-sm";
              return linked ? (
                <Link to={listingHref(sourceId, l)} className={`${cls} hover:bg-muted/50`}>
                  {row}
                </Link>
              ) : (
                <div className={cls}>{row}</div>
              );
            })()}
          </li>
        ))}
      </ul>
      {listings.length > shown && (
        <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
          Show more ({listings.length - shown} left)
        </Button>
      )}
    </div>
  );
}

function PriceMoveList({ sourceId, moves }: { sourceId: string; moves: PriceMove[] }) {
  if (!moves.length) return <p className="text-xs text-muted-foreground">None.</p>;
  return (
    <ul className="space-y-1">
      {moves.slice(0, 8).map((m) => (
        <li key={m.listing.reference}>
          <Link to={listingHref(sourceId, m.listing)} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/50">
            <span className="min-w-0 flex-1 truncate">{m.listing.title || m.listing.reference}</span>
            <span className="hidden shrink-0 font-mono tabular-nums text-muted-foreground sm:inline">
              {formatPriceCompact(m.before)} → {formatPriceCompact(m.after)}
            </span>
            <span className={`w-14 shrink-0 text-right font-mono tabular-nums ${m.pct > 0 ? "text-destructive-text" : "text-success"}`}>
              {m.pct > 0 ? "+" : ""}
              {(m.pct * 100).toFixed(1)}%
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** What the live version changed compared with the version uploaded before it. */
export function ChangesTab({ source }: { source: SourceDTO }) {
  const live = liveVersionOf(source);
  const prev = olderVersion(source, live);
  const after = useVersionListings(live);
  const before = useVersionListings(prev);

  const data = useMemo(() => {
    if (!after.data || (prev && !before.data)) return null;
    const diff = diffListings(before.data ?? [], after.data);
    return {
      diff,
      moves: priceMoves(diff),
      fields: changedFieldCounts(diff),
      completeness: completenessDelta(before.data ?? [], after.data),
    };
  }, [after.data, before.data, prev]);

  if (!live) return <p className="py-8 text-center text-sm text-muted-foreground">No live version yet.</p>;
  if (!prev) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        v{live.number} is the first version — upload another one to see what changed.
      </p>
    );
  }
  if (!data) {
    return (
      <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Comparing v{prev.number} with v{live.number}…
      </p>
    );
  }

  const { diff, moves, fields, completeness } = data;
  const drops = completeness.filter((c) => c.flagged);
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          Live <span className="font-mono font-semibold">v{live.number}</span> vs
          <span className="font-mono font-semibold">v{prev.number}</span>
          <DiffBadges added={diff.added.length} removed={diff.removed.length} changed={diff.changed.length} />
          <span className="text-xs text-muted-foreground">{diff.unchangedCount.toLocaleString()} unchanged</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadText(`${source.name}-v${prev.number}-to-v${live.number}-changes.csv`, changesCsv(diff))}
          >
            <Download className="mr-1.5 h-4 w-4" /> Changes (CSV)
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/feed-compare?source=${source.id}&a=${prev.id}&b=${live.id}`}>
              <GitCompare className="mr-1.5 h-4 w-4" /> Field-by-field compare
            </Link>
          </Button>
        </div>
      </div>

      {drops.length > 0 && (
        <div role="alert" className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span>
            Data got thinner in v{live.number}:{" "}
            {drops.map((d) => `${d.field} ${Math.round(d.before * 100)}% → ${Math.round(d.after * 100)}%`).join(", ")}. Check the agency's
            export or the field mapping.
          </span>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Field completeness, v{prev.number} → v{live.number}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {completeness.map((c) => (
              <li key={c.field} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{c.field}</span>
                <span className="font-mono tabular-nums">
                  {Math.round(c.before * 100)}% → {Math.round(c.after * 100)}%
                </span>
                <span
                  className={`w-12 text-right font-mono tabular-nums ${
                    c.flagged ? "font-semibold text-destructive-text" : c.delta > 0.005 ? "text-success" : "text-muted-foreground"
                  }`}
                >
                  {Math.abs(c.delta) < 0.005 ? "=" : `${c.delta > 0 ? "+" : ""}${Math.round(c.delta * 100)}`}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <ArrowUpRight className="h-4 w-4 text-destructive-text" aria-hidden /> Price rises ({moves.up.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PriceMoveList sourceId={source.id} moves={moves.up} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <ArrowDownRight className="h-4 w-4 text-success" aria-hidden /> Price drops ({moves.down.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PriceMoveList sourceId={source.id} moves={moves.down} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Most-changed fields</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <BarList
              buckets={fields.slice(0, 8).map((f) => ({ ...f, label: FIELD_LABEL[f.label] ?? f.label }))}
              emptyText="No field changes"
            />
            {moves.medianPct != null && (
              <p className="text-xs text-muted-foreground">
                Median price change: {(moves.medianPct * 100).toFixed(1)}% across {moves.up.length + moves.down.length} listings
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={diff.added.length ? "added" : diff.changed.length ? "changed" : "removed"}>
        <TabsList>
          <TabsTrigger value="added">Added {diff.added.length}</TabsTrigger>
          <TabsTrigger value="removed">Removed {diff.removed.length}</TabsTrigger>
          <TabsTrigger value="changed">Changed {diff.changed.length}</TabsTrigger>
          {diff.relisted.length > 0 && <TabsTrigger value="relisted">Relisted {diff.relisted.length}</TabsTrigger>}
          {diff.possibleRelists.length > 0 && <TabsTrigger value="review">To review {diff.possibleRelists.length}</TabsTrigger>}
        </TabsList>
        <TabsContent value="added">
          <ListingLinks sourceId={source.id} listings={diff.added} />
        </TabsContent>
        <TabsContent value="removed">
          <p className="mb-2 text-xs text-muted-foreground">These were in v{prev.number} but are not in the live version.</p>
          <ListingLinks sourceId={source.id} listings={diff.removed} linked={false} />
        </TabsContent>
        <TabsContent value="relisted">
          <p className="mb-2 text-xs text-muted-foreground">
            Same property under a new reference number, matched on the property itself (permit, photos, description, size, layout,
            location), so it isn't counted as removed + added.
          </p>
          <ul className="space-y-2">
            {diff.relisted.slice(0, 200).map((r) => (
              <ListingChangeRow
                key={r.after.reference}
                before={r.before}
                after={r.after}
                changes={r.changes}
                href={listingHref(source.id, r.after)}
                header={
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-mono text-muted-foreground line-through">{r.before.reference}</span>
                      <span aria-hidden>→</span>
                      <span className="font-mono font-semibold">{r.after.reference}</span>
                    </div>
                    <EvidenceList evidence={r.evidence} limit={4} compact />
                  </div>
                }
              />
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="review">
          <p className="mb-2 text-xs text-muted-foreground">
            Possibly the same property under a new reference, but not certain enough to merge. They stay counted as removed and added.
          </p>
          <ul className="divide-y divide-border rounded-lg border text-sm">
            {diff.possibleRelists.slice(0, 200).map((p, i) => (
              <li key={i} className="space-y-1.5 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-muted-foreground">{p.before.reference}</span>
                  <span aria-hidden>↔</span>
                  <Link to={listingHref(source.id, p.after)} className="font-mono hover:underline">
                    {p.after.reference}
                  </Link>
                  <span className="min-w-0 flex-1 truncate">{p.after.title}</span>
                </div>
                <EvidenceList evidence={p.evidence} limit={4} compact />
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="changed">
          {diff.changed.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">None.</p>
          ) : (
            <ul className="space-y-2">
              {diff.changed.slice(0, 300).map((c) => (
                <ListingChangeRow key={c.after.reference || c.after.id} before={c.before} after={c.after} changes={c.changes} href={listingHref(source.id, c.after)} />
              ))}
            </ul>
          )}
          {diff.completenessOnly.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {diff.completenessOnly.length.toLocaleString()} more listings only had values filled in or dropped; see Compare versions → Data gaps.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
