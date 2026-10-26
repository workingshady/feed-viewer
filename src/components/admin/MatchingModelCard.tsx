import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BrainCircuit, CheckCircle2, Loader2, RotateCcw, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { activateModel, getActiveModel, listModels, switchToBuiltinModel } from "@/lib/matchingApi";
import { runTraining, useTrainerState } from "@/lib/matchTrainer";
import { MATCH_MODEL_KEY } from "@/hooks/useMatching";
import { timeAgo } from "@/components/sources/format";
import { useAppData } from "@/providers/useAppData";
import { useAuth } from "@/providers/AuthProvider";
import { hasRole } from "@/lib/roles";
import type { ContextMetrics } from "@/lib/matchTraining";
import { cn } from "@/lib/utils";

const pct = (n: number | null | undefined) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);

function Metric({ label, m, hint }: { label: string; m?: ContextMetrics; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-3 font-heading tabular-nums">
        <span className="text-xl font-bold">{pct(m?.precision)}</span>
        <span className="text-xs text-muted-foreground">precision</span>
        <span className="text-xl font-bold">{pct(m?.recall)}</span>
        <span className="text-xs text-muted-foreground">recall</span>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
      {m?.reviewAgreement != null && <div className="mt-1 text-[11px] text-muted-foreground">Agrees with {pct(m.reviewAgreement)} of {m.reviewLabels} reviewer verdicts</div>}
    </div>
  );
}

/**
 * The property-matching model: what is active and how accurate it measured, the review queue, the
 * training history with one-click rollback, and a manual retrain. Training also starts by itself
 * weekly or after enough new reviewer verdicts.
 */
export function MatchingModelCard() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { sources, listingsByAgency } = useAppData();
  const trainer = useTrainerState();
  const active = useQuery({ queryKey: MATCH_MODEL_KEY, queryFn: getActiveModel });
  const history = useQuery({ queryKey: ["match-models"], queryFn: listModels });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: MATCH_MODEL_KEY });
    void qc.invalidateQueries({ queryKey: ["match-models"] });
  };
  const activate = useMutation({ mutationFn: activateModel, onSuccess: () => (toast.success("Model activated"), refresh()) });
  const builtin = useMutation({ mutationFn: switchToBuiltinModel, onSuccess: () => (toast.success("Using the built-in model"), refresh()) });
  const isAdmin = hasRole(user?.role, "admin");
  const m = active.data?.model;
  const running = trainer.status === "running";

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <BrainCircuit className="h-4 w-4 text-primary-text" aria-hidden /> Property matching model
          </CardTitle>
          <CardDescription className="max-w-2xl">
            Decides when two listings are the same property (re-posts within a feed, the same unit across agencies). It retrains
            itself weekly or after {25} new reviewer verdicts, learning from permit-matched pairs and your team's verdicts, and a new
            model replaces the active one only if it measures at least as accurate.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          disabled={running}
          onClick={() => void runTraining({ sources, listingsByAgency, trigger: "manual", onSaved: refresh })}
        >
          {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}
          {running ? "Training…" : "Retrain now"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {running && (
          <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm" role="status" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {trainer.message}… keep this tab open; it runs in the background.
          </p>
        )}
        {trainer.status === "done" && (
          <p className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-sm", trainer.activated ? "bg-success/10" : "bg-warning/10")} role="status">
            {trainer.activated ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> : <ShieldAlert className="mt-0.5 h-4 w-4 text-warning" />}
            {trainer.activated ? "New model activated: " : "New model kept in history, not activated: "}
            {trainer.result.metrics.gate.reason}.
          </p>
        )}
        {trainer.status === "error" && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text" role="alert">
            Training failed: {trainer.error}
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <Metric
            label="Versions: re-posted under a new reference"
            m={m?.metrics.versions}
            hint={m ? "Measured on removed vs new listings with permits hidden." : "Built-in model: 95.1% precision, 47.1% recall on re-posts."}
          />
          <Metric
            label="Across agencies: needs-review queue"
            m={m?.metrics.agencies}
            hint="Same unit at another agency without a shared permit; a person confirms."
          />
          <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
            <div className="text-xs font-medium text-muted-foreground">Active model</div>
            <div className="mt-1 font-semibold">{m ? `Trained ${timeAgo(m.createdAt)} (${m.trigger})` : "Built-in (shipped with the app)"}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {active.data
                ? `${active.data.decisions.toLocaleString()} reviewer verdicts · ${active.data.decisionsSince} since the last training${active.data.lastTrainedAt ? ` (${timeAgo(active.data.lastTrainedAt)})` : ""}`
                : "…"}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              <Link to="/match-reviews" className="text-xs font-medium text-primary-text hover:underline">
                See all verdicts →
              </Link>
              <Link to="/cross-agency-dupes" className="text-xs font-medium text-primary-text hover:underline">
                Open the review queue →
              </Link>
            </div>
          </div>
        </div>

        {(history.data?.length ?? 0) > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trained</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead className="text-right">Versions precision / recall</TableHead>
                  <TableHead className="text-right">Reviewer agreement</TableHead>
                  <TableHead>Gate</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.data!.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {timeAgo(h.createdAt)}
                      {h.by ? ` · ${h.by}` : ""}
                    </TableCell>
                    <TableCell className="text-xs">{h.trigger}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {pct(h.metrics.versions?.precision)} / {pct(h.metrics.versions?.recall)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{pct(h.metrics.agencies?.reviewAgreement)}</TableCell>
                    <TableCell className="max-w-[18rem] truncate text-xs text-muted-foreground" title={h.metrics.gate?.reason}>
                      {h.metrics.gate?.passed ? "passed" : "held back"}
                    </TableCell>
                    <TableCell className="text-right">
                      {h.active ? (
                        <span className="text-xs font-semibold text-success">Active</span>
                      ) : isAdmin ? (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => activate.mutate(h.id)} disabled={activate.isPending}>
                          Activate
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {isAdmin && m && (
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => builtin.mutate()} disabled={builtin.isPending}>
            Switch back to the built-in model
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
