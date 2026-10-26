import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Download, ExternalLink, Search, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { ChartCard, Columns, HBars, SERIES } from "@/components/charts/ChartKit";
import { VerdictButtons } from "@/components/compare/VerdictButtons";
import { SearchableSelect, Segmented } from "@/components/listings/FilterControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMatchDecisions, MATCH_MODEL_KEY } from "@/hooks/useMatching";
import { formatPriceCompact } from "@/lib/displayPrice";
import { getActiveModel, type ListingSnapshot, type MatchDecisionDTO } from "@/lib/matchingApi";
import { toCsv } from "@/lib/reports";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { downloadText, timeAgo } from "@/components/sources/format";
import { useAppData } from "@/providers/DataProvider";

const PAGE = 30;

type Row = MatchDecisionDTO & {
  /** Live listing when it is still in a feed, otherwise the snapshot taken at review time. */
  items: { id: string; live: Listing | null; snap: ListingSnapshot | null }[];
};

/** A snapshot dressed as a listing, so the verdict buttons can still change a decision after the listing left the feed. */
function asListing(id: string, snap: ListingSnapshot | null): Listing {
  return {
    id,
    reference: snap?.reference ?? id.split(":").slice(1).join(":"),
    title: snap?.title ?? "",
    price: snap?.price ?? 0,
    currency: snap?.currency ?? "",
    images: snap?.image ? [snap.image] : [],
    community: snap?.community ?? "",
    beds: snap?.beds ?? 0,
    area: snap?.area ?? 0,
    permitNumber: snap?.permit ?? "",
    sourceAgency: snap?.agency,
  } as Listing;
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

/**
 * Every "same property" / "not the same" verdict the team has made: who, when, on which listings,
 * with what the reviewer saw. Verdicts can be changed or cleared here; each change applies to
 * matching immediately and feeds the next training run.
 */
export default function MatchReviewsPage() {
  const { listingsByAgency, isLoading: dataLoading } = useAppData();
  const decisions = useMatchDecisions();
  const model = useQuery({ queryKey: MATCH_MODEL_KEY, queryFn: getActiveModel });

  const liveById = useMemo(() => {
    const m = new Map<string, Listing>();
    for (const ls of listingsByAgency.values()) for (const l of ls) m.set(l.id, l);
    return m;
  }, [listingsByAgency]);

  const rows = useMemo<Row[]>(
    () =>
      (decisions.data ?? []).map((d) => ({
        ...d,
        items: d.listingIds.map((id) => ({ id, live: liveById.get(id) ?? null, snap: d.snapshot?.find((s) => s.id === id) ?? null })),
      })),
    [decisions.data, liveById],
  );

  const [q, setQ] = useState("");
  const [verdict, setVerdict] = useState("all");
  const [context, setContext] = useState("all");
  const [reviewer, setReviewer] = useState("all");
  const [liveness, setLiveness] = useState("all");
  const [shown, setShown] = useState(PAGE);

  const reviewers = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of rows) c.set(r.by ?? "unknown", (c.get(r.by ?? "unknown") ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, label: value, count }));
  }, [rows]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (verdict !== "all" && r.verdict !== verdict) return false;
      if (context !== "all" && r.context !== context) return false;
      if (reviewer !== "all" && (r.by ?? "unknown") !== reviewer) return false;
      const live = r.items.every((x) => x.live);
      if (liveness === "live" && !live) return false;
      if (liveness === "gone" && live) return false;
      if (!query) return true;
      return r.items.some(({ live, snap }) =>
        `${live?.title ?? snap?.title ?? ""} ${live?.reference ?? snap?.reference ?? ""} ${live?.sourceAgency ?? snap?.agency ?? ""} ${live?.permitNumber ?? snap?.permit ?? ""} ${live?.community ?? snap?.community ?? ""}`
          .toLowerCase()
          .includes(query),
      );
    });
  }, [rows, q, verdict, context, reviewer, liveness]);

  const stats = useMemo(() => {
    const same = rows.filter((r) => r.verdict === "same").length;
    const byDay = new Map<string, { same: number; different: number }>();
    for (const r of rows) {
      const k = dayKey(r.updatedAt);
      const e = byDay.get(k) ?? { same: 0, different: 0 };
      e[r.verdict]++;
      byDay.set(k, e);
    }
    const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-30);
    const stillLive = rows.filter((r) => r.items.every((x) => x.live)).length;
    return {
      same,
      different: rows.length - same,
      versions: rows.filter((r) => r.context === "versions").length,
      agencies: rows.filter((r) => r.context === "agencies").length,
      stillLive,
      days: days.map(([d, v]) => ({ label: d.slice(5), same: v.same, different: v.different })),
    };
  }, [rows]);

  const exportCsv = () =>
    downloadText(
      "match-reviews.csv",
      toCsv(
        ["verdict", "context", "reviewer", "updated_at", "listing_id", "agency", "reference", "title", "price", "permit", "still_live"],
        filtered.flatMap((r) =>
          r.items.map(({ id, live, snap }) => [
            r.verdict,
            r.context,
            r.by ?? "",
            r.updatedAt,
            id,
            live?.sourceAgency ?? snap?.agency ?? "",
            live?.reference ?? snap?.reference ?? "",
            live?.title ?? snap?.title ?? "",
            live?.price ?? snap?.price ?? "",
            live?.permitNumber ?? snap?.permit ?? "",
            live ? "yes" : "no",
          ]),
        ),
      ),
    );

  const m = model.data;
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container max-w-[min(100%,90rem)] space-y-6 px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl space-y-1">
            <h1 className="flex items-center gap-2 font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
              <ClipboardCheck className="h-6 w-6 text-primary-text" aria-hidden /> Match reviews
            </h1>
            <p className="text-sm text-muted-foreground">
              Every "same property" and "not the same" verdict your team has made. Verdicts apply to matching immediately, for everyone,
              and are the best training data the matching model gets. Change or clear one here and it takes effect the same way. When a
              listing or a whole agency leaves the workspace, its verdicts stay here as history (with what the reviewer saw) but no longer
              affect matching; if the listing comes back with the same reference, the verdict applies again.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/cross-agency-dupes">Open review queue</Link>
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="mr-1.5 h-4 w-4" /> CSV
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Summary">
          <Tile label="Verdicts" value={rows.length} hint={`${reviewers.length} reviewer${reviewers.length === 1 ? "" : "s"}`} />
          <Tile label="Same property" value={stats.same} hint="always matched" icon={<ThumbsUp className="h-3.5 w-3.5 text-success" />} />
          <Tile label="Not the same" value={stats.different} hint="never matched" icon={<ThumbsDown className="h-3.5 w-3.5 text-destructive-text" />} />
          <Tile label="Across agencies" value={stats.agencies} hint={`${stats.versions} within a feed`} />
          <Tile label="Listings still live" value={stats.stillLive} hint={`of ${rows.length} verdicts`} />
          <Tile
            label="Since last training"
            value={m?.decisionsSince ?? 0}
            hint={m?.lastTrainedAt ? `trained ${timeAgo(m.lastTrainedAt)}; retrains at 25` : "not trained yet; retrains at 25"}
          />
        </section>

        {rows.length > 0 && (
          <section className="grid gap-4 lg:grid-cols-2" aria-label="Activity">
            <ChartCard
              title="Verdicts per day"
              description="Last 30 days with activity, by verdict."
              legend={[
                { label: "Same property", color: SERIES[2] },
                { label: "Not the same", color: SERIES[1] },
              ]}
              table={{ columns: ["Day", "Same", "Not the same"], rows: stats.days.map((d) => [d.label, d.same, d.different]) }}
            >
              <Columns
                data={stats.days}
                xKey="label"
                series={[
                  { key: "same", label: "Same property", color: SERIES[2] },
                  { key: "different", label: "Not the same", color: SERIES[1] },
                ]}
                height={200}
              />
            </ChartCard>
            <ChartCard title="By reviewer" description="Click a bar to see that reviewer's verdicts." table={{ columns: ["Reviewer", "Verdicts"], rows: reviewers.map((r) => [r.label, r.count]) }}>
              <HBars
                data={reviewers.map((r) => ({ name: r.label, count: r.count }))}
                labelKey="name"
                series={[{ key: "count", label: "Verdicts", color: SERIES[0] }]}
                onSelect={(r) => setReviewer(String(r.name))}
              />
            </ChartCard>
          </section>
        )}

        <section className="flex flex-wrap items-center gap-2" aria-label="Filters">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, reference, agency, permit…" className="h-9 pl-9 text-sm" />
          </div>
          <Segmented
            label="Verdict"
            value={verdict}
            onChange={setVerdict}
            options={[
              { value: "all", label: "All" },
              { value: "same", label: "Same", count: stats.same },
              { value: "different", label: "Not the same", count: stats.different },
            ]}
          />
          <Segmented
            label="Where"
            value={context}
            onChange={setContext}
            options={[
              { value: "all", label: "All" },
              { value: "agencies", label: "Across agencies", count: stats.agencies },
              { value: "versions", label: "Within a feed", count: stats.versions },
            ]}
          />
          <SearchableSelect placeholder="Reviewer" allLabel="Any reviewer" value={reviewer} onChange={setReviewer} options={reviewers} />
          <Segmented
            label="Listings"
            value={liveness}
            onChange={setLiveness}
            options={[
              { value: "all", label: "All" },
              { value: "live", label: "Still live", count: stats.stillLive },
              { value: "gone", label: "No longer live", count: rows.length - stats.stillLive },
            ]}
          />
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">{filtered.length.toLocaleString()} verdicts</span>
        </section>

        {decisions.isLoading || dataLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading verdicts…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-14 text-center">
            <p className="font-semibold text-foreground">No verdicts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use Same / Not the same on{" "}
              <Link to="/cross-agency-dupes" className="text-primary-text underline">
                duplicates across agencies
              </Link>{" "}
              or in{" "}
              <Link to="/feed-compare#review" className="text-primary-text underline">
                Compare versions → To review
              </Link>
              .
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">No verdicts match these filters.</p>
        ) : (
          <ul className="space-y-3">
            {filtered.slice(0, shown).map((r) => (
              <DecisionCard key={r.pairKey} r={r} />
            ))}
          </ul>
        )}
        {filtered.length > shown && (
          <Button variant="outline" onClick={() => setShown((n) => n + PAGE * 2)}>
            Show more ({(filtered.length - shown).toLocaleString()} left)
          </Button>
        )}
      </main>
    </div>
  );
}

