import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { initialsOf, tintFor } from "@/lib/avatar";

/**
 * Agency logo from the feed, shown as the source image with no added plate or frame.
 * Many agency sites block hotlinking, so a failed or missing image falls back to tinted initials.
 *
 * `className` sizes the box; the image is fitted inside without cropping.
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
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden", className)}>
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
