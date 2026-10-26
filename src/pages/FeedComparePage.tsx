import AppHeader from "@/components/AppHeader";
import { ChartCard, Columns, HBars, SERIES } from "@/components/charts/ChartKit";
import { ListingChangeRow } from "@/components/compare/ListingChangeRow";
import { CATEGORY_ICON } from "@/lib/changeDisplay";
import { EvidenceList, ScoreMeter } from "@/components/compare/MatchEvidence";
import { NoSourceState, versionLabel } from "@/components/SourcePicker";
import { listingHref } from "@/components/sources/BarList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVersionListings } from "@/hooks/useSources";
import { formatPriceCompact } from "@/lib/displayPrice";
import { CATEGORY_LABEL, type ChangeCategory } from "@/lib/listingChanges";
import { clusterSameProperty } from "@/lib/propertyMatch";
import { getMatchWeights } from "@/lib/propertyMatch";
import { changesCsv } from "@/lib/reports";
import { liveVersionOf, type SourceDTO, type VersionDTO } from "@/lib/sourcesApi";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { diffListings, type VersionDiff } from "@/lib/versionDiff";
import { categoryCounts, completenessByField, median, priceChangeBands, priceMoveRows } from "@/lib/versionInsights";
import { downloadText } from "@/components/sources/format";
import { useAppData } from "@/providers/DataProvider";
import { withSourceIds } from "@/lib/listingIds";
import { useDecide, useMatchDecisions } from "@/hooks/useMatching";
import { VerdictButtons } from "@/components/compare/VerdictButtons";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Copy,
  Download,
  Loader2,
  Minus,
  PencilLine,
  Plus,
  Repeat2,
  Search,
  SearchCheck,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

const TABS = ["changed", "price", "added", "removed", "relisted", "review", "data", "dupes"] as const;
type Tab = (typeof TABS)[number];
const tabFromHash = (): Tab => {
  const raw = typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, "");
  return (TABS as readonly string[]).includes(raw) ? (raw as Tab) : "changed";
};

function resolveVersion(source: SourceDTO, value: string | null): VersionDTO | null {
  if (!value || value === "live") return liveVersionOf(source);
  return source.versions.find((v) => v.id === value) ?? null;
}

const PAGE = 40;

function usePaged<T>(items: T[]) {
  const [n, setN] = useState(PAGE);
  useEffect(() => setN(PAGE), [items]);
  const more =
    items.length > n ? (
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setN((x) => x + PAGE * 2)}>
        Show more ({(items.length - n).toLocaleString()} left)
      </Button>
    ) : null;
  return { visible: items.slice(0, n), more };
}

/** Matches a listing against a free-text query on the fields people search by. */
const matchesQuery = (l: Listing, q: string) =>
  !q || `${l.reference} ${l.title} ${l.community} ${l.propertyName} ${l.agent?.name ?? ""}`.toLowerCase().includes(q);

