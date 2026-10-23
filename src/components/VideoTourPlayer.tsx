import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  extractVimeoId,
  extractYouTubeVideoId,
  isDirectVideoFileUrl,
  normalizeVideoTourPageUrl,
  vimeoEmbedSrc,
  youtubeNoCookieEmbedSrc,
  youtubeWatchUrlFromRaw,
} from "@/lib/videoTourUrl";

type Props = {
  /** Raw URL from listing.videoTourUrl */
  rawUrl: string;
  title?: string;
  className?: string;
  /** Secondary “open original” link under the player */
  showExternalLink?: boolean;
};

const iframeShell =
  "relative w-full overflow-hidden rounded-2xl border border-border/80 bg-black/90 shadow-lg ring-1 ring-black/20 aspect-video";

/**
 * In-site video player: YouTube (nocookie embed), Vimeo (player embed), or HTML5 for direct .mp4/.webm/.ogg.
 */
export function VideoTourPlayer({
  rawUrl,
  title = "Video tour",
  className,
  showExternalLink = true,
}: Props) {
  const pageUrl = normalizeVideoTourPageUrl(rawUrl);
  const ytId = extractYouTubeVideoId(rawUrl);
  const vimeoId = extractVimeoId(rawUrl);
  const direct = isDirectVideoFileUrl(rawUrl) ? pageUrl : "";

  if (!pageUrl && !ytId && !vimeoId && !direct) return null;

  const external = ((): string | undefined => {
    if (ytId) return youtubeWatchUrlFromRaw(rawUrl) ?? undefined;
    if (vimeoId) return `https://vimeo.com/${encodeURIComponent(vimeoId)}`;
    return pageUrl || undefined;
  })();

  if (ytId) {
    const src = youtubeNoCookieEmbedSrc(ytId);
    return (
      <div className={className}>
        <div className={iframeShell}>
          <iframe
            title={title}
            src={src}
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        {showExternalLink && external ? (
          <a
            href={external}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary-text hover:underline"
          >
            Open on YouTube <ExternalLink className="w-3 h-3" aria-hidden />
          </a>
        ) : null}
      </div>
    );
  }

  if (vimeoId) {
    const src = vimeoEmbedSrc(vimeoId);
    return (
      <div className={className}>
        <div className={iframeShell}>
          <iframe
            title={title}
            src={src}
            className="absolute inset-0 h-full w-full border-0"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        {showExternalLink && external ? (
          <a
            href={external}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary-text hover:underline"
          >
            Open on Vimeo <ExternalLink className="w-3 h-3" aria-hidden />
          </a>
        ) : null}
      </div>
    );
  }

  if (direct) {
    return (
      <div className={className}>
        <div className={cn(iframeShell, "bg-black")}>
          <video
            className="absolute inset-0 h-full w-full object-contain"
            controls
            playsInline
            preload="metadata"
            src={direct}
          >
            Your browser does not support embedded video.
          </video>
        </div>
        {showExternalLink && external ? (
          <a
            href={external}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary-text hover:underline"
          >
            Open video file <ExternalLink className="w-3 h-3" aria-hidden />
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className={className}>
      <a
        href={pageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-accent/40 px-4 py-3 text-sm font-semibold text-foreground hover:border-primary/40 hover:bg-accent/70 transition-colors"
      >
        {title}
        <ExternalLink className="w-4 h-4 shrink-0 text-primary-text" aria-hidden />
      </a>
    </div>
  );
}

/** @deprecated Use VideoTourPlayer — kept for existing imports */
export const VideoTourEmbed = VideoTourPlayer;
