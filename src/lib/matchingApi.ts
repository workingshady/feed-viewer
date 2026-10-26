import { apiFetch, jsonBody } from "@/lib/api";
import type { MatchContext } from "@/lib/propertyMatch";
import type { ModelTables, TrainingResult } from "@/lib/matchTraining";

export type MatchVerdict = "same" | "different";

export type MatchDecisionDTO = {
  pairKey: string;
  listingIds: string[];
  verdict: MatchVerdict;
  context: MatchContext;
  by: string | null;
  updatedAt: string;
};

export type ActiveModelDTO = {
  model: { id: string; weights: ModelTables; metrics: TrainingResult["metrics"]; trigger: "auto" | "manual"; createdAt: string; activatedAt: string | null } | null;
  /** All decisions, and those made since the active model was trained. */
  decisions: number;
  decisionsSince: number;
  /** Set while another browser is training (claim younger than 30 min). */
  trainingSince: string | null;
};

export type ModelSummaryDTO = {
  id: string;
  metrics: TrainingResult["metrics"];
  active: boolean;
  trigger: "auto" | "manual";
  createdAt: string;
  activatedAt: string | null;
  by: string | null;
};

export const getMatchDecisions = () => apiFetch<{ decisions: MatchDecisionDTO[] }>("/api/matching/decisions").then((r) => r.decisions);

export const putMatchDecision = (body: { listingIds: string[]; verdict: MatchVerdict | null; context: MatchContext }) =>
  apiFetch<{ ok: true; pairKey: string }>("/api/matching/decisions", { method: "PUT", ...jsonBody(body) });

export const getActiveModel = () => apiFetch<ActiveModelDTO>("/api/matching/model");

export const listModels = () => apiFetch<{ models: ModelSummaryDTO[] }>("/api/matching/models").then((r) => r.models);

export const claimTraining = (force = false) => apiFetch<{ ok: true }>("/api/matching/train-claim", { method: "POST", ...jsonBody({ force }) });

export const saveModel = (body: { weights: ModelTables; metrics: TrainingResult["metrics"]; trigger: "auto" | "manual"; activate: boolean }) =>
  apiFetch<{ model: ModelSummaryDTO }>("/api/matching/models", { method: "POST", ...jsonBody(body) });

export const activateModel = (id: string) => apiFetch<{ ok: true }>(`/api/matching/models/${encodeURIComponent(id)}/activate`, { method: "POST" });

export const switchToBuiltinModel = () => apiFetch<{ ok: true }>("/api/matching/models/deactivate", { method: "POST" });