export default function FeedComparePage() {
  const { sources, selectedSource, matchModelKey } = useAppData();
  const { overrides } = useMatchDecisions();
  const [params, setParams] = useSearchParams();
  const sourceId = params.get("source") ?? selectedSource?.id ?? sources.find((s) => s.versions.length > 1)?.id ?? sources[0]?.id ?? null;
  const source = sources.find((s) => s.id === sourceId) ?? null;
  const live = source ? liveVersionOf(source) : null;
  const versionB = source ? (params.get("b") ? resolveVersion(source, params.get("b")) : live ?? source.versions[0] ?? null) : null;
  const versionA = source
    ? params.get("a")
      ? resolveVersion(source, params.get("a"))
      : source.versions[source.versions.findIndex((v) => v.id === versionB?.id) + 1] ?? null
    : null;

  const setVersions = (a: string | undefined, b: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (sourceId) next.set("source", sourceId);
        if (a) next.set("a", a);
        if (b) next.set("b", b);
        return next;
      },
      { replace: true },
    );

  const qA = useVersionListings(versionA);
  const qB = useVersionListings(versionB);
  // Same ids the rest of the app uses ("<source id>:<reference>"), so verdicts and links line up.
  const listingsA = useMemo(() => (source && qA.data ? withSourceIds(source, qA.data) : null), [source, qA.data]);
  const listingsB = useMemo(() => (source && qB.data ? withSourceIds(source, qB.data) : null), [source, qB.data]);
  const diff: VersionDiff | null = useMemo(
    () => (listingsA && listingsB && versionA?.id !== versionB?.id ? diffListings(listingsA, listingsB, overrides) : null),
    // The model key re-runs matching when a newly trained model becomes active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listingsA, listingsB, versionA?.id, versionB?.id, overrides, matchModelKey],
  );

  const [tab, setTab] = useState<Tab>(tabFromHash);
  useEffect(() => {
    if (window.location.hash !== `#${tab}`) window.history.replaceState(null, "", `#${tab}`);
  }, [tab]);

  const busy = qA.isLoading || qB.isLoading || (!!listingsA && !!listingsB && !diff && versionA?.id !== versionB?.id);
  const aIsLive = !!versionA && versionA.id === live?.id;
  const bIsLive = !!versionB && versionB.id === live?.id;
  const hrefB = (l: Listing) => (bIsLive && source ? listingHref(source.id, l) : undefined);
  const hrefA = (l: Listing) => (aIsLive && source ? listingHref(source.id, l) : undefined);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="container flex-1 max-w-[min(100%,90rem)] space-y-6 px-4 py-8 sm:px-6">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
            <ArrowLeftRight className="h-6 w-6 text-primary-text" aria-hidden /> Compare versions
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            What changed between two uploads of one feed. Listings are matched by reference, and when a reference changed or is
            missing, by the property itself (permit, photos, description, size, layout and location). Formatting noise and values
            that were only filled in or dropped are kept apart from real changes.
          </p>
        </header>

        {!source ? (
          <NoSourceState what="feed compare" />
        ) : (
          <section aria-label="Choose versions" className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <Picker label="Source" value={source.id} onChange={(id) => setParams({ source: id }, { replace: true })} className="w-full sm:w-64">
              {sources.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </Picker>
            <Picker label="Before" value={versionA?.id ?? ""} onChange={(v) => setVersions(v, versionB?.id)} className="w-[calc(50%-2.25rem)] sm:w-56">
              {source.versions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {versionLabel(v, live)}
                </SelectItem>
              ))}
            </Picker>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              aria-label="Swap before and after"
              disabled={!versionA || !versionB}
              onClick={() => setVersions(versionB?.id, versionA?.id)}
            >
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
            <Picker label="After" value={versionB?.id ?? ""} onChange={(v) => setVersions(versionA?.id, v)} className="w-[calc(50%-2.25rem)] sm:w-56">
              {source.versions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {versionLabel(v, live)}
                </SelectItem>
              ))}
            </Picker>
            {diff && versionA && versionB && (
              <Button
                variant="outline"
                className="ml-auto h-10"
                onClick={() => downloadText(`${source.name}-v${versionA.number}-to-v${versionB.number}-changes.csv`, changesCsv(diff))}
              >
                <Download className="mr-1.5 h-4 w-4" /> Changes CSV
              </Button>
            )}
          </section>
        )}

        {source && (!versionA || versionA.id === versionB?.id) && (
          <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm" role="status">
            {source.versions.length < 2 ? "This source has one version. Upload another to see what changed." : "Pick two different versions."}
          </p>
        )}

        {busy && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground" role="status" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading and matching listings…
          </p>
        )}

        {diff && versionA && versionB && source && (
          <Results diff={diff} tab={tab} setTab={setTab} a={versionA} b={versionB} countA={listingsA!.length} countB={listingsB!.length} listingsB={listingsB!} hrefA={hrefA} hrefB={hrefB} />
        )}
      </main>
    </div>
  );
}

function Picker({ label, value, onChange, children, className }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10" aria-label={label}>
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </label>
  );
}

