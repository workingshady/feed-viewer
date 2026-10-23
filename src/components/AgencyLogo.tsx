import { useState } from "react";
import { cn } from "@/lib/utils";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/**
 * Agency logo from the feed. Many agency sites block hotlinking, so a failed or missing image
 * falls back to the agency's initials instead of a broken-image box.
 */
export function AgencyLogo({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex items-center justify-center rounded-md bg-muted font-heading text-xs font-bold text-muted-foreground",
          className,
        )}
      >
        {initials(name)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("rounded-md object-contain", className)}
    />
  );
}
