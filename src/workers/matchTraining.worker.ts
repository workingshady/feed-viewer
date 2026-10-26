/// <reference lib="webworker" />
import { trainMatchModel, type TrainingInput, type TrainingResult } from "@/lib/matchTraining";

/** Trains the matching model off the main thread (minutes of CPU on large workspaces). */
export type TrainRequest = Omit<TrainingInput, "progress">;
export type TrainMessage = { type: "progress"; message: string } | { type: "done"; result: TrainingResult } | { type: "error"; error: string };

self.onmessage = (e: MessageEvent<TrainRequest>) => {
  const post = (m: TrainMessage) => (self as unknown as Worker).postMessage(m);
  try {
    const result = trainMatchModel({ ...e.data, progress: (message) => post({ type: "progress", message }) });
    post({ type: "done", result });
  } catch (err) {
    post({ type: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