function Results({
  diff,
  tab,
  setTab,
  a,
  b,
  countA,
  countB,
  listingsB,
  hrefA,
  hrefB,
}: {
  diff: VersionDiff;
  tab: Tab;
  setTab: (t: Tab) => void;
  a: VersionDTO;
  b: VersionDTO;
  countA: number;
  countB: number;
  listingsB: Listing[];
  hrefA: (l: Listing) => string | undefined;
  hrefB: (l: Listing) => string | undefined;
}) {
  const prices = useMemo(() => priceMoveRows(diff), [diff]);
  const sides = useMemo(() => ({ before: `Before · v${a.number}`, after: `After · v${b.number}` }), [a.number, b.number]);
  const cats = useMemo(() => categoryCounts(diff), [diff]);
  const bands = useMemo(() => priceChangeBands(prices), [prices]);
  const gaps = useMemo(() => completenessByField(diff), [diff]);
  const drops = prices.filter((p) => p.pct < 0).length;
  const med = median(prices.map((p) => p.pct));
  const dupes = useMemo(
    () => (tab === "dupes" ? clusterSameProperty([{ group: "B", listings: listingsB }]) : null),
    [tab, listingsB],
  );

  const tiles: { id: Tab; label: string; count: number; hint: string; icon: LucideIcon }[] = [
    { id: "changed", label: "Changed", count: diff.changed.length, hint: "real changes only", icon: PencilLine },
    { id: "price", label: "Price changes", count: prices.length, hint: `${drops} down · ${prices.length - drops} up`, icon: ArrowDownRight },
    { id: "added", label: "New", count: diff.added.length, hint: `in v${b.number} only`, icon: Plus },
    { id: "removed", label: "Removed", count: diff.removed.length, hint: `in v${a.number} only`, icon: Minus },
    { id: "relisted", label: "Relisted", count: diff.relisted.length, hint: "same property, new ref", icon: Repeat2 },
    { id: "review", label: "To review", count: diff.possibleRelists.length, hint: "possible relists", icon: SearchCheck },
    { id: "data", label: "Data gaps", count: diff.completenessOnly.length, hint: "only filled / emptied", icon: Search },
    { id: "dupes", label: "Duplicates", count: diff.duplicates.length, hint: `inside v${b.number}`, icon: Copy },
  ];

  return (
    <>
      <section aria-label="Summary" className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {a.createdAt <= b.createdAt ? "Older" : "Newer"}{" "}
          <span className="font-mono font-semibold text-foreground">v{a.number}</span> ({new Date(a.createdAt).toLocaleDateString()},{" "}
          {countA.toLocaleString()} listings) → {a.createdAt <= b.createdAt ? "newer" : "older"}{" "}
          <span className="font-mono font-semibold text-foreground">v{b.number}</span> ({new Date(b.createdAt).toLocaleDateString()},{" "}
          {countB.toLocaleString()} listings) · {diff.unchangedCount.toLocaleString()} unchanged
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8" role="tablist" aria-label="Result views">
          {tiles.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === t.id ? "border-primary/40 bg-primary/[0.07] ring-1 ring-primary/20" : "border-border bg-card hover:border-primary/25",
              )}
            >
              <span className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                {t.label}
                <t.icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="font-heading text-2xl font-bold tabular-nums text-foreground">{t.count.toLocaleString()}</span>
              <span className="truncate text-[11px] text-muted-foreground">{t.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {(cats.length > 0 || prices.length > 0) && (
        <section className="grid gap-4 lg:grid-cols-2" aria-label="Insights">
          <ChartCard
            title="What changed"
            description="Listings with at least one real change in each area (a listing can count in several)."
            table={{ columns: ["Area", "Listings"], rows: cats.map((c) => [c.label, c.listings]) }}
          >
            <HBars data={cats.map((c) => ({ label: c.label, listings: c.listings }))} labelKey="label" series={[{ key: "listings", label: "Listings", color: SERIES[0] }]} />
          </ChartCard>
          <ChartCard
            title="Size of price changes"
            description={med != null ? `Median change ${med > 0 ? "+" : ""}${med.toFixed(1)}% across ${prices.length} listings.` : "No price changes."}
            table={{ columns: ["Change", "Listings"], rows: bands.map((x) => [x.label, x.count]) }}
          >
            <Columns data={bands} xKey="label" series={[{ key: "count", label: "Listings", color: SERIES[0] }]} height={200} />
          </ChartCard>
        </section>
      )}

      <section aria-live="polite">
        {tab === "changed" && <ChangedPanel diff={diff} hrefB={hrefB} labels={sides} />}
        {tab === "price" && <PricePanel rows={prices} hrefB={hrefB} />}
        {tab === "added" && <ListingPanel listings={diff.added} empty="Nothing new." href={hrefB} />}
        {tab === "removed" && <ListingPanel listings={diff.removed} empty="Nothing removed." href={hrefA} />}
        {tab === "relisted" && <RelistedPanel diff={diff} hrefB={hrefB} labels={sides} />}
        {tab === "review" && <ReviewPanel diff={diff} />}
        {tab === "data" && <DataPanel diff={diff} gaps={gaps} hrefB={hrefB} labels={sides} />}
        {tab === "dupes" && (
          <DupesPanel references={diff.duplicates} clusters={dupes?.clusters ?? null} possible={dupes?.possible ?? null} hrefB={hrefB} />
        )}
      </section>
    </>
  );
}

