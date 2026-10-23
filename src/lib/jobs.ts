import { useSyncExternalStore } from "react";

/**
 * In-page background jobs (re-parse, bulk delete). They keep running while you navigate the app;
 * a floating panel shows progress. Closing or reloading the tab stops them — each step is saved
 * as it finishes, so a stopped job leaves completed steps in place.
 */

export type JobStep = { label: string; status: "pending" | "running" | "done" | "skipped" | "error"; detail?: string; progress?: number };
export type Job = {
  id: string;
  title: string;
  steps: JobStep[];
  status: "running" | "done" | "error";
  startedAt: number;
};

let jobs: Job[] = [];
const listeners = new Set<() => void>();
const emit = () => {
  jobs = [...jobs];
  listeners.forEach((l) => l());
};

export function useJobs(): Job[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => jobs,
  );
}

export const dismissJob = (id: string) => {
  jobs = jobs.filter((j) => j.id !== id);
  emit();
};

export const hasRunningJobs = () => jobs.some((j) => j.status === "running");

export type StepRunner<T> = (item: T, report: (patch: Partial<JobStep>) => void) => Promise<Partial<JobStep> | void>;

/** Runs `items` one after another as a background job; each item is one step. */
export function startJob<T>(title: string, items: T[], label: (item: T) => string, run: StepRunner<T>, onFinish?: () => void): string {
  const job: Job = {
    id: crypto.randomUUID(),
    title,
    steps: items.map((i) => ({ label: label(i), status: "pending" })),
    status: "running",
    startedAt: Date.now(),
  };
  jobs = [job, ...jobs];
  emit();

  const update = (index: number, patch: Partial<JobStep>) => {
    const current = jobs.find((j) => j.id === job.id);
    if (!current) return;
    current.steps = current.steps.map((s, i) => (i === index ? { ...s, ...patch } : s));
    emit();
  };

  void (async () => {
    for (let i = 0; i < items.length; i++) {
      update(i, { status: "running" });
      try {
        const result = await run(items[i], (patch) => update(i, patch));
        update(i, { status: "done", progress: undefined, ...(result ?? {}) });
      } catch (e) {
        update(i, { status: "error", progress: undefined, detail: e instanceof Error ? e.message : String(e) });
      }
    }
    const current = jobs.find((j) => j.id === job.id);
    if (current) {
      current.status = current.steps.some((s) => s.status === "error") ? "error" : "done";
      emit();
    }
    onFinish?.();
  })();
  return job.id;
}

// Warn before closing the tab while a job is running.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (hasRunningJobs()) e.preventDefault();
  });
}
