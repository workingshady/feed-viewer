import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useVersionListings } from "@/hooks/useSources";
import { liveVersionOf, type SourceDTO } from "@/lib/sourcesApi";
import { QUALITY_CHECKS, listingQuality, qualityIssuesCsv, type QualityCheckKey } from "@/lib/versionStats";
import { ScoreBadge } from "./health";
import { listingHref } from "./BarList";
import { downloadText } from "./format";

const PAGE = 50;
const LABEL = Object.fromEntries(QUALITY_CHECKS.map((c) => [c.key, c.label])) as Record<QualityCheckKey, string>;

/** Listings in the live version that fail quality checks — filter by check, search, export. */
export function IssuesTab({ source }: { source: SourceDTO }) {
  const live = liveVersionOf(source);
  const { data: listings, isLoading } = useVersionListings(live);
  const [check, setCheck] = useState<QualityCheckKey | "any">("any");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo(
    () =>
      (listings ?? [])
        .map((l) => ({ l, ...listingQuality(l) }))
        .filter((r) => r.failed.length > 0)
        .sort((a, b) => a.score - b.score),
    [listings],
  );

  const counts = useMemo(() => {
    const c = Object.fromEntries(QUALITY_CHECKS.map((q) => [q.key, 0])) as Record<QualityCheckKey, number>;
    for (const r of rows) for (const k of r.failed) c[k]++;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (check === "any" || r.failed.includes(check)) &&
        (!q || `${r.l.reference} ${r.l.title} ${r.l.community} ${r.l.agent?.name ?? ""}`.toLowerCase().includes(q)),
    );
  }, [rows, check, query]);

  if (!live) return <p className="py-8 text-center text-sm text-muted-foreground">No live version yet.</p>;
  if (isLoading || !listings) {
    return (
      <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking listings…
      </p>
    );
  }
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-success">Every listing in v{live.number} passes all quality checks.</p>;
  }

  const chip = (key: QualityCheckKey | "any", label: string, n: number) => (
    <button
      key={key}
      type="button"
      aria-pressed={check === key}
      onClick={() => {
        setCheck(key);
        setShown(PAGE);
      }}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        check === key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
      )}
    >
      {label} <span className="font-mono tabular-nums opacity-80">{n.toLocaleString()}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by failing check">
        {chip("any", "Any issue", rows.length)}
        {QUALITY_CHECKS.filter((c) => counts[c.key] > 0).map((c) => chip(c.key, c.label, counts[c.key]))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Search reference, title, community or agent"
            className="pl-8"
            aria-label="Search listings with issues"
          />
        </div>
        <Button
          variant="outline"
          onClick={() =>
            downloadText(
              `${source.name}-v${live.number}-quality-issues${check === "any" ? "" : `-${check}`}.csv`,
              qualityIssuesCsv(filtered.map((r) => r.l)),
            )
          }
        >
          <Download className="mr-1.5 h-4 w-4" /> Export {filtered.length.toLocaleString()} as CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Score</TableHead>
              <TableHead>Listing</TableHead>
              <TableHead className="hidden md:table-cell">Missing</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, shown).map((r) => (
              <TableRow key={r.l.reference || r.l.id}>
                <TableCell>
                  <ScoreBadge score={r.score} />
                </TableCell>
                <TableCell className="max-w-0">
                  <Link to={listingHref(source.id, r.l)} className="block truncate font-medium hover:underline">
                    {r.l.title || "Untitled"}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.l.reference}
                    {r.l.community ? ` · ${r.l.community}` : ""}
                  </span>
                  <span className="mt-1 block text-xs text-warning md:hidden">{r.failed.map((k) => LABEL[k]).join(", ")}</span>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {r.failed.map((k) => (
                      <span key={k} className="rounded bg-warning/15 px-1.5 py-0.5 text-[11px] text-warning">
                        {LABEL[k]}
                      </span>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Showing {Math.min(shown, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}
        </span>
        {filtered.length > shown && (
          <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
            Show {Math.min(PAGE, filtered.length - shown)} more
          </Button>
        )}
      </div>
    </div>
  );
}
