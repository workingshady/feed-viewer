import { Link } from "react-router-dom";
import { AlertCircle, AlertTriangle, CheckCircle2, Download, Info, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { FeedCheckResult, Severity } from "@/lib/feedValidation";
import { feedCheckCsv } from "@/lib/reports";
import { downloadText } from "./format";

const SEVERITY: Record<Severity, { icon: typeof Info; className: string; label: string }> = {
  error: { icon: XCircle, className: "text-destructive-text", label: "Error" },
  warning: { icon: AlertTriangle, className: "text-warning", label: "Warning" },
  info: { icon: Info, className: "text-muted-foreground", label: "Info" },
};

const GATE = {
  pass: { icon: CheckCircle2, label: "Passes checks", className: "border-success/40 bg-success/10 text-success" },
  warn: { icon: AlertTriangle, label: "Passes with warnings", className: "border-warning/40 bg-warning/10 text-warning" },
  fail: { icon: AlertCircle, label: "Fails checks", className: "border-destructive/40 bg-destructive/10 text-destructive-text" },
} as const;

export function GateBadge({ gate, className }: { gate: FeedCheckResult["gate"]; className?: string }) {
  const g = GATE[gate];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", g.className, className)}>
      <g.icon className="h-3.5 w-3.5" aria-hidden /> {g.label}
    </span>
  );
}

/** Compact one-line-per-rule summary for the upload dialog. */
export function FeedChecksSummary({ result, limit = 4 }: { result: FeedCheckResult; limit?: number }) {
  const shown = result.issues.filter((i) => i.severity !== "info").slice(0, limit);
  return (
    <div className="space-y-1">
      <GateBadge gate={result.gate} />
      {shown.length > 0 && (
        <ul className="space-y-0.5 text-xs">
          {shown.map((i) => {
            const s = SEVERITY[i.severity];
            return (
              <li key={i.code} className="flex items-center gap-1.5">
                <s.icon className={cn("h-3.5 w-3.5 shrink-0", s.className)} aria-label={s.label} />
                <span className="truncate">{i.title}</span>
                <span className="ml-auto shrink-0 font-mono tabular-nums text-muted-foreground">{i.count.toLocaleString()}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Full grouped report: one row per rule with count, share, fix hint and example listings. */
export function FeedChecksCard({
  result,
  title,
  fileName,
  exampleHref,
}: {
  result: FeedCheckResult;
  title: string;
  fileName: string;
  /** Link for an example reference (omit when the listing isn't live). */
  exampleHref?: (reference: string) => string;
}) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of result.issues) counts[i.severity]++;
  const periods = Object.entries(result.rentPeriods);
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
        <div className="space-y-1">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            {title} <GateBadge gate={result.gate} />
          </CardTitle>
          <CardDescription className="text-xs">
            {counts.error} error types · {counts.warning} warning types · {counts.info} notes across{" "}
            {result.listingCount.toLocaleString()} listings
            {periods.length > 0 && <> · rent periods: {periods.map(([p, n]) => `${p} ${n.toLocaleString()}`).join(", ")}</>}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadText(fileName, feedCheckCsv(result))}>
          <Download className="mr-1.5 h-4 w-4" /> Check report (CSV)
        </Button>
      </CardHeader>
      <CardContent>
        {result.issues.length === 0 ? (
          <p className="text-sm text-success">Every listing passes every feed check.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border">
            {result.issues.map((i) => {
              const s = SEVERITY[i.severity];
              return (
                <li key={i.code} className="flex gap-3 px-3 py-2.5">
                  <s.icon className={cn("mt-0.5 h-4 w-4 shrink-0", s.className)} aria-label={s.label} />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{i.title}</span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {i.count.toLocaleString()} · {Math.round((i.count / Math.max(1, result.listingCount)) * 100)}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{i.hint}</p>
                    {i.examples.length > 0 && (
                      <p className="flex flex-wrap gap-x-2 text-xs">
                        <span className="text-muted-foreground">e.g.</span>
                        {i.examples.map((ref) =>
                          exampleHref ? (
                            <Link key={ref} to={exampleHref(ref)} className="font-mono hover:underline">
                              {ref}
                            </Link>
                          ) : (
                            <span key={ref} className="font-mono">
                              {ref}
                            </span>
                          ),
                        )}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {result.referenceShapes.length > 1 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Reference formats: {result.referenceShapes.map(([s, n]) => `${s} (${n.toLocaleString()})`).join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
