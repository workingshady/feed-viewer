import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";

type AgentPhotoProps = {
  src: string;
  alt: string;
  /** Large card / listing sidebar (aspect box, absolute fill). */
  variant: "hero";
  className?: string;
  loading?: "lazy" | "eager";
  /**
   * Default: landscape URLs use contain (logos), portrait/square use cover.
   * Use `"cover"` to always fill the frame (e.g. listing detail sidebar).
   */
  fit?: "default" | "cover" | "contain";
};

type AgentAvatarProps = {
  src: string;
  alt: string;
  /** Small circle in listing cards. */
  variant: "avatar";
  className?: string;
};

type AgentTileProps = {
  src: string;
  alt: string;
  /** Larger rounded square (e.g. home agent strip). */
  variant: "tile";
  className?: string;
};

function AgentTile({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [landscape, setLandscape] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    setLandscape(null);
  }, [src]);
  const onLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setLandscape(img.naturalWidth > img.naturalHeight);
  }, []);
  const tileFit =
    landscape === true ? "object-contain object-center" : "object-cover object-center";

  if (failed) {
    return (
      <div
        className={cn(
          "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-muted ring-2 ring-border",
          className,
        )}
        aria-hidden
      >
        <User className="h-7 w-7 text-muted-foreground/60" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onLoad={onLoad}
      onError={() => setFailed(true)}
      className={cn("h-16 w-16 shrink-0 rounded-2xl ring-2 ring-border", tileFit, className)}
    />
  );
}

/**
 * Agent feed photos are often landscape logos or banners. For w&gt;h we use contain (fit)
 * so the full image stays visible; portrait/square still use cover for a full frame.
 */
export function AgentPhoto(props: AgentPhotoProps | AgentAvatarProps | AgentTileProps) {
  const [landscape, setLandscape] = useState<boolean | null>(null);

  const onLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setLandscape(img.naturalWidth > img.naturalHeight);
  }, []);

  const heroFit =
    props.variant === "hero" && props.fit === "cover"
      ? "object-cover object-center"
      : props.variant === "hero" && props.fit === "contain"
        ? "object-contain object-center"
        : landscape === true
          ? "object-contain object-center"
          : "object-cover object-top";
  const avatarFit =
    landscape === true ? "object-contain object-center" : "object-cover object-center";

  if (props.variant === "avatar") {
    return (
      <img
        src={props.src}
        alt={props.alt}
        onLoad={onLoad}
        className={cn("w-5 h-5 rounded-full border border-border shrink-0", avatarFit, props.className)}
      />
    );
  }

  if (props.variant === "tile") {
    return <AgentTile src={props.src} alt={props.alt} className={props.className} />;
  }

  return (
    <img
      src={props.src}
      alt={props.alt}
      loading={props.loading}
      onLoad={onLoad}
      className={cn("absolute inset-0 h-full w-full", heroFit, props.className)}
    />
  );
}
