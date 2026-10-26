import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { initialsOf, tintFor } from "@/lib/avatar";

/**
 * Agency logo from the feed, on a white "logo plate" in both themes: brand wordmarks are drawn
 * for white backgrounds, and on a tinted or dark tile they lose contrast (dark text marks vanish).
 * Many agency sites block hotlinking, so a failed or missing image falls back to tinted initials.
 *
 * `className` sizes the plate; the image is fitted inside with padding so wide wordmarks stay legible.
 */
export function AgencyLogo({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg font-heading text-xs font-bold ring-1 ring-border",
          tintFor(name),
          className,
        )}
      >
        {initialsOf(name)}
      </span>
    );
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1.5 ring-1 ring-black/[0.06] dark:ring-white/10", className)}>
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="max-h-full max-w-full object-contain"
      />
    </span>
  );
}
