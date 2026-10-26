import AppHeader from "@/components/AppHeader";
import { AgencyLogo } from "@/components/AgencyLogo";
import { ChartCard, Columns, HBars, SERIES } from "@/components/charts/ChartKit";
import { EvidenceList, ScoreMeter } from "@/components/compare/MatchEvidence";
import { ChipChoice, SearchableSelect, Segmented, ToggleChip } from "@/components/listings/FilterControls";
import { useDecide } from "@/hooks/useMatching";
import { snapshotOf } from "@/lib/matchSnapshot";
import { hasRole } from "@/lib/roles";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prepareCompareTrayFromIds } from "@/lib/compareSelection";
import { formatPriceCompact } from "@/lib/displayPrice";
import type { Evidence } from "@/lib/propertyMatch";
import { toCsv } from "@/lib/reports";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { downloadText, timeAgo } from "@/components/sources/format";
import { readCached, writeCached } from "@/lib/resultCache";
import { useAppData } from "@/providers/DataProvider";
import type { SamePropertyResponse, WireCluster } from "@/workers/sameProperty.worker";
import { Building2, Download, GitCompare, HelpCircle, Layers, Loader2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { VerdictButtons } from "@/components/compare/VerdictButtons";
import { useMatchDecisions } from "@/hooks/useMatching";
import { getMatchWeights, pairKey } from "@/lib/propertyMatch";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

type Tier = "permit" | "possible";

type Group = {
  key: string;
  tier: Tier;
  score: number;
  items: { agency: string; listing: Listing }[];
  agencies: string[];
  evidence: Evidence[];
  /** Largest relative gap between the cheapest and dearest asking price for the same purpose. */
  priceSpread: number | null;
  purpose: string;
};

const TIER: Record<Tier, { label: string; hint: string; icon: typeof ShieldCheck; tone: string }> = {
  permit: { label: "Confirmed", hint: "same permit, or confirmed by a reviewer", icon: ShieldCheck, tone: "bg-success/10 text-success ring-success/25" },
  possible: { label: "Needs review", hint: "similar, no shared permit: a person decides", icon: HelpCircle, tone: "bg-warning/10 text-warning ring-warning/25" },
};

const PAGE = 24;

type SortKey = "confidence" | "least" | "borderline" | "spread" | "agencies" | "price" | "size";
/** open = everything except groups marked "not the same". */
type ReviewFilter = "open" | "unreviewed" | "same" | "different" | "all";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "confidence", label: "Most certain first" },
  { value: "least", label: "Lowest score first" },
  { value: "borderline", label: "Borderline first (closest to the cut-off)" },
  { value: "spread", label: "Biggest price gap" },
  { value: "agencies", label: "Most agencies" },
  { value: "price", label: "Highest price" },
  { value: "size", label: "Largest size" },
];

const has = (g: Group, signal: string, positive = true) => g.evidence.some((e) => e.signal === signal && (positive ? e.weight > 0 : e.weight < 0));

type EvidenceFilter = "size" | "price" | "building" | "pin" | "description" | "photos" | "conflicts" | "gap";
const EVIDENCE_FILTERS: { key: EvidenceFilter; label: string; test: (g: Group) => boolean }[] = [
  { key: "size", label: "Same size", test: (g) => g.evidence.some((e) => e.signal === "area" && e.weight > 1.5) },
  { key: "price", label: "Same price", test: (g) => g.evidence.some((e) => e.signal === "price" && e.label === "Same price") },
  { key: "building", label: "Same building", test: (g) => has(g, "building") },
  { key: "pin", label: "Same map pin", test: (g) => g.evidence.some((e) => e.signal === "location" && e.label === "Same map pin") },
  { key: "description", label: "Similar description", test: (g) => has(g, "description") },
  { key: "photos", label: "Photos match", test: (g) => has(g, "photos") },
  { key: "conflicts", label: "Has contradictions", test: (g) => g.evidence.some((e) => e.weight < 0) },
  { key: "gap", label: "Price gap over 5%", test: (g) => (g.priceSpread ?? 0) > 0.05 },
];

