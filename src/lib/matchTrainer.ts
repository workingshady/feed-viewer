import { useSyncExternalStore } from "react";
import { claimTraining, getMatchDecisions, saveModel } from "@/lib/matchingApi";
import { getMatchWeights } from "@/lib/propertyMatch";
import { liveVersionOf, type SourceDTO } from "@/lib/sourcesApi";
import type { Listing } from "@/lib/types";
import { fetchVersionListings } from "@/lib/versionBlobs";
import type { TrainingResult } from "@/lib/matchTraining";
import type { TrainMessage, TrainRequest } from "@/workers/matchTraining.worker";

/**
 * Runs model training in the background (Web Worker) and posts the result to the server, which
 * activates it only when it passed the accuracy gate. One run at a time per browser; the server's
 * claim keeps two browsers from training at once.
 */

export type TrainerState =
  | { status: "idle" }
  | { status: "running"; message: string; startedAt: number; trigger: "auto" | "manual" }
  | { status: "done"; result: TrainingResult; activated: boolean; finishedAt: number }
  | { status: "error"; error: string; finishedAt: number };

let state: TrainerState = { status: "idle" };
const listeners = new Set<() => void>();
const set = (s: TrainerState) => {
  state = s;
  for (const l of listeners) l();
};

export function useTrainerState(): TrainerState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Version history used for learning re-posts: the largest sources, oldest retained vs live. */
const MAX_VERSION_SOURCES = 20;

/** Only the fields the matcher reads, so the worker gets a fraction of the memory. */
function compact(l: Listing): Listing {
  return {
    id: l.id,
    reference: l.reference,
    permitNumber: l.permitNumber,
    purpose: l.purpose,
    propertyType: l.propertyType,
    beds: l.beds,
    baths: l.baths,
    area: l.area,
    community: l.community,
    propertyName: l.propertyName,
    latitude: l.latitude,
    longitude: l.longitude,
    price: l.price,
    images: (l.images ?? []).slice(0, 12),
    title: l.title,
    description: (l.description ?? "").slice(0, 2500),
    agent: { name: "", photo: "", email: l.agent?.email ?? "", phone: l.agent?.phone ?? "", licenseNo: l.agent?.licenseNo },
    floor: l.floor,
    sourceAgency: l.sourceAgency,
  } as Listing;
}

/** Updates the running message; a no-op once the run has ended. */
function report(message: string) {
  const s: TrainerState = state;
  if (s.status === "running") set({ ...s, message });
}

/** Compacts listings in slices, yielding between them so the page stays responsive. */
async function compactAll(listings: Listing[]): Promise<Listing[]> {
  const out: Listing[] = [];
  for (let i = 0; i < listings.length; i += 2000) {
    for (const l of listings.slice(i, i + 2000)) out.push(compact(l));
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

export async function runTraining(opts: {
  sources: SourceDTO[];
  listingsByAgency: Map<string, Listing[]>;
  trigger: "auto" | "manual";
  onSaved?: () => void;
}): Promise<void> {
  if (state.status === "running") return;
  set({ status: "running", message: "Starting", startedAt: Date.now(), trigger: opts.trigger });
  try {
    await claimTraining(opts.trigger === "manual");
    report("Loading feed history");

    const withHistory = opts.sources
      .filter((s) => s.versions.filter((v) => v.status === "ready").length >= 2 && liveVersionOf(s))
      .sort((a, b) => (liveVersionOf(b)?.listingCount ?? 0) - (liveVersionOf(a)?.listingCount ?? 0))
      .slice(0, MAX_VERSION_SOURCES);
    const versions: TrainRequest["versions"] = [];
    for (const s of withHistory) {
      const ready = s.versions.filter((v) => v.status === "ready");
      const oldest = ready[ready.length - 1];
      const live = liveVersionOf(s)!;
      if (oldest.id === live.id) continue;
      const [a, b] = await Promise.all([fetchVersionListings(oldest.listingsBlobUrl), fetchVersionListings(live.listingsBlobUrl)]);
      versions.push({ old: await compactAll(a), new: await compactAll(b) });
    }

    const decisions = await getMatchDecisions();
    const req: TrainRequest = {
      versions,
      agencies: await Promise.all([...opts.listingsByAgency].map(async ([group, ls]) => ({ group, listings: await compactAll(ls) }))),
      labels: decisions.map((d) => ({ listingIds: d.listingIds, verdict: d.verdict, context: d.context })),
      current: getMatchWeights(),
    };

    const result = await new Promise<TrainingResult>((resolve, reject) => {
      const worker = new Worker(new URL("../workers/matchTraining.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<TrainMessage>) => {
        const m = e.data;
        if (m.type === "progress") report(m.message);
        else {
          worker.terminate();
          if (m.type === "done") resolve(m.result);
          else reject(new Error(m.error));
        }
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(new Error(e.message || "Training failed"));
      };
      worker.postMessage(req);
    });

    report("Saving");
    await saveModel({ weights: result.weights, metrics: result.metrics, trigger: opts.trigger, activate: result.metrics.gate.passed });
    set({ status: "done", result, activated: result.metrics.gate.passed, finishedAt: Date.now() });
    opts.onSaved?.();
  } catch (e) {
    set({ status: "error", error: e instanceof Error ? e.message : String(e), finishedAt: Date.now() });
  }
}