function SearchBox({ value, onChange, placeholder = "Search title, reference, community, agent…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-80">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 pl-9 text-sm" />
    </div>
  );
}

type Sides = { before: string; after: string };

function ChangedPanel({ diff, hrefB, labels }: { diff: VersionDiff; hrefB: (l: Listing) => string | undefined; labels: Sides }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<ChangeCategory | "all">("all");
  const [includeMinor, setIncludeMinor] = useState(true);
  const counts = useMemo(() => categoryCounts(diff), [diff]);
  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return diff.changed.filter(
      (c) =>
        matchesQuery(c.after, query) &&
        (cat === "all" || c.changes.material.some((m) => m.category === cat)) &&
        (includeMinor || c.changes.material.some((m) => !m.minor)),
    );
  }, [diff, q, cat, includeMinor]);
  const { visible, more } = usePaged(rows);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by area">
          {[{ category: "all" as const, label: "All", listings: diff.changed.length }, ...counts].map((c) => {
            const Icon = c.category === "all" ? null : CATEGORY_ICON[c.category];
            return (
              <button
                key={c.category}
                type="button"
                aria-pressed={cat === c.category}
                onClick={() => setCat(c.category)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium",
                  cat === c.category ? "border-primary/35 bg-primary/10 text-primary-text" : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
                {c.category === "all" ? "All" : CATEGORY_LABEL[c.category]}
                <span className="tabular-nums opacity-70">{c.listings}</span>
              </button>
            );
          })}
        </div>
        <label className="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={includeMinor} onChange={(e) => setIncludeMinor(e.target.checked)} className="accent-[hsl(var(--primary))]" />
          Include minor edits (wording, agent phone, cover photo)
        </label>
      </div>
      {rows.length === 0 ? (
        <Empty text="No changed listings match." />
      ) : (
        <ul className="space-y-2">
          {visible.map((c, i) => (
            <ListingChangeRow key={`${c.after.reference}-${i}`} before={c.before} after={c.after} changes={c.changes} href={hrefB(c.after)} defaultOpen={i === 0} labels={labels} />
          ))}
        </ul>
      )}
      {more}
    </div>
  );
}

