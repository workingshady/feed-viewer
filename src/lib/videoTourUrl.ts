/**
 * Video tour URLs from feeds — normalize for browser navigation and detect YouTube for free embeds.
 * YouTube watch pages must not be iframed; use /embed/ URLs.
 */

/** Ensure a full absolute URL safe for <a href> / window.open (avoids empty or broken hrefs). */
export function normalizeVideoTourPageUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) {
    try {
      new URL(s);
      return s;
    } catch {
      return "";
    }
  }
  if (s.startsWith("//")) {
    try {
      return new URL(`https:${s}`).href;
    } catch {
      return "";
    }
  }
  // Common feed quirks: path-only YouTube
  if (/^watch\?v=[\w-]{11}/i.test(s)) {
    return `https://www.youtube.com/${s}`;
  }
  if (/^youtu\.be\//i.test(s)) {
    return `https://${s}`;
  }
  try {
    return new URL(`https://${s}`).href;
  } catch {
    return "";
  }
}

/**
 * Extract YouTube video id from watch, embed, shorts, youtu.be, or bare 11-char id.
 */
export function extractYouTubeVideoId(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return s;

  const normalized = normalizeVideoTourPageUrl(s);
  if (!normalized) return null;

  try {
    const u = new URL(normalized);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return /^[\w-]{11}$/.test(id) ? id : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (u.pathname === "/watch" || u.pathname.startsWith("/watch")) {
        const v = u.searchParams.get("v");
        if (v && /^[\w-]{11}$/.test(v)) return v;
      }
      const embedMatch = u.pathname.match(/^\/embed\/([\w-]{11})/);
      if (embedMatch) return embedMatch[1];
      const shortsMatch = u.pathname.match(/^\/shorts\/([\w-]{11})/);
      if (shortsMatch) return shortsMatch[1];
      const liveMatch = u.pathname.match(/^\/live\/([\w-]{11})/);
      if (liveMatch) return liveMatch[1];
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * YouTube embed URL (allowed in iframes; watch URLs are not).
 *
 * Note: Some networks block `youtube-nocookie.com`, so we prefer the regular embed host for reliability.
 */
export function youtubeNoCookieEmbedSrc(videoId: string): string {
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1`;
}

export function isYouTubeVideoUrl(raw: string): boolean {
  return extractYouTubeVideoId(raw) != null;
}

/** Optional: open on YouTube site with correct watch URL */
export function youtubeWatchUrlFromRaw(raw: string): string | null {
  const id = extractYouTubeVideoId(raw);
  return id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : null;
}

/** Vimeo numeric video id for player.vimeo.com embed (free tier). */
export function extractVimeoId(raw: string): string | null {
  const normalized = normalizeVideoTourPageUrl(raw);
  if (!normalized) return null;
  try {
    const u = new URL(normalized);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "vimeo.com") {
      const m = u.pathname.match(/^\/(?:video\/)?(\d{6,})/);
      if (m) return m[1];
    }
    if (host === "player.vimeo.com") {
      const m = u.pathname.match(/^\/video\/(\d{6,})/);
      if (m) return m[1];
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function vimeoEmbedSrc(videoId: string): string {
  return `https://player.vimeo.com/video/${encodeURIComponent(videoId)}?title=0&byline=0`;
}

/** Direct file URLs playable with HTML5 video (feeds sometimes host .mp4). */
export function isDirectVideoFileUrl(raw: string): boolean {
  const n = normalizeVideoTourPageUrl(raw);
  if (!n) return false;
  try {
    const u = new URL(n);
    const path = u.pathname.toLowerCase();
    return /\.(mp4|webm|ogg)(\?.*)?$/i.test(path);
  } catch {
    return false;
  }
}

/** True when this app can embed playback on-site (iframe or HTML5 video). */
export function canPlayInlineOnSite(raw: string): boolean {
  return (
    extractYouTubeVideoId(raw) != null ||
    extractVimeoId(raw) != null ||
    isDirectVideoFileUrl(raw)
  );
}
