import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, AlertTriangle, ChevronDown, ChevronRight, Download, Info, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartCard, HBars, SERIES } from "@/components/charts/ChartKit";
import { DIMENSION_INFO, type DataProfile, type Dimension, type FieldProfile, type Insight, type RuleResult, type Severity } from "@/lib/dataProfile";
import { buildXmlTree, type XmlPathStat, type XmlProfile, type XmlTreeNode } from "@/lib/xmlPathProfile";
import { cn } from "@/lib/utils";

/* ── shared bits ─────────────────────────────────────────────────────── */

const SEVERITY_STYLE: Record<Severity, { label: string; icon: typeof Info; cls: string }> = {
  error: { label: "Error", icon: AlertCircle, cls: "text-destructive bg-destructive/10 border-destructive/30" },
  warning: { label: "Warning", icon: AlertTriangle, cls: "text-warning bg-warning/10 border-warning/30" },
  info: { label: "Info", icon: Info, cls: "text-muted-foreground bg-muted border-border" },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLE[severity];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium", s.cls)}>
      <Icon className="h-3 w-3" aria-hidden />
      {s.label}
    </span>
  );
}

const scoreTone = (v: number) => (v >= 90 ? "text-success" : v >= 75 ? "text-warning" : "text-destructive");
const scoreBar = (v: number) => (v >= 90 ? "bg-success" : v >= 75 ? "bg-warning" : "bg-destructive");
const scoreWord = (v: number) => (v >= 95 ? "Excellent" : v >= 90 ? "Good" : v >= 75 ? "Fair" : "Needs work");
const pct = (n: number) => `${Math.round(n)}%`;
const num = (n: number) => n.toLocaleString();

