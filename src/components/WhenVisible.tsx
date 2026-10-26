import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Renders its children only once they are about to scroll into view. Heavy dashboard sections
 * below the fold then cost nothing at page load; once shown they stay mounted.
 */
export function WhenVisible({ children, minHeight = 320, margin = "600px" }: { children: ReactNode; minHeight?: number; margin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setShown(true), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, margin]);
  if (shown) return <>{children}</>;
  return <div ref={ref} style={{ minHeight }} aria-busy="true" className="animate-pulse rounded-xl border border-dashed bg-muted/20" />;
}