/** What is stored per (live versions, model): indexes into the agency lists, not listings. */
type CachedRun = { clusters: WireCluster[]; possible: WireCluster[]; compared: number; ms: number };

function spreadOf(listings: Listing[]): number | null {
  const prices = listings.map((l) => l.price).filter((p) => p > 0);
  if (prices.length < 2) return null;
  const lo = Math.min(...prices);
  return (Math.max(...prices) - lo) / lo;
}

function toGroups(clusters: WireCluster[], names: string[], lists: Listing[][], possible: boolean): Group[] {
  return clusters.map((c, i) => {
    const items = c.items.map(([g, l]) => ({ agency: names[g], listing: lists[g][l] }));
    const evidence = [...(c.links[0]?.evidence ?? [])] as Evidence[];
    // Confirmed = a shared permit or a reviewer said so.
    const permit = c.links.some((l) => l.evidence.some((e) => (e.signal === "permit" || e.signal === "review") && e.weight > 0));
    const purposes = [...new Set(items.map((x) => x.listing.purpose))];
    return {
      key: `${possible ? "p" : "m"}${i}`,
      tier: possible || !permit ? "possible" : "permit",
      score: c.confidence,
      items,
      agencies: [...new Set(items.map((x) => x.agency))],
      evidence,
      priceSpread: purposes.length === 1 ? spreadOf(items.map((x) => x.listing)) : null,
      purpose: purposes.length === 1 ? purposes[0] : "mixed",
    };
  });
}