function PricePanel({ rows, hrefB }: { rows: ReturnType<typeof priceMoveRows>; hrefB: (l: Listing) => string | undefined }) {
  const [dir, setDir] = useState<"all" | "down" | "up">("all");
  const sorted = useMemo(
    () => rows.filter((r) => dir === "all" || (dir === "down" ? r.pct < 0 : r.pct > 0)).sort((x, y) => Math.abs(y.pct) - Math.abs(x.pct)),
    [rows, dir],
  );
  const { visible, more } = usePaged(sorted);
  if (!rows.length) return <Empty text="No price changes." />;
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5" role="group" aria-label="Direction">
        {(["all", "down", "up"] as const).map((d) => (
          <Button key={d} size="sm" variant={dir === d ? "default" : "outline"} className="h-8 text-xs" onClick={() => setDir(d)}>
            {d === "all" ? "All" : d === "down" ? "Drops" : "Rises"}
          </Button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Listing</th>
              <th className="px-3 py-2 text-right">Before</th>
              <th className="px-3 py-2 text-right">After</th>
              <th className="px-3 py-2 text-right">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((r, i) => {
              const href = hrefB(r.listing);
              const title = r.listing.title || r.listing.reference;
              return (
                <tr key={`${r.listing.reference}-${i}`}>
                  <td className="max-w-[28rem] px-3 py-2">
                    <div className="truncate font-medium">{href ? <Link to={href} className="hover:underline">{title}</Link> : title}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      <span className="font-mono">{r.listing.reference}</span> · {r.listing.community}
                      {r.relisted && " · relisted"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{formatPriceCompact(r.before)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{formatPriceCompact(r.after)}</td>
                  <td className={cn("px-3 py-2 text-right font-mono tabular-nums", r.pct < 0 ? "text-success" : "text-destructive-text")}>
                    <span className="inline-flex items-center gap-0.5">
                      {r.pct < 0 ? <ArrowDownRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />}
                      {r.pct > 0 ? "+" : ""}
                      {r.pct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {more}
    </div>
  );
}

function ListingRow({ l, href, right }: { l: Listing; href?: string; right?: ReactNode }) {
  const body = (
    <>
      {l.images[0] ? (
        <img src={l.images[0]} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-14 shrink-0 rounded-md bg-muted object-cover" />
      ) : (
        <span className="h-10 w-14 shrink-0 rounded-md bg-muted" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{l.title || "Untitled"}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          <span className="font-mono">{l.reference || "no reference"}</span> · {l.propertyType} · {l.community}
        </span>
      </span>
      {right}
      <span className="shrink-0 font-mono text-xs tabular-nums">{l.price > 0 ? formatPriceCompact(l.price) : "—"}</span>
    </>
  );
  const cls = "flex items-center gap-3 px-3 py-2";
  return <li>{href ? <Link to={href} className={cn(cls, "hover:bg-muted/50")}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
}

function ListingPanel({ listings, empty, href }: { listings: Listing[]; empty: string; href: (l: Listing) => string | undefined }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => listings.filter((l) => matchesQuery(l, q.trim().toLowerCase())), [listings, q]);
  const { visible, more } = usePaged(rows);
  if (!listings.length) return <Empty text={empty} />;
  return (
    <div className="space-y-3">
      <SearchBox value={q} onChange={setQ} />
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {visible.map((l, i) => (
          <ListingRow key={`${l.reference}-${i}`} l={l} href={href(l)} />
        ))}
      </ul>
      {more}
    </div>
  );
}

function RelistedPanel({ diff, hrefB, labels }: { diff: VersionDiff; hrefB: (l: Listing) => string | undefined; labels: Sides }) {
  const { visible, more } = usePaged(diff.relisted);
  if (!diff.relisted.length) return <Empty text="No property came back under a new reference." />;
  return (
    <div className="space-y-3">
      <Note>
        The same property under a new reference number. These are matched on the property itself, so they are not counted as one
        removal plus one new listing. The evidence for each match is listed.
      </Note>
      <ul className="space-y-2">
        {visible.map((r, i) => (
          <ListingChangeRow
            key={`${r.after.reference}-${i}`}
            before={r.before}
            after={r.after}
            changes={r.changes}
            href={hrefB(r.after)}
            labels={labels}
            header={
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-mono text-muted-foreground line-through">{r.before.reference}</span>
                  <ArrowRight className="h-3 w-3" aria-hidden />
                  <span className="font-mono font-semibold">{r.after.reference}</span>
                  <ScoreMeter score={r.score} threshold={getMatchWeights().versions.match} />
                  <VerdictButtons listings={[r.before, r.after]} context="versions" />
                </div>
                <EvidenceList evidence={r.evidence} limit={4} compact />
              </div>
            }
          />
        ))}
      </ul>
      {more}
    </div>
  );
}

function ReviewPanel({ diff }: { diff: VersionDiff }) {
  const { visible, more } = usePaged(diff.possibleRelists);
  if (!diff.possibleRelists.length) return <Empty text="Nothing to review: every new and removed listing is clearly distinct." />;
  return (
    <div className="space-y-3">
      <Note>
        A removed listing and a new one that might be the same property, but the evidence is not strong enough to merge them
        automatically. They stay counted as removed and new until someone confirms them; confirmed pairs count as relisted for
        everyone, and every verdict trains the next model.
      </Note>
      <ul className="space-y-2">
        {visible.map((p, i) => (
          <li key={i} className="space-y-2 rounded-xl border border-border bg-card p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <MiniListing l={p.before} label="Removed" />
              <MiniListing l={p.after} label="New" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ScoreMeter score={p.score} threshold={getMatchWeights().versions.match} />
              <EvidenceList evidence={p.evidence} limit={5} compact />
              <VerdictButtons listings={[p.before, p.after]} context="versions" className="ml-auto" />
            </div>
          </li>
        ))}
      </ul>
      {more}
    </div>
  );
}

function MiniListing({ l, label }: { l: Listing; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/40 p-2">
      {l.images[0] ? <img src={l.images[0]} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-12 w-16 shrink-0 rounded-md object-cover" /> : <span className="h-12 w-16 shrink-0 rounded-md bg-muted" />}
      <div className="min-w-0 text-xs">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate font-medium text-foreground">{l.title || "Untitled"}</div>
        <div className="truncate text-muted-foreground">
          <span className="font-mono">{l.reference}</span> · {l.beds ? `${l.beds} bed` : "studio/—"} · {l.area ? `${Math.round(l.area).toLocaleString()} sqft` : "—"} ·{" "}
          {l.price ? formatPriceCompact(l.price) : "—"}
        </div>
      </div>
    </div>
  );
}

function DataPanel({ diff, gaps, hrefB, labels }: { diff: VersionDiff; gaps: ReturnType<typeof completenessByField>; hrefB: (l: Listing) => string | undefined; labels: Sides }) {
  const { visible, more } = usePaged(diff.completenessOnly);
  return (
    <div className="space-y-4">
      <Note>
        Values that appeared or disappeared without anything else changing — usually the feed or scraper filling a field one day
        and missing it the next. They are not counted as changes.
      </Note>
      {gaps.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Field</th>
                <th className="px-3 py-2 text-right">Filled in</th>
                <th className="px-3 py-2 text-right">Now empty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {gaps.map((g) => (
                <tr key={g.field}>
                  <td className="px-3 py-2">{g.field === "latitude" ? "Map pin" : g.field}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.filled.toLocaleString()}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", g.cleared > g.filled && "font-semibold text-warning")}>{g.cleared.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="space-y-2">
        {visible.map((c, i) => (
          <ListingChangeRow key={`${c.after.reference}-${i}`} before={c.before} after={c.after} changes={c.changes} href={hrefB(c.after)} labels={labels} />
        ))}
      </ul>
      {more}
    </div>
  );
}

function DupesPanel({
  references,
  clusters,
  possible,
  hrefB,
}: {
  references: string[];
  clusters: ReturnType<typeof clusterSameProperty>["clusters"] | null;
  possible: ReturnType<typeof clusterSameProperty>["possible"] | null;
  hrefB: (l: Listing) => string | undefined;
}) {
  if (!clusters) {
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Looking for duplicates…
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {references.length > 0 && (
        <Note>
          Reference used more than once: <span className="font-mono">{references.slice(0, 20).join(", ")}</span>
          {references.length > 20 && ` and ${references.length - 20} more`}.
        </Note>
      )}
      <h3 className="text-sm font-semibold">Same property listed more than once ({clusters.length})</h3>
      {clusters.length === 0 ? (
        <Empty text="No property appears twice." />
      ) : (
        <ul className="space-y-2">
          {clusters.slice(0, 200).map((c, i) => (
            <li key={i} className="space-y-2 rounded-xl border border-border bg-card p-3">
              <ul className="divide-y divide-border rounded-lg border border-border">
                {c.items.map((it, j) => (
                  <ListingRow key={j} l={it.listing} href={hrefB(it.listing)} />
                ))}
              </ul>
              <EvidenceList evidence={c.links[0]?.evidence ?? []} limit={5} compact />
            </li>
          ))}
        </ul>
      )}
      {possible && possible.length > 0 && <p className="text-xs text-muted-foreground">{possible.length} more pairs look similar but are not certain.</p>}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="max-w-3xl rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">{text}</p>;
}