function Tile({ label, value, hint, icon }: { label: string; value: number; hint: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3">
      <span className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        {label}
        {icon}
      </span>
      <span className="font-heading text-2xl font-bold tabular-nums text-foreground">{value.toLocaleString()}</span>
      <span className="truncate text-[11px] text-muted-foreground">{hint}</span>
    </div>
  );
}

function DecisionCard({ r }: { r: Row }) {
  const same = r.verdict === "same";
  return (
    <li className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
            same ? "bg-success/10 text-success ring-success/25" : "bg-destructive/10 text-destructive-text ring-destructive/25",
          )}
        >
          {same ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <XCircle className="h-3 w-3" aria-hidden />}
          {same ? "Same property" : "Not the same"}
        </span>
        <span className="text-xs text-muted-foreground">
          {r.context === "agencies" ? "Across agencies" : "Within a feed (re-post)"} · {r.by ?? "unknown"} · {timeAgo(r.updatedAt)}
        </span>
        <span className="ml-auto">
          <VerdictButtons listings={r.items.map(({ id, live, snap }) => live ?? asListing(id, snap))} context={r.context} />
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {r.items.map(({ id, live, snap }) => {
          const title = live?.title ?? snap?.title ?? "Untitled";
          const image = live?.images?.[0] ?? snap?.image;
          const price = live?.price ?? snap?.price ?? 0;
          const body = (
            <>
              {image ? (
                <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-16 w-20 shrink-0 rounded-lg bg-muted object-cover" />
              ) : (
                <span className="h-16 w-20 shrink-0 rounded-lg bg-muted" />
              )}
              <span className="min-w-0 flex-1 text-xs">
                <span className="block truncate font-semibold text-foreground">{live?.sourceAgency ?? snap?.agency ?? "—"}</span>
                <span className="block truncate text-muted-foreground">{title}</span>
                <span className="block truncate tabular-nums">
                  {price > 0 ? `${live?.currency ?? snap?.currency ?? ""} ${formatPriceCompact(price)}` : "—"}
                  <span className="text-muted-foreground">
                    {" "}
                    · {(live?.beds ?? snap?.beds) ? `${live?.beds ?? snap?.beds} bd` : "studio/—"} ·{" "}
                    {(live?.area ?? snap?.area) ? `${Math.round(live?.area ?? snap?.area ?? 0).toLocaleString()} sqft` : "—"}
                  </span>
                </span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  {live?.reference ?? snap?.reference ?? id}
                  {(live?.permitNumber ?? snap?.permit) ? ` · permit ${live?.permitNumber ?? snap?.permit}` : ""}
                  {!live && " · no longer live"}
                </span>
              </span>
              {live && <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
            </>
          );
          const cls = "flex min-w-0 items-center gap-2.5 rounded-xl border border-border/80 bg-background/60 p-2";
          return live ? (
            <Link key={id} to={`/listing/${encodeURIComponent(id)}`} className={cn(cls, "transition-colors hover:border-primary/30")}>
              {body}
            </Link>
          ) : (
            <div key={id} className={cn(cls, "opacity-80")}>
              {body}
            </div>
          );
        })}
      </div>
    </li>
  );
}
