import { describe, expect, it } from "vitest";
import {
  canPlayInlineOnSite,
  extractVimeoId,
  extractYouTubeVideoId,
  isYouTubeVideoUrl,
  normalizeVideoTourPageUrl,
  vimeoEmbedSrc,
  youtubeNoCookieEmbedSrc,
} from "./videoTourUrl";

describe("videoTourUrl", () => {
  it("normalizes protocol-relative and bare hosts", () => {
    expect(normalizeVideoTourPageUrl("//www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(normalizeVideoTourPageUrl("youtu.be/dQw4w9WgXcQ")).toContain("youtu.be");
  });

  it("extracts id from watch, shorts, embed, youtu.be", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("detects YouTube", () => {
    expect(isYouTubeVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isYouTubeVideoUrl("https://example.com/v.mp4")).toBe(false);
  });

  it("builds embed src on the standard host", () => {
    expect(youtubeNoCookieEmbedSrc("dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1",
    );
  });

  it("extracts Vimeo id", () => {
    expect(extractVimeoId("https://vimeo.com/123456789")).toBe("123456789");
    expect(extractVimeoId("https://player.vimeo.com/video/123456789")).toBe("123456789");
  });

  it("builds Vimeo embed src", () => {
    expect(vimeoEmbedSrc("123456789")).toContain("player.vimeo.com/video/123456789");
  });

  it("canPlayInlineOnSite", () => {
    expect(canPlayInlineOnSite("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(canPlayInlineOnSite("https://vimeo.com/123456789")).toBe(true);
    expect(canPlayInlineOnSite("https://example.com/page")).toBe(false);
  });
});
