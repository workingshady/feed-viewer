import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HealthDot, ScoreBadge, healthOf } from "@/components/sources/health";
import { pct, timeAgo } from "@/components/sources/format";
import { liveVersionOf, type SourceDTO } from "@/lib/sourcesApi";

type Col = "name" | "listings" | "score" | "photos" | "permit" | "coords" | "updated";

/** Side-by-side quality and size of every source's live version, sortable by any column. */
export function SourceComparisonTable({ sources }: { sources: SourceDTO[] }) {
  const [sort, setSort] = useState<{ col: Col; desc: boolean }>({ col: "listings", desc: true });
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 10;

  const rows = useMemo(() => {
    const data = sources.map((s) => {
      const live = liveVersionOf(s);
      const prev = live ? s.versions.find((v) => v.number < live.number) : undefined;
      return {
        s,
        health: healthOf(s),
        listings: live?.listingCount ?? 0,
        delta: live && prev ? live.listingCount - prev.listingCount : null,
        score: live?.stats?.score ?? null,
        photos: live?.stats?.checks.photos ?? null,
        permit: live?.stats?.checks.permit ?? null,
        coords: live?.stats?.checks.coords ?? null,
        updated: live?.createdAt ?? "",
      };
    });
    const val = (r: (typeof data)[number]) => (sort.col === "name" ? r.s.name.toLowerCase() : (r[sort.col] ?? -1));
    return data.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return sort.desc ? -c : c;
    });
  }, [sources, sort]);

  if (sources.length === 0) return null;

  const head = (col: Col, label: string, className?: string) => (
    <TableHead className={className} aria-sort={sort.col === col ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ col, desc: s.col === col ? !s.desc : col !== "name" }))}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {sort.col === col && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </TableHead>
  );

  const share = (v: number | null) => (v == null ? "—" : pct(v));
  const query = q.trim().toLowerCase();
  const filtered = query ? rows.filter((r) => r.s.name.toLowerCase().includes(query)) : rows;
  const visible = expanded || query ? filtered : filtered.slice(0, LIMIT);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base">Sources compared</CardTitle>
          <CardDescription>Live version of each source. Click a column to sort, a name to manage it.</CardDescription>
        </div>
        {rows.length > LIMIT && (
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a source…" className="h-8 pl-8 text-xs" aria-label="Find a source" />
          </div>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {head("name", "Source")}
              {head("listings", "Listings", "text-right")}
              {head("score", "Quality", "text-right")}
              {head("photos", "5+ photos", "hidden text-right md:table-cell")}
              {head("permit", "Permit", "hidden text-right md:table-cell")}
              {head("coords", "On map", "hidden text-right md:table-cell")}
              {head("updated", "Updated", "hidden text-right sm:table-cell")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow key={r.s.id}>
                <TableCell>
                  <Link to={`/sources?source=${r.s.id}`} className="inline-flex items-center gap-2 font-medium hover:underline">
                    <HealthDot health={r.health} />
                    {r.s.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {r.listings.toLocaleString()}
                  {r.delta ? (
                    <span className={`ml-1 text-xs ${r.delta > 0 ? "text-success" : "text-destructive-text"}`}>
                      {r.delta > 0 ? "+" : ""}
                      {r.delta}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  <ScoreBadge score={r.score} />
                </TableCell>
                <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">{share(r.photos)}</TableCell>
                <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">{share(r.permit)}</TableCell>
                <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">{share(r.coords)}</TableCell>
                <TableCell className="hidden text-right text-xs text-muted-foreground sm:table-cell">
                  {r.updated ? timeAgo(r.updated) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!query && rows.length > LIMIT && (
          <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setExpanded((v) => !v)}>
            {expanded ? `Show top ${LIMIT}` : `Show all ${rows.length} sources`}
            <ChevronDown className={`ml-1 h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </Button>
        )}
        {query && filtered.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No source matches "{q}".</p>}
      </CardContent>
    </Card>
  );
}