export default function CrossAgencyDupesPage() {
  const { listingsByAgency, sources, isLoading, matchModelKey } = useAppData();
  const { overrides, byKey, isLoading: decisionsLoading } = useMatchDecisions();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [run, setRun] = useState(0);
  const [state, setState] = useState<{ groups: Group[]; compared: number; ms: number; savedAt: number } | { error: string } | null>(null);

  const names = useMemo(() => [...listingsByAgency.keys()].sort((a, b) => a.localeCompare(b)), [listingsByAgency]);
  const totalListings = useMemo(() => [...listingsByAgency.values()].reduce((n, l) => n + l.length, 0), [listingsByAgency]);
  const logo = useMemo(() => new Map(sources.map((s) => [s.name, s.agencyInfo?.logo || undefined])), [sources]);
  /**
   * Everything the result depends on: each source's live version and the active model. While none
   * of them change, the stored result is reused (also across reloads); verdicts are applied on top
   * at display time, so recording one never recomputes.
   */
  const cacheKey = useMemo(
    () =>
      `${matchModelKey}|${sources
        .filter((s) => listingsByAgency.has(s.name))
        .map((s) => `${s.name}=${s.activeVersionId}`)
        .sort()
        .join(",")}`,
    [sources, listingsByAgency, matchModelKey],
  );

  useEffect(() => {
    if (names.length < 2 || decisionsLoading) return;
    let cancelled = false;
    let worker: Worker | null = null;
    const lists = names.map((n) => listingsByAgency.get(n) ?? []);
    const show = (d: CachedRun, savedAt: number) =>
      setState({ groups: [...toGroups(d.clusters, names, lists, false), ...toGroups(d.possible, names, lists, true)], compared: d.compared, ms: d.ms, savedAt });
    (async () => {
      if (run === 0) {
        const hit = await readCached<CachedRun>("same-property", cacheKey);
        if (cancelled) return;
        if (hit) return show(hit.value, hit.savedAt);
      }
      setState(null);
      worker = new Worker(new URL("../workers/sameProperty.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<SamePropertyResponse>) => {
        const d = e.data;
        worker?.terminate();
        if (cancelled) return;
        if ("error" in d) return setState({ error: d.error });
        const value: CachedRun = { clusters: d.clusters, possible: d.possible, compared: d.compared, ms: d.ms };
        void writeCached("same-property", cacheKey, value);
        show(value, Date.now());
      };
      worker.onerror = (e) => {
        worker?.terminate();
        if (!cancelled) setState({ error: e.message || "Matching failed" });
      };
      worker.postMessage({ groups: names.map((n, i) => ({ group: n, listings: lists[i] })), weights: getMatchWeights(), overrides });
    })();
    return () => {
      cancelled = true;
      worker?.terminate();
    };
    // Verdicts (overrides) are deliberately not a dependency: they are applied at display time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, run, decisionsLoading]);

  const [tier, setTier] = useState<Tier | "all">("all");
  const [agency, setAgency] = useState("all");
  const [agency2, setAgency2] = useState("all");
  const [purpose, setPurpose] = useState("all");
  const [ptype, setPtype] = useState("all");
  const [beds, setBeds] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("confidence");
  const [review, setReview] = useState<ReviewFilter>("open");
  const [scoreMin, setScoreMin] = useState("");
  const [scoreMax, setScoreMax] = useState("");
  const [evidence, setEvidence] = useState<EvidenceFilter[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [focus, setFocus] = useState(0);
  const decisionOf = (g: Group) => byKey.get(pairKey(g.items.map((x) => x.listing.id)))?.verdict;
  const decide = useDecide();

  // A reviewer's "same" confirms a group immediately, without recomputing.
  const groups = useMemo(
    () =>
      (state && "groups" in state ? state.groups : []).map((g) =>
        g.tier === "possible" && byKey.get(pairKey(g.items.map((x) => x.listing.id)))?.verdict === "same" ? { ...g, tier: "permit" as const } : g,
      ),
    [state, byKey],
  );
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const lo = scoreMin === "" ? -Infinity : Number(scoreMin);
    const hi = scoreMax === "" ? Infinity : Number(scoreMax);
    const bedsNum = beds === "" ? null : parseInt(beds, 10);
    const tests = EVIDENCE_FILTERS.filter((f) => evidence.includes(f.key)).map((f) => f.test);
    const out = groups.filter((g) => {
      const v = byKey.get(pairKey(g.items.map((x) => x.listing.id)))?.verdict;
      if (review === "open" && v === "different") return false;
      if (review === "unreviewed" && v) return false;
      if (review === "same" && v !== "same") return false;
      if (review === "different" && v !== "different") return false;
      if (tier !== "all" && g.tier !== tier) return false;
      if (agency !== "all" && !g.agencies.includes(agency)) return false;
      if (agency2 !== "all" && !g.agencies.includes(agency2)) return false;
      if (purpose !== "all" && g.purpose !== purpose) return false;
      if (ptype !== "all" && (g.items[0].listing.propertyType || "Other") !== ptype) return false;
      if (bedsNum != null) {
        const b0 = g.items[0].listing.beds;
        if (beds.endsWith("+") ? !(b0 >= bedsNum) : b0 !== bedsNum) return false;
      }
      if (g.score < lo || g.score > hi) return false;
      for (const t of tests) if (!t(g)) return false;
      return (
        !query ||
        g.items.some((x) => `${x.listing.title} ${x.listing.reference} ${x.listing.community} ${x.listing.propertyName} ${x.listing.permitNumber}`.toLowerCase().includes(query))
      );
    });
    const order = { permit: 0, possible: 1 };
    const cut = getMatchWeights().agencies.possible;
    const price = (g: Group) => Math.max(...g.items.map((x) => x.listing.price || 0));
    const area = (g: Group) => Math.max(...g.items.map((x) => x.listing.area || 0));
    out.sort((a, b) => {
      switch (sort) {
        case "least":
          return a.score - b.score;
        case "borderline":
          return Math.abs(a.score - cut) - Math.abs(b.score - cut);
        case "spread":
          return (b.priceSpread ?? -1) - (a.priceSpread ?? -1);
        case "agencies":
          return b.agencies.length - a.agencies.length || b.score - a.score;
        case "price":
          return price(b) - price(a);
        case "size":
          return area(b) - area(a);
        default:
          return order[a.tier] - order[b.tier] || b.score - a.score;
      }
    });
    return out;
  }, [groups, tier, agency, agency2, purpose, ptype, beds, q, sort, byKey, review, scoreMin, scoreMax, evidence]);
  useEffect(() => {
    setShown(PAGE);
    setFocus(0);
  }, [tier, agency, agency2, purpose, ptype, beds, q, sort, review, scoreMin, scoreMax, evidence]);

  // Review progress over the queue (pairs without a shared permit).
  const progress = useMemo(() => {
    const queue = groups.filter((g) => g.tier === "possible" || byKey.get(pairKey(g.items.map((x) => x.listing.id)))?.verdict === "same");
    const reviewed = queue.filter((g) => byKey.has(pairKey(g.items.map((x) => x.listing.id)))).length;
    return { total: queue.length, reviewed };
  }, [groups, byKey]);

  const typeOptions = useMemo(() => {
    const c = new Map<string, number>();
    for (const g of groups) {
      const t = g.items[0].listing.propertyType || "Other";
      c.set(t, (c.get(t) ?? 0) + 1);
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, label: value, count }));
  }, [groups]);

  // Keyboard review: J/K move, S same, N not the same, C compare. Ignored while typing.
  const canDecide = hasRole(user?.role, "editor");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable))) return;
      const g = filtered[focus];
      const k = e.key.toLowerCase();
      if (k === "j") {
        setFocus((i) => Math.min(filtered.length - 1, i + 1));
        if (focus + 1 >= shown) setShown((n) => n + PAGE);
      } else if (k === "k") setFocus((i) => Math.max(0, i - 1));
      else if (g && canDecide && (k === "s" || k === "n")) {
        const ids = g.items.map((x) => x.listing.id);
        const verdict = k === "s" ? "same" : "different";
        const current = byKey.get(pairKey(ids))?.verdict;
        decide.mutate({ listingIds: ids, verdict: current === verdict ? null : verdict, context: "agencies", snapshot: g.items.slice(0, 12).map((x) => snapshotOf(x.listing)) });
        // Advance unless the decided group leaves the list on its own (unreviewed filter).
        if (review !== "unreviewed") setFocus((i) => Math.min(filtered.length - 1, i + 1));
      } else if (g && k === "c") {
        if (prepareCompareTrayFromIds(g.items.map((x) => x.listing.id))) navigate("/compare");
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, focus, shown, canDecide, byKey, decide, review, navigate]);
  useEffect(() => {
    document.getElementById(`group-${filtered[focus]?.key}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focus, filtered]);
  const activeFilters =
    (agency2 !== "all" ? 1 : 0) + (ptype !== "all" ? 1 : 0) + (beds ? 1 : 0) + (scoreMin ? 1 : 0) + (scoreMax ? 1 : 0) + evidence.length;
  const clearFilters = () => {
    setTier("all");
    setAgency("all");
    setAgency2("all");
    setPurpose("all");
    setPtype("all");
    setBeds("");
    setQ("");
    setReview("open");
    setScoreMin("");
    setScoreMax("");
    setEvidence([]);
  };

  const insights = useMemo(() => {
    const confirmed = groups.filter((g) => g.tier !== "possible");
    const shared = new Map<string, number>();
    const pairs = new Map<string, number>();
    for (const g of confirmed) {
      for (const a of new Set(g.items.map((x) => x.agency))) shared.set(a, (shared.get(a) ?? 0) + g.items.filter((x) => x.agency === a).length);
      const ag = [...g.agencies].sort();
      for (let i = 0; i < ag.length; i++) for (let j = i + 1; j < ag.length; j++) pairs.set(`${ag[i]} ↔ ${ag[j]}`, (pairs.get(`${ag[i]} ↔ ${ag[j]}`) ?? 0) + 1);
    }
    const share = [...shared.entries()]
      .map(([name, n]) => ({ name, pct: Math.round((n / Math.max(1, listingsByAgency.get(name)?.length ?? 1)) * 1000) / 10, n }))
      .sort((a, b) => b.pct - a.pct);
    const spreads = confirmed.map((g) => g.priceSpread).filter((x): x is number => x != null);
    const bands = [
      { label: "Same price", count: spreads.filter((s) => s < 0.005).length },
      { label: "< 3%", count: spreads.filter((s) => s >= 0.005 && s < 0.03).length },
      { label: "3–10%", count: spreads.filter((s) => s >= 0.03 && s < 0.1).length },
      { label: "10–25%", count: spreads.filter((s) => s >= 0.1 && s < 0.25).length },
      { label: "≥ 25%", count: spreads.filter((s) => s >= 0.25).length },
    ];
    return {
      share,
      pairs: [...pairs.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
      bands,
      listingsInvolved: confirmed.reduce((n, g) => n + g.items.length, 0),
      counts: { permit: groups.filter((g) => g.tier === "permit").length, possible: groups.filter((g) => g.tier === "possible").length },
    };
  }, [groups, listingsByAgency]);

  const exportCsv = () =>
    downloadText(
      "same-property-across-agencies.csv",
      toCsv(
        ["group", "tier", "review", "score", "agency", "reference", "permit", "title", "purpose", "price", "beds", "area", "community", "building", "evidence"],
        filtered.flatMap((g, i) =>
          g.items.map((x) => [
            i + 1,
            TIER[g.tier].label,
            decisionOf(g) ?? "",
            g.score,
            x.agency,
            x.listing.reference,
            x.listing.permitNumber,
            x.listing.title,
            x.listing.purpose,
            x.listing.price,
            x.listing.beds,
            Math.round(x.listing.area),
            x.listing.community,
            x.listing.propertyName,
            g.evidence.filter((e) => e.weight > 0).map((e) => e.label).join("; "),
          ]),
        ),
      ),
    );

  const agencyOptions = useMemo(() => {
    const c = new Map<string, number>();
    for (const g of groups) for (const a of g.agencies) c.set(a, (c.get(a) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, label: value, count }));
  }, [groups]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container max-w-[min(100%,90rem)] space-y-6 px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl space-y-1">
            <h1 className="flex items-center gap-2 font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
              <Layers className="h-6 w-6 text-primary-text" aria-hidden /> Same property, several agencies
            </h1>
            <p className="text-sm text-muted-foreground">
              One property advertised by more than one agency. A shared permit number confirms it. Without one, agencies re-shoot
              photos and rewrite copy, so identical units in the same tower look alike on every other field: those pairs are
              listed under Needs review, with the evidence. Verdicts are shared with the team, apply immediately, and train the
              next matching model.
            </p>
          </div>
          <div className="flex gap-2">
            {state && "savedAt" in state && (
              <span className="self-center text-xs text-muted-foreground" title="Reused until a feed version or the matching model changes">
                Computed {timeAgo(new Date(state.savedAt).toISOString())}
              </span>
            )}
            <Button variant="outline" onClick={() => setRun((r) => r + 1)} disabled={!state}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Re-run
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="mr-1.5 h-4 w-4" /> CSV
            </Button>
          </div>
        </header>

        {names.length < 2 && !isLoading ? (
          <p className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            Add at least two agencies on <Link to="/sources" className="text-primary-text underline">Sources</Link> to compare them.
          </p>
        ) : !state ? (
          <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Comparing {totalListings.toLocaleString()} listings across {names.length} agencies…
          </p>
        ) : "error" in state ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text" role="alert">
            Matching failed: {state.error}
          </p>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Summary">
              <Kpi label="Agencies compared" value={names.length} hint={`${totalListings.toLocaleString()} live listings`} />
              {(["permit", "possible"] as Tier[]).map((t) => (
                <Kpi key={t} label={TIER[t].label} value={insights.counts[t]} hint={TIER[t].hint} active={tier === t} onClick={() => setTier(tier === t ? "all" : t)} />
              ))}
              <Kpi label="Pairs checked" value={state.compared} hint={`in ${(state.ms / 1000).toFixed(1)} s, reused until a feed changes`} />
            </section>

            {insights.share.length > 0 && (
              <section className="grid gap-4 lg:grid-cols-3" aria-label="Insights">
                <ChartCard
                  title="Share of listings also on another agency"
                  description="Permit-confirmed shared listings, as a share of each agency's live listings. Click a bar to filter."
                  table={{ columns: ["Agency", "% shared", "Listings"], rows: insights.share.map((s) => [s.name, s.pct, s.n]) }}
                >
                  <HBars
                    data={insights.share.map((s) => ({ name: s.name, pct: s.pct }))}
                    labelKey="name"
                    series={[{ key: "pct", label: "% shared", color: SERIES[0] }]}
                    valueFormat={(n) => `${n}%`}
                    limit={10}
                    onSelect={(r) => setAgency(String(r.name))}
                  />
                </ChartCard>
                <ChartCard
                  title="Agencies that overlap most"
                  description="Properties both agencies advertise."
                  table={{ columns: ["Pair", "Properties"], rows: insights.pairs.map((p) => [p.label, p.count]) }}
                >
                  <HBars data={insights.pairs} labelKey="label" series={[{ key: "count", label: "Properties", color: SERIES[2] }]} limit={10} />
                </ChartCard>
                <ChartCard
                  title="Price gap between agencies"
                  description="Same property, same purpose: difference between the lowest and highest asking price."
                  table={{ columns: ["Gap", "Properties"], rows: insights.bands.map((b) => [b.label, b.count]) }}
                >
                  <Columns data={insights.bands} xKey="label" series={[{ key: "count", label: "Properties", color: SERIES[0] }]} height={200} />
                </ChartCard>
              </section>
            )}

            <section className="space-y-3 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)]" aria-label="Review queue controls">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[14rem] flex-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">
                      Reviewed {progress.reviewed.toLocaleString()} of {progress.total.toLocaleString()} needing review
                    </span>
                    <span className="tabular-nums text-muted-foreground">{progress.total ? Math.round((progress.reviewed / progress.total) * 100) : 0}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full rounded-full bg-success" style={{ width: `${progress.total ? (progress.reviewed / progress.total) * 100 : 0}%` }} />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTier("possible");
                    setReview("unreviewed");
                    setSort("borderline");
                  }}
                >
                  Start reviewing
                </Button>
                <span className="hidden text-[11px] text-muted-foreground lg:inline">
                  Keys: <kbd className="rounded border border-border px-1">J</kbd>/<kbd className="rounded border border-border px-1">K</kbd> move ·{" "}
                  <kbd className="rounded border border-border px-1">S</kbd> same · <kbd className="rounded border border-border px-1">N</kbd> not the same ·{" "}
                  <kbd className="rounded border border-border px-1">C</kbd> compare
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, reference, permit, building…" className="h-9 pl-9 text-sm" />
                </div>
                <Segmented
                  label="Confidence"
                  value={tier}
                  onChange={(v) => setTier(v as Tier | "all")}
                  options={[{ value: "all", label: "All" }, ...(["permit", "possible"] as Tier[]).map((t) => ({ value: t, label: TIER[t].label, count: insights.counts[t] }))]}
                />
                <Segmented
                  label="Review status"
                  value={review}
                  onChange={(v) => setReview(v as ReviewFilter)}
                  options={[
                    { value: "open", label: "Open" },
                    { value: "unreviewed", label: "Unreviewed" },
                    { value: "same", label: "Marked same" },
                    { value: "different", label: "Marked not same" },
                    { value: "all", label: "All" },
                  ]}
                />
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  Sort
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                    className="h-9 rounded-full border border-border bg-card px-3 text-xs text-foreground"
                    aria-label="Sort"
                  >
                    {SORTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Button size="sm" variant="outline" aria-expanded={showMore} className={cn("h-9 rounded-full", (showMore || activeFilters > 0) && "border-primary/35 bg-primary/10 text-primary-text")} onClick={() => setShowMore((v) => !v)}>
                  More filters{activeFilters ? ` (${activeFilters})` : ""}
                </Button>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">{filtered.length.toLocaleString()} properties</span>
              </div>

              {showMore && (
                <div className="grid gap-4 border-t border-border pt-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Agencies</div>
                    <SearchableSelect placeholder="Agency" allLabel="Any agency" icon={<Building2 className="h-3.5 w-3.5" aria-hidden />} value={agency} onChange={setAgency} options={agencyOptions} />
                    <SearchableSelect placeholder="With agency" allLabel="…with any other agency" value={agency2} onChange={setAgency2} options={agencyOptions} />
                  </div>
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Property</div>
                    <Segmented label="Purpose" value={purpose} onChange={setPurpose} options={[{ value: "all", label: "All" }, { value: "sale", label: "Sale" }, { value: "rent", label: "Rent" }]} />
                    <SearchableSelect placeholder="Type" allLabel="Any type" value={ptype} onChange={setPtype} options={typeOptions} />
                    <ChipChoice
                      label="Bedrooms"
                      value={beds}
                      onChange={setBeds}
                      options={[{ value: "0", label: "Studio" }, ...["1", "2", "3", "4"].map((n) => ({ value: n, label: n })), { value: "5+", label: "5+" }]}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Score</div>
                    <div className="flex items-center gap-2">
                      <Input inputMode="decimal" placeholder="Min" value={scoreMin} onChange={(e) => setScoreMin(e.target.value.replace(/[^\d.-]/g, ""))} className="h-9 w-24 text-sm" />
                      <span className="text-muted-foreground">–</span>
                      <Input inputMode="decimal" placeholder="Max" value={scoreMax} onChange={(e) => setScoreMax(e.target.value.replace(/[^\d.-]/g, ""))} className="h-9 w-24 text-sm" />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Review cut-off {getMatchWeights().agencies.possible}; a shared permit adds 12.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Evidence</div>
                    <div className="flex flex-wrap gap-1.5">
                      {EVIDENCE_FILTERS.map((f) => (
                        <ToggleChip
                          key={f.key}
                          on={evidence.includes(f.key)}
                          onToggle={() => setEvidence((p) => (p.includes(f.key) ? p.filter((x) => x !== f.key) : [...p, f.key]))}
                          count={groups.filter(f.test).length}
                        >
                          {f.label}
                        </ToggleChip>
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-2 xl:col-span-4">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearFilters}>
                      Clear all filters
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {filtered.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">No properties match these filters.</p>
            ) : (
              <ul className="space-y-3">
                {filtered.slice(0, shown).map((g, i) => (
                  <GroupCard
                    key={g.key}
                    focused={i === focus}
                    onFocus={() => setFocus(i)}
                    g={g}
                    logo={logo}
                    onCompare={() => {
                      if (prepareCompareTrayFromIds(g.items.map((x) => x.listing.id))) navigate("/compare");
                    }}
                  />
                ))}
              </ul>
            )}
            {filtered.length > shown && (
              <Button variant="outline" onClick={() => setShown((n) => n + PAGE * 2)}>
                Show more ({(filtered.length - shown).toLocaleString()} left)
              </Button>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/** What a reviewer checks first, in the order they check it. */
const COMPARE_ROWS: { label: string; value: (l: Listing) => string }[] = [
  { label: "Purpose", value: (l) => l.purpose },
  { label: "Price", value: (l) => (l.price > 0 ? `${l.currency} ${formatPriceCompact(l.price)}` : "POA") },
  { label: "Bedrooms", value: (l) => (l.beds ? String(l.beds) : "Studio") },
  { label: "Bathrooms", value: (l) => (l.baths ? String(l.baths) : "—") },
  { label: "Size", value: (l) => (l.area ? `${Math.round(l.area).toLocaleString()} sqft` : "—") },
  { label: "Building", value: (l) => l.propertyName || "—" },
  { label: "Floor", value: (l) => l.floor || "—" },
  { label: "Permit", value: (l) => l.permitNumber || "—" },
  { label: "Agent", value: (l) => l.agent?.name || "—" },
  { label: "Reference", value: (l) => l.reference || "—" },
];

/**
 * The group's listings side by side, field by field. Values that differ from the first listing are
 * highlighted; rows where every listing agrees are muted, so differences stand out at a glance.
 */
function FieldCompare({ items }: { items: Group["items"] }) {
  const cols = items.slice(0, 6);
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[30rem] text-xs">
        <thead className="bg-muted/50 text-left text-[11px] text-muted-foreground">
          <tr>
            <th className="w-24 px-3 py-1.5 font-semibold" />
            {cols.map((x) => (
              <th key={x.listing.id} className="max-w-[12rem] truncate px-3 py-1.5 font-semibold text-foreground">
                {x.agency}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {COMPARE_ROWS.map((r) => {
            const vals = cols.map((x) => r.value(x.listing));
            const norm = (v: string) => v.trim().toLowerCase();
            const same = vals.every((v) => norm(v) === norm(vals[0]));
            return (
              <tr key={r.label} className={cn(same && "text-muted-foreground")}>
                <td className="px-3 py-1.5 font-medium">{r.label}</td>
                {vals.map((v, i) => (
                  <td
                    key={i}
                    className={cn(
                      "max-w-[12rem] truncate px-3 py-1.5 tabular-nums",
                      !same && i > 0 && norm(v) !== norm(vals[0]) && "bg-warning/15 font-semibold text-foreground",
                      !same && i === 0 && "font-semibold text-foreground",
                    )}
                    title={v}
                  >
                    {v}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ label, value, hint, active, onClick }: { label: string; value: number; hint: string; active?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="font-heading text-2xl font-bold tabular-nums text-foreground">{value.toLocaleString()}</span>
      <span className="truncate text-[11px] text-muted-foreground">{hint}</span>
    </>
  );
  const cls = cn(
    "flex flex-col gap-1 rounded-xl border p-3 text-left",
    active ? "border-primary/40 bg-primary/[0.07] ring-1 ring-primary/20" : "border-border bg-card",
    onClick && "transition-colors hover:border-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  );
  return onClick ? (
    <button type="button" aria-pressed={active} onClick={onClick} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function GroupCard({
  g,
  logo,
  onCompare,
  focused,
  onFocus,
}: {
  g: Group;
  logo: Map<string, string | undefined>;
  onCompare: () => void;
  focused: boolean;
  onFocus: () => void;
}) {
  const T = TIER[g.tier];
  return (
    <li
      id={`group-${g.key}`}
      onClick={onFocus}
      className={cn(
        "scroll-mt-24 space-y-3 rounded-2xl border bg-card p-4 shadow-[var(--shadow-card)] transition-colors",
        focused ? "border-primary/50 ring-2 ring-primary/25" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", T.tone)}>
          <T.icon className="h-3 w-3" aria-hidden /> {T.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {g.agencies.length} agencies · {g.items[0].listing.propertyType} · {g.items[0].listing.community}
        </span>
        {g.priceSpread != null && g.priceSpread >= 0.005 && (
          <span className="text-xs text-muted-foreground">· price gap {(g.priceSpread * 100).toFixed(1)}%</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <ScoreMeter score={g.score} threshold={getMatchWeights().agencies.match} />
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onCompare}>
            <GitCompare className="mr-1 h-3.5 w-3.5" /> Compare
          </Button>
          <VerdictButtons listings={g.items.map((x) => x.listing)} context="agencies" />
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {g.items.slice(0, 8).map(({ agency, listing: l }) => (
          <Link
            key={l.id}
            to={`/listing/${encodeURIComponent(l.id)}`}
            className="group flex min-w-0 gap-2.5 rounded-xl border border-border/80 bg-background/60 p-2 transition-colors hover:border-primary/30"
          >
            {l.images[0] ? (
              <img src={l.images[0]} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-16 w-20 shrink-0 rounded-lg bg-muted object-cover" />
            ) : (
              <span className="h-16 w-20 shrink-0 rounded-lg bg-muted" />
            )}
            <span className="min-w-0 flex-1 text-xs">
              <span className="flex items-center gap-1.5">
                <AgencyLogo src={logo.get(agency)} name={agency} className="h-4 w-8 text-[7px]" />
                <span className="truncate font-semibold text-foreground">{agency}</span>
              </span>
              <span className="mt-0.5 block truncate text-muted-foreground group-hover:text-foreground">{l.title || "Untitled"}</span>
              <span className="mt-0.5 block truncate tabular-nums">
                <span className="font-semibold text-foreground">{l.price > 0 ? `${l.currency} ${formatPriceCompact(l.price)}` : "POA"}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {l.beds ? `${l.beds} bd` : "studio"} · {l.area ? `${Math.round(l.area).toLocaleString()} sqft` : "—"}
                </span>
              </span>
              <span className="block truncate font-mono text-[10px] text-muted-foreground">
                {l.reference}
                {l.permitNumber ? ` · permit ${l.permitNumber}` : ""}
              </span>
            </span>
          </Link>
        ))}
      </div>
      <FieldCompare items={g.items} />
      <EvidenceList evidence={g.evidence} limit={6} compact />
    </li>
  );
}