function Bar({ value, className }: { value: number; className?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full", className ?? "bg-primary")} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function csv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(",")).join("\n");
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function ListingRef({ id, label, linkable }: { id: string; label: string; linkable: boolean }) {
  if (!linkable) return <span className="font-mono">{label}</span>;
  return (
    <Link to={`/listing/${encodeURIComponent(id)}`} className="font-mono text-primary underline-offset-2 hover:underline">
      {label}
    </Link>
  );
}

/* ── overview: scorecard + insights ─────────────────────────────────── */

export function QualityScorecard({ profile, xml }: { profile: DataProfile; xml: XmlProfile | null }) {
  const dims = Object.keys(DIMENSION_INFO) as Dimension[];
  const errors = profile.rules.filter((r) => r.severity === "error").reduce((n, r) => n + r.count, 0);
  const warnings = profile.rules.filter((r) => r.severity === "warning").reduce((n, r) => n + r.count, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Data quality score</CardTitle>
        <CardDescription className="text-xs">
          Every one of the {num(profile.n)} listings is checked{xml ? `, including all ${num(xml.paths.length)} raw XML paths` : ""}. Score = 40% completeness + 30% validity + 20% consistency + 10% uniqueness.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[200px_1fr]">
        <div className="flex flex-col items-center justify-center rounded-lg border bg-muted/30 p-4 text-center">
          <span className={cn("font-mono text-5xl font-semibold tabular-nums", scoreTone(profile.scores.overall))}>{Math.round(profile.scores.overall)}</span>
          <span className="text-xs text-muted-foreground">out of 100 · {scoreWord(profile.scores.overall)}</span>
          <div className="mt-3 grid w-full grid-cols-2 gap-2 text-left text-xs">
            <div>
              <div className="font-mono text-sm tabular-nums text-destructive">{num(profile.listingsWithErrors)}</div>
              <div className="text-muted-foreground">listings with errors</div>
            </div>
            <div>
              <div className="font-mono text-sm tabular-nums">{num(errors + warnings)}</div>
              <div className="text-muted-foreground">issues found</div>
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {dims.map((d) => (
            <div key={d} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{DIMENSION_INFO[d].label}</span>
                <span className={cn("font-mono text-sm tabular-nums", scoreTone(profile.scores[d]))}>{profile.scores[d].toFixed(1)}%</span>
              </div>
              <Bar value={profile.scores[d]} className={scoreBar(profile.scores[d])} />
              <p className="text-xs text-muted-foreground">{DIMENSION_INFO[d].description}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function KeyInsights({ insights, onGo }: { insights: Insight[]; onGo: (tab: NonNullable<Insight["go"]>, field?: string) => void }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Key findings</CardTitle>
        <CardDescription className="text-xs">What matters most in this data, worst first. Open a finding to see the affected listings.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {insights.map((i, n) => (
            <li key={n} className="flex items-start gap-3 py-2.5">
              <SeverityBadge severity={i.severity} />
              <span className="min-w-0 flex-1 text-sm">{i.text}</span>
              {i.go && (
                <Button variant="ghost" size="sm" className="h-7 shrink-0 text-xs" onClick={() => onGo(i.go!, i.field)}>
                  View <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ── field profiles ──────────────────────────────────────────────────── */

type FieldSort = "fill" | "valid" | "distinct" | "issues" | "name";

export function FieldProfilesPanel({ profile, linkable, focus }: { profile: DataProfile; linkable: boolean; focus?: string }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<FieldSort>("fill");
  const [scope, setScope] = useState<"all" | "required" | "problems">("all");
  const [open, setOpen] = useState<string | null>(focus ?? null);
  const issuesBy = useMemo(() => {
    const m = new Map<string, RuleResult[]>();
    for (const r of profile.rules) m.set(r.field, [...(m.get(r.field) ?? []), r]);
    return m;
  }, [profile]);
  const issueCount = (f: FieldProfile) => (issuesBy.get(f.key) ?? []).reduce((n, r) => n + r.count, 0);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = profile.fields.filter((f) => {
      if (s && !f.label.toLowerCase().includes(s) && !String(f.key).toLowerCase().includes(s)) return false;
      if (scope === "required") return f.required;
      if (scope === "problems") return f.fillPct < 90 || f.validPct < 99 || f.placeholders > 0 || issueCount(f) > 0;
      return true;
    });
    const by: Record<FieldSort, (a: FieldProfile, b: FieldProfile) => number> = {
      fill: (a, b) => a.fillPct - b.fillPct,
      valid: (a, b) => a.validPct - b.validPct,
      distinct: (a, b) => b.distinct - a.distinct,
      issues: (a, b) => issueCount(b) - issueCount(a),
      name: (a, b) => a.label.localeCompare(b.label),
    };
    return [...list].sort(by[sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, q, sort, scope, issuesBy]);

  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div>
          <CardTitle className="text-sm">Field profiles</CardTitle>
          <CardDescription className="text-xs">
            Each parsed field across all {num(profile.n)} listings: how often it is filled, whether values are valid, how varied they are, and which formats they use. Click a field for its full profile.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fields" className="h-9 pl-8 text-sm" />
          </div>
          <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
            <SelectTrigger className="h-9 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All fields</SelectItem>
              <SelectItem value="required">Required only</SelectItem>
              <SelectItem value="problems">With problems</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as FieldSort)}>
            <SelectTrigger className="h-9 w-[170px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fill">Least filled first</SelectItem>
              <SelectItem value="valid">Least valid first</SelectItem>
              <SelectItem value="issues">Most issues first</SelectItem>
              <SelectItem value="distinct">Most distinct values</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            onClick={() =>
              download(
                "field-profiles.csv",
                csv([
                  ["field", "required", "kind", "filled", "fill %", "valid %", "invalid", "distinct", "uniqueness", "placeholders", "formats", "main format", "issues"],
                  ...profile.fields.map((f) => [f.label, f.required ? "yes" : "no", f.kind, f.filled, f.fillPct.toFixed(1), f.validPct.toFixed(1), f.invalid, f.distinct, f.uniqueness.toFixed(2), f.placeholders, f.patterns.length, f.patterns[0]?.pattern ?? "", issueCount(f)]),
                ]),
              )
            }
          >
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2" />
                <th className="px-2 py-2 font-medium">Field</th>
                <th className="w-[170px] px-2 py-2 font-medium">Filled</th>
                <th className="w-[90px] px-2 py-2 text-right font-medium">Valid</th>
                <th className="w-[90px] px-2 py-2 text-right font-medium">Distinct</th>
                <th className="w-[80px] px-2 py-2 text-right font-medium">Formats</th>
                <th className="w-[80px] px-2 py-2 text-right font-medium">Issues</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => {
                const isOpen = open === f.key;
                const issues = issueCount(f);
                return (
                  <Fragment key={f.key}>
                    <tr className={cn("cursor-pointer border-b hover:bg-muted/30", isOpen && "bg-muted/30")} onClick={() => setOpen(isOpen ? null : f.key)}>
                      <td className="px-3 py-2 text-muted-foreground">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{f.label}</span>
                          {f.required && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Required</Badge>}
                          <span className="text-[11px] text-muted-foreground">{f.kind}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <Bar value={f.fillPct} className={f.required ? scoreBar(f.fillPct) : "bg-primary"} />
                          <span className="w-11 shrink-0 text-right font-mono text-xs tabular-nums">{pct(f.fillPct)}</span>
                        </div>
                      </td>
                      <td className={cn("px-2 py-2 text-right font-mono text-xs tabular-nums", f.validPct < 99 && "text-warning")}>{f.filled ? `${f.validPct.toFixed(1)}%` : "–"}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">{num(f.distinct)}</td>
                      <td className={cn("px-2 py-2 text-right font-mono text-xs tabular-nums", f.patterns.length > 3 && f.kind === "id" && "text-warning")}>{f.patterns.length || "–"}</td>
                      <td className={cn("px-2 py-2 text-right font-mono text-xs tabular-nums", issues > 0 && "text-destructive")}>{issues ? num(issues) : "–"}</td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b bg-muted/10">
                        <td colSpan={7} className="px-4 py-4">
                          <FieldDetail field={f} n={profile.n} rules={issuesBy.get(f.key) ?? []} linkable={linkable} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No fields match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className={cn("font-mono text-sm tabular-nums", tone)}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

const money = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : Math.abs(n) >= 1e4 ? `${Math.round(n / 1e3)}K` : n.toLocaleString(undefined, { maximumFractionDigits: 1 }));

/** Box-plot strip: p5–p95 whisker, p25–p75 box, median tick (on a log scale when values span orders of magnitude). */
function QuantileStrip({ s }: { s: NonNullable<FieldProfile["numeric"]> }) {
  const lo = s.p5;
  const hi = s.p95;
  const log = lo > 0 && hi / lo > 50;
  const t = (v: number) => {
    if (hi === lo) return 50;
    const x = log ? (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) : (v - lo) / (hi - lo);
    return Math.max(0, Math.min(100, x * 100));
  };
  return (
    <div className="space-y-1.5">
      <div className="relative h-8">
        <div className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-muted-foreground/40" />
        <div className="absolute top-1.5 h-5 rounded-sm border border-primary/60 bg-primary/15" style={{ left: `${t(s.p25)}%`, width: `${Math.max(1, t(s.p75) - t(s.p25))}%` }} />
        <div className="absolute top-0.5 h-7 w-0.5 rounded bg-primary" style={{ left: `${t(s.median)}%` }} title={`Median ${money(s.median)}`} />
      </div>
      <div className="flex justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
        <span>p5 {money(s.p5)}</span>
        <span>p25 {money(s.p25)}</span>
        <span className="text-foreground">median {money(s.median)}</span>
        <span>p75 {money(s.p75)}</span>
        <span>p95 {money(s.p95)}</span>
      </div>
      {log && <p className="text-[11px] text-muted-foreground">Log scale: values span more than 50×.</p>}
    </div>
  );
}

function FieldDetail({ field: f, n, rules, linkable }: { field: FieldProfile; n: number; rules: RuleResult[]; linkable: boolean }) {
  const label = (v: string) => (f.kind === "number" && Number.isFinite(Number(v)) ? money(Number(v)) : v.length > 48 ? `${v.slice(0, 46)}…` : v);
  const top = f.top.slice(0, 10).map((t) => ({ value: label(t.value), count: t.count }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="filled" value={`${num(f.filled)} / ${num(n)}`} />
        <Stat label="empty" value={num(n - f.filled)} tone={f.required && n - f.filled > 0 ? "text-destructive" : undefined} />
        <Stat label="invalid values" value={num(f.invalid)} tone={f.invalid ? "text-warning" : undefined} />
        <Stat label="placeholders (N/A, 0, -)" value={num(f.placeholders)} tone={f.placeholders ? "text-warning" : undefined} />
        <Stat label="distinct values" value={num(f.distinct)} />
        <Stat label="uniqueness" value={`${Math.round(f.uniqueness * 100)}%`} />
      </div>
      {f.numeric && (
        <div className="space-y-2 rounded-md border bg-card p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="font-medium">Distribution</span>
            <span className="text-muted-foreground">
              min {money(f.numeric.min)} · mean {money(f.numeric.mean)} · max {money(f.numeric.max)} ·{" "}
              <span className={f.numeric.outliers ? "text-warning" : undefined}>{num(f.numeric.outliers)} outliers</span> (outside Tukey fences)
            </span>
          </div>
          <QuantileStrip s={f.numeric} />
          {f.key === "price" && (
            <p className="text-[11px] text-muted-foreground">Sale and rent prices are on very different scales; set the purpose filter at the top to see each on its own.</p>
          )}
        </div>
      )}
      {f.length && !f.numeric && (
        <p className="text-xs text-muted-foreground">
          Text length: min {f.length.min} · median {f.length.median} · max {num(f.length.max)} characters.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {top.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium">Most common values</h4>
            <HBars data={top} labelKey="value" series={[{ key: "count", label: "Listings", color: SERIES[0] }]} limit={10} />
          </div>
        )}
        {f.patterns.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium">
              Value formats <span className="font-normal text-muted-foreground">(A = letter, 9 = digit)</span>
            </h4>
            <ul className="space-y-1.5 text-xs">
              {f.patterns.slice(0, 8).map((p, i) => (
                <li key={p.pattern} className="flex items-center gap-2">
                  <code className={cn("max-w-[45%] truncate rounded bg-muted px-1.5 py-0.5", i > 0 && "text-warning")}>{p.pattern}</code>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">e.g. {p.example}</span>
                  <span className="font-mono tabular-nums">{num(p.count)}</span>
                  <span className="w-10 text-right text-muted-foreground">{pct((p.count / Math.max(1, f.filled)) * 100)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {rules.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium">Issues in this field</h4>
          {rules.map((r) => (
            <RuleRow key={r.id} rule={r} n={n} linkable={linkable} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── issues ─────────────────────────────────────────────────────────── */

function RuleRow({ rule: r, n, linkable, defaultOpen = false }: { rule: RuleResult; n: number; linkable: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border bg-card">
      <button type="button" className="flex w-full items-start gap-3 px-3 py-2.5 text-left" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={r.severity} />
            <span className="text-sm font-medium">{r.title}</span>
            <span className="text-[11px] text-muted-foreground">{DIMENSION_INFO[r.dimension].label}</span>
          </div>
          <p className="text-xs text-muted-foreground">{r.hint}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-sm tabular-nums">{num(r.count)}</div>
          <div className="text-[11px] text-muted-foreground">{((r.count / Math.max(1, n)) * 100).toFixed(r.count / n < 0.01 ? 2 : 1)}%</div>
        </div>
      </button>
      {open && r.examples.length > 0 && (
        <div className="border-t px-3 py-2">
          <div className="mb-1 text-[11px] text-muted-foreground">
            Examples ({r.examples.length} of {num(r.count)})
          </div>
          <ul className="grid gap-1 text-xs sm:grid-cols-2">
            {r.examples.map((e, i) => (
              <li key={i} className="flex min-w-0 items-center gap-2">
                <ListingRef id={e.id} label={e.ref} linkable={linkable} />
                <span className="min-w-0 truncate text-muted-foreground" title={e.value}>
                  {e.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function IssuesPanel({ profile, linkable }: { profile: DataProfile; linkable: boolean }) {
  const [sev, setSev] = useState<Severity | "all">("all");
  const [dim, setDim] = useState<Dimension | "all">("all");
  const rules = profile.rules.filter((r) => r.count > 0 && (sev === "all" || r.severity === sev) && (dim === "all" || r.dimension === dim));
  const dims = Object.keys(DIMENSION_INFO) as Dimension[];
  const byDim = dims.map((d) => ({
    dimension: DIMENSION_INFO[d].label,
    error: profile.rules.filter((r) => r.dimension === d && r.severity === "error").reduce((s, r) => s + r.count, 0),
    warning: profile.rules.filter((r) => r.dimension === d && r.severity === "warning").reduce((s, r) => s + r.count, 0),
    info: profile.rules.filter((r) => r.dimension === d && r.severity === "info").reduce((s, r) => s + r.count, 0),
  }));
  const sevCount = (s: Severity) => profile.rules.filter((r) => r.severity === s && r.count > 0).length;
  const series = [
    { key: "error", label: "Errors", color: "hsl(var(--destructive))" },
    { key: "warning", label: "Warnings", color: "hsl(var(--warning))" },
    { key: "info", label: "Info", color: SERIES[0] },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Checks run on every listing</CardTitle>
            <CardDescription className="text-xs">
              {profile.rules.length} rules covering formats, ranges, duplicates and cross-field consistency. {num(profile.listingsWithErrors)} listings have at least one error.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2">
            {(["error", "warning", "info"] as Severity[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSev(sev === s ? "all" : s)}
                className={cn("rounded-md border p-3 text-left transition-colors hover:bg-muted/40", sev === s && "ring-2 ring-primary")}
              >
                <div className="font-mono text-xl tabular-nums">{sevCount(s)}</div>
                <SeverityBadge severity={s} />
                <div className="mt-1 text-[11px] text-muted-foreground">rules triggered</div>
              </button>
            ))}
          </CardContent>
        </Card>
        <ChartCard
          title="Issues by quality dimension"
          description="Listings flagged per dimension, split by severity. Click a bar to filter."
          legend={series}
          table={{ columns: ["Dimension", "Errors", "Warnings", "Info"], rows: byDim.map((d) => [d.dimension, d.error, d.warning, d.info]) }}
        >
          <HBars data={byDim} labelKey="dimension" series={series} onSelect={(row) => setDim(dims.find((d) => DIMENSION_INFO[d].label === row.dimension) ?? "all")} />
        </ChartCard>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sev} onValueChange={(v) => setSev(v as typeof sev)}>
          <SelectTrigger className="h-9 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="error">Errors</SelectItem>
            <SelectItem value="warning">Warnings</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dim} onValueChange={(v) => setDim(v as typeof dim)}>
          <SelectTrigger className="h-9 w-[170px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All dimensions</SelectItem>
            {dims.map((d) => (
              <SelectItem key={d} value={d}>
                {DIMENSION_INFO[d].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{rules.length} rules shown</span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-9 text-xs"
          onClick={() =>
            download(
              "data-issues.csv",
              csv([["rule", "severity", "dimension", "field", "listings", "% of listings", "how to fix", "example refs"], ...profile.rules.map((r) => [r.title, r.severity, r.dimension, r.field, r.count, ((r.count / Math.max(1, profile.n)) * 100).toFixed(2), r.hint, r.examples.map((e) => e.ref).join(" ")])]),
            )
          }
        >
          <Download className="mr-1 h-3.5 w-3.5" /> Issues CSV
        </Button>
      </div>
      <div className="space-y-2">
        {rules.map((r) => (
          <RuleRow key={r.id} rule={r} n={profile.n} linkable={linkable} />
        ))}
        {!rules.length && <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No issues for this filter. 🎉</p>}
      </div>
    </div>
  );
}

/* ── value formats (patterns tab) ───────────────────────────────────── */

export function ValueFormatsCard({ profile }: { profile: DataProfile }) {
  const rows = profile.fields
    .filter((f) => f.patterns.length > 1 && f.filled > 0 && (f.kind === "id" || f.kind === "number" || f.kind === "url"))
    .map((f) => ({ f, main: f.patterns[0], conform: (f.patterns[0].count / f.filled) * 100 }))
    .sort((a, b) => a.conform - b.conform);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Value formats</CardTitle>
        <CardDescription className="text-xs">
          Each value reduced to its shape (letters → A, digits → 9). Fields whose values follow one shape are consistent; a low share in the main format points to mixed sources or typos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map(({ f, main, conform }) => (
          <div key={f.key} className="space-y-1.5 rounded-md border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{f.label}</span>
              <span className={cn("font-mono text-xs tabular-nums", conform < 95 ? "text-warning" : "text-muted-foreground")}>
                {conform.toFixed(1)}% in main format · {f.patterns.length} formats
              </span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              {f.patterns.slice(0, 6).map((p, i) => (
                <div key={p.pattern} className="h-full border-r-2 border-card last:border-r-0" style={{ width: `${(p.count / f.filled) * 100}%`, background: SERIES[i % SERIES.length] }} title={`${p.pattern}: ${p.count}`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>
                main <code className="rounded bg-muted px-1">{main.pattern}</code> e.g. {main.example}
              </span>
              {f.patterns.slice(1, 4).map((p) => (
                <span key={p.pattern}>
                  <code className="rounded bg-muted px-1 text-warning">{p.pattern}</code> ×{num(p.count)} e.g. {p.example}
                </span>
              ))}
            </div>
          </div>
        ))}
        {!rows.length && <p className="text-sm text-muted-foreground">Every field uses a single format.</p>}
      </CardContent>
    </Card>
  );
}

/* ── raw XML: nested tree ───────────────────────────────────────────── */

const WARN_TONE = (w: string) => (/does not use|Mixed/.test(w) ? "text-warning border-warning/40 bg-warning/10" : "text-muted-foreground border-border bg-muted");

export function XmlSummary({ xml }: { xml: XmlProfile }) {
  const s = xml.paths;
  const leaf = s.filter((p) => !p.isAttribute);
  const tiles = [
    { label: "paths found (incl. attributes)", value: num(s.length) },
    { label: "deepest nesting level", value: String(Math.max(0, ...s.map((p) => p.depth))) },
    { label: "always empty", value: num(s.filter((p) => p.listingsWithValue === 0).length), tone: "text-muted-foreground" },
    { label: "have data the app ignores", value: num(xml.unusedWithData), tone: xml.unusedWithData ? "text-warning" : undefined },
    { label: "mixed value types", value: num(s.filter((p) => p.mixedTypes).length), tone: s.some((p) => p.mixedTypes) ? "text-warning" : undefined },
    { label: "repeating elements", value: num(leaf.filter((p) => p.maxRepeat > 1).length) },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border bg-card px-3 py-2.5">
          <div className={cn("font-mono text-lg font-semibold tabular-nums", t.tone)}>{t.value}</div>
          <div className="text-[11px] text-muted-foreground">{t.label}</div>
        </div>
      ))}
    </div>
  );
}

export function XmlTreePanel({ xml }: { xml: XmlProfile }) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "warnings" | "unused" | "empty">("all");
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const keep = (s: XmlPathStat) => {
    if (q && !s.path.toLowerCase().includes(q.toLowerCase())) return false;
    if (only === "warnings") return s.warnings.length > 0;
    if (only === "unused") return s.listingsWithValue > 0 && s.usedPct < 50;
    if (only === "empty") return s.listingsWithValue === 0;
    return true;
  };
  const tree = useMemo(() => buildXmlTree(xml.paths.filter(keep)), [xml, q, only]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows: { node: XmlTreeNode; level: number }[] = [];
  const walk = (nodes: XmlTreeNode[], level: number) => {
    for (const node of nodes) {
      rows.push({ node, level });
      if (node.children.length && !collapsed.has(node.full)) walk(node.children, level + 1);
    }
  };
  walk(tree, 0);
  const toggle = (full: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(full)) n.delete(full);
      else n.add(full);
      return n;
    });

  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div>
          <CardTitle className="text-sm">XML structure (every path, nested)</CardTitle>
          <CardDescription className="text-xs">
            All {num(xml.sampleSize)} listings' raw XML, element by element, including attributes (<code>@name</code>) and nested children. “Used” = share of the values that show up in a field the app reads.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter paths" className="h-9 pl-8 text-sm" />
          </div>
          <Select value={only} onValueChange={(v) => setOnly(v as typeof only)}>
            <SelectTrigger className="h-9 w-[190px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All paths</SelectItem>
              <SelectItem value="warnings">With warnings</SelectItem>
              <SelectItem value="unused">Data the app ignores</SelectItem>
              <SelectItem value="empty">Always empty</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            onClick={() =>
              download(
                "xml-paths.csv",
                csv([
                  ["path", "attribute", "depth", "listings with path", "listings with value", "fill %", "filled when present %", "type", "mixed types", "distinct", "max repeat", "used by app %", "warnings", "examples"],
                  ...xml.paths.map((p) => [p.path, p.isAttribute ? "yes" : "no", p.depth, p.listingsWithPath, p.listingsWithValue, p.fillPct.toFixed(1), p.filledWhenPresentPct.toFixed(1), p.type, p.mixedTypes ? "yes" : "no", `${p.distinct}${p.distinctCapped ? "+" : ""}`, p.maxRepeat, p.usedPct.toFixed(0), p.warnings.join("; "), p.examples.join(" | ")]),
                ]),
              )
            }
          >
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Path</th>
                <th className="w-[160px] px-2 py-2 font-medium">Filled</th>
                <th className="w-[80px] px-2 py-2 font-medium">Type</th>
                <th className="w-[80px] px-2 py-2 text-right font-medium">Distinct</th>
                <th className="w-[70px] px-2 py-2 text-right font-medium">Used</th>
                <th className="px-2 py-2 font-medium">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node, level }) => {
                const s = node.stat;
                const isOpen = openPath === node.full;
                const group = node.children.length > 0;
                return (
                  <Fragment key={node.full}>
                    <tr
                      className={cn("border-b hover:bg-muted/30", (s || group) && "cursor-pointer", isOpen && "bg-muted/30")}
                      onClick={() => (s ? setOpenPath(isOpen ? null : node.full) : group && toggle(node.full))}
                    >
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1" style={{ paddingLeft: level * 16 }}>
                          {group ? (
                            <button
                              type="button"
                              className="text-muted-foreground"
                              aria-label={collapsed.has(node.full) ? "Expand" : "Collapse"}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(node.full);
                              }}
                            >
                              {collapsed.has(node.full) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          ) : (
                            <span className="w-3.5" />
                          )}
                          <code className={cn("text-xs", s?.isAttribute && "text-primary", !s && "font-semibold")}>{node.name}</code>
                          {group && <span className="text-[11px] text-muted-foreground">{node.descendants} inside</span>}
                          {s && s.maxRepeat > 1 && <span className="text-[11px] text-muted-foreground">×{s.maxRepeat}</span>}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        {s && (
                          <div className="flex items-center gap-2">
                            <Bar value={s.fillPct} className={s.listingsWithValue === 0 ? "bg-muted-foreground/30" : "bg-primary"} />
                            <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums">{pct(s.fillPct)}</span>
                          </div>
                        )}
                      </td>
                      <td className={cn("px-2 py-1.5 text-xs", s?.mixedTypes && "text-warning")}>{s && s.listingsWithValue ? s.type : ""}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{s && s.listingsWithValue ? `${num(s.distinct)}${s.distinctCapped ? "+" : ""}` : ""}</td>
                      <td className={cn("px-2 py-1.5 text-right font-mono text-xs tabular-nums", s && s.listingsWithValue > 0 && s.usedPct < 50 && "text-warning")}>{s && s.listingsWithValue ? pct(s.usedPct) : ""}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex flex-wrap gap-1">
                          {s?.warnings.map((w) => (
                            <span key={w} className={cn("rounded border px-1.5 py-0.5 text-[10px]", WARN_TONE(w))}>
                              {w}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                    {isOpen && s && (
                      <tr className="border-b bg-muted/10">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="grid gap-3 text-xs md:grid-cols-3">
                            <div className="space-y-1">
                              <div className="font-medium">Coverage</div>
                              <div className="text-muted-foreground">
                                In {num(s.listingsWithPath)} listings, filled in {num(s.listingsWithValue)} ({pct(s.filledWhenPresentPct)} of those that have it). Type {s.type} for {pct(s.typeShare * 100)} of values.
                              </div>
                              <code className="block break-all text-[11px] text-muted-foreground">{s.path}</code>
                            </div>
                            <div className="space-y-1">
                              <div className="font-medium">Examples</div>
                              <ul className="space-y-0.5 text-muted-foreground">
                                {s.examples.length ? s.examples.map((e, i) => <li key={i} className="truncate" title={e}>{e}</li>) : <li>No values</li>}
                              </ul>
                            </div>
                            <div className="space-y-1">
                              <div className="font-medium">Formats</div>
                              <ul className="space-y-0.5">
                                {s.topPatterns.map((p) => (
                                  <li key={p.pattern} className="flex justify-between gap-2">
                                    <code className="truncate rounded bg-muted px-1">{p.pattern}</code>
                                    <span className="font-mono tabular-nums">{num(p.count)}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No paths match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/** Small progress note while the full scan runs. */
export function ProfilingNote({ progress, n }: { progress: number; n: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
      <span className="flex-1">Analysing all {n.toLocaleString()} listings…</span>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{Math.round(progress * 100)}%</span>
    </div>
  );
}
