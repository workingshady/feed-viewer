import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getActiveModel, getMatchDecisions, putMatchDecision, type ListingSnapshot, type MatchDecisionDTO, type MatchVerdict } from "@/lib/matchingApi";
import { pairKey, setMatchWeights, type MatchContext, type MatchOverrides } from "@/lib/propertyMatch";
import { runTraining } from "@/lib/matchTrainer";
import { hasRole } from "@/lib/roles";
import { useAuth } from "@/providers/AuthProvider";
import type { SourceDTO } from "@/lib/sourcesApi";
import type { Listing } from "@/lib/types";

export const MATCH_MODEL_KEY = ["match-model"] as const;
export const MATCH_DECISIONS_KEY = ["match-decisions"] as const;

/**
 * Loads the active matching model and installs it for every matcher on the page. Returns a key that
 * changes when the model does, for memoised diffs to depend on.
 */
export function useMatchModel(enabled: boolean) {
  const q = useQuery({ queryKey: MATCH_MODEL_KEY, queryFn: getActiveModel, enabled, staleTime: 10 * 60_000, retry: 1 });
  const weights = q.data?.model?.weights ?? null;
  // Installed during render so children computing diffs in the same pass already use it.
  useMemo(() => setMatchWeights(weights), [weights]);
  return { ...q, modelKey: q.data?.model?.id ?? "builtin" };
}

export function useMatchDecisions() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: MATCH_DECISIONS_KEY, queryFn: getMatchDecisions, enabled: !!user, staleTime: 60_000 });
  const overrides = useMemo<MatchOverrides>(() => {
    const same = new Set<string>();
    const different = new Set<string>();
    for (const d of q.data ?? []) (d.verdict === "same" ? same : different).add(d.pairKey);
    return { same, different };
  }, [q.data]);
  const byKey = useMemo(() => new Map((q.data ?? []).map((d) => [d.pairKey, d])), [q.data]);
  return { ...q, overrides, byKey };
}

/** Records a reviewer verdict (null clears it). Optimistic, shared with the team on success. */
export function useDecide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: putMatchDecision,
    onMutate: async (body: { listingIds: string[]; verdict: MatchVerdict | null; context: MatchContext; snapshot?: ListingSnapshot[] }) => {
      await qc.cancelQueries({ queryKey: MATCH_DECISIONS_KEY });
      const prev = qc.getQueryData<MatchDecisionDTO[]>(MATCH_DECISIONS_KEY);
      const key = pairKey(body.listingIds);
      const rest = (prev ?? []).filter((d) => d.pairKey !== key);
      qc.setQueryData<MatchDecisionDTO[]>(
        MATCH_DECISIONS_KEY,
        body.verdict
          ? [{ pairKey: key, listingIds: body.listingIds, snapshot: body.snapshot, verdict: body.verdict, context: body.context, by: null, updatedAt: new Date().toISOString() }, ...rest]
          : rest,
      );
      return { prev };
    },
    onError: (_e, _b, ctx) => {
      qc.setQueryData(MATCH_DECISIONS_KEY, ctx?.prev);
      toast.error("Could not save the decision");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: MATCH_DECISIONS_KEY });
      void qc.invalidateQueries({ queryKey: MATCH_MODEL_KEY });
    },
  });
}

/** Retrain automatically once the model is a week old or the team has made enough new decisions. */
const RETRAIN_AFTER_DAYS = 7;
const RETRAIN_AFTER_DECISIONS = 25;
const ATTEMPT_KEY = "feedviewer.matchTraining.lastAttempt";
/** Don't compete with the page that just loaded. */
const START_DELAY_MS = 30_000;

/**
 * Starts background training for editors and admins when it is due. Nobody has to press anything;
 * the server activates the result only if it passed the accuracy gate.
 */
export function useAutoRetrain(sources: SourceDTO[], listingsByAgency: Map<string, Listing[]>, loading: boolean) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const model = useQuery({ queryKey: MATCH_MODEL_KEY, queryFn: getActiveModel, enabled: !!user, staleTime: 10 * 60_000 });
  const canTrain = hasRole(user?.role, "editor");
  useEffect(() => {
    if (!canTrain || loading || !model.data || model.data.trainingSince) return;
    const m = model.data;
    const history = sources.filter((s) => s.versions.length >= 2).length;
    const last = m.lastTrainedAt ? new Date(m.lastTrainedAt).getTime() : null;
    const ageDays = last ? (Date.now() - last) / 86_400_000 : Infinity;
    // Due when the last run (whatever its outcome) is a week old or enough new verdicts arrived;
    // the very first run waits until there is version history to learn from.
    const due = last ? ageDays >= RETRAIN_AFTER_DAYS || m.decisionsSince >= RETRAIN_AFTER_DECISIONS : history >= 3;
    if (!due) return;
    try {
      const last = Number(localStorage.getItem(ATTEMPT_KEY) ?? 0);
      if (Date.now() - last < 12 * 3_600_000) return;
    } catch {
      /* storage blocked: still fine to try once this session */
    }
    const start = () => {
      try {
        localStorage.setItem(ATTEMPT_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
      void runTraining({
        sources,
        listingsByAgency,
        trigger: "auto",
        onSaved: () => void qc.invalidateQueries({ queryKey: MATCH_MODEL_KEY }),
      });
    };
    // Start after the page has settled, when the browser is idle, so nobody notices it.
    let idle = 0;
    const t = window.setTimeout(() => {
      if ("requestIdleCallback" in window) idle = window.requestIdleCallback(start, { timeout: 60_000 });
      else start();
    }, START_DELAY_MS);
    return () => {
      window.clearTimeout(t);
      if (idle && "cancelIdleCallback" in window) window.cancelIdleCallback(idle);
    };
  }, [canTrain, loading, model.data, sources, listingsByAgency, qc]);
}
