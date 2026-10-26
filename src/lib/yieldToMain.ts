import { useEffect, useState, type DependencyList } from "react";

/**
 * Hands the main thread back to the browser (to paint and handle input) and resumes as soon as
 * possible. Long computations call this between slices so a page never freezes.
 */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof scheduler?.yield === "function") return scheduler.yield();
  if (typeof MessageChannel !== "undefined") {
    return new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        ch.port1.close();
        resolve();
      };
      ch.port2.postMessage(undefined);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Calls `fn` for every item, yielding to the browser every ~`sliceMs` so input stays responsive. */
export async function forEachSliced<T>(items: readonly T[], fn: (item: T, index: number) => void, sliceMs = 12): Promise<void> {
  let start = performance.now();
  for (let i = 0; i < items.length; i++) {
    fn(items[i], i);
    if ((i & 63) === 63 && performance.now() - start > sliceMs) {
      await yieldToMain();
      start = performance.now();
    }
  }
}

/**
 * Like useMemo for heavy work that runs in slices: returns null until the first result is ready,
 * keeps showing the previous result while recomputing, and ignores stale runs.
 */
export function useSlicedMemo<T>(compute: () => Promise<T>, deps: DependencyList): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let live = true;
    compute().then((v) => live && setValue(v));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass the inputs of `compute`
  }, deps);
  return value;
}
