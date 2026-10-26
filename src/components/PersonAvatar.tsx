import { cn } from "@/lib/utils";
import { useEffect, useState, type SyntheticEvent } from "react";
import { initialsOf, tintFor } from "@/lib/avatar";

type Props = {
  src?: string | null;
  name: string;
  /** Size + text size classes, e.g. "h-14 w-14 text-sm". */
  className?: string;
  shape?: "circle" | "rounded";
};

/**
 * Agent photo with the cases feeds actually send handled:
 * - portrait / square headshots fill the frame, anchored to the top so faces aren't cropped;
 * - landscape images are usually the agency logo used as a placeholder, so they are fitted on a
 *   white plate instead of being cropped into an unreadable strip;
 * - missing or hotlink-blocked images fall back to tinted initials, never a broken-image box.
 */
export function PersonAvatar({ src, name, className, shape = "circle" }: Props) {
  const [failed, setFailed] = useState(false);
  const [landscape, setLandscape] = useState(false);
  useEffect(() => {
    setFailed(false);
    setLandscape(false);
  }, [src]);

  const radius = shape === "circle" ? "rounded-full" : "rounded-2xl";
  const base = cn("relative shrink-0 overflow-hidden ring-1 ring-border", radius, className);

  if (!src?.trim() || failed) {
    return (
      <span aria-hidden className={cn(base, "flex items-center justify-center font-heading font-bold", tintFor(name))}>
        {initialsOf(name)}
      </span>
    );
  }

  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    // 1×1 tracking pixels and empty placeholders count as failures.
    if (img.naturalWidth < 8 || img.naturalHeight < 8) return setFailed(true);
    setLandscape(img.naturalWidth > img.naturalHeight * 1.15);
  };

  return (
    <span className={cn(base, landscape ? "bg-white" : "bg-muted")}>
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        draggable={false}
        onLoad={onLoad}
        onError={() => setFailed(true)}
        className={cn(
          "absolute inset-0 h-full w-full",
          landscape ? "object-contain p-[12%]" : "object-cover object-top",
        )}
      />
    </span>
  );
}
