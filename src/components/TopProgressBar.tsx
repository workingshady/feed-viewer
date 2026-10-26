import { useEffect, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

/**
 * Thin bar at the very top of the window while data is loading or saving. Appears only after
 * 150 ms so instant (cached) loads don't flicker.
 */
export function TopProgressBar() {
  const busy = useIsFetching() + useIsMutating() > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), 150);
    return () => window.clearTimeout(t);
  }, [busy]);

  return (
    <div
      role="progressbar"
      aria-label="Loading"
      aria-hidden={!visible}
      className={`pointer-events-none fixed inset-x-0 top-0 z-[200] h-0.5 overflow-hidden transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <div className="h-full w-1/3 animate-[topbar_1.1s_ease-in-out_infinite] bg-highlight-fill" />
    </div>
  );
}
