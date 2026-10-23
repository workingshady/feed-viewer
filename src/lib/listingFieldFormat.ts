import type { Listing } from "@/lib/types";
import { formatPriceFull } from "@/lib/displayPrice";

/** Coerce feed/XML oddities (e.g. object nodes) to a displayable URL string. */
function coerceUrlLikeValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    if (typeof o.url === "string") return o.url.trim();
    if (typeof o.href === "string") return o.href.trim();
    if (typeof o.src === "string") return o.src.trim();
    if (typeof o["#text"] === "string") return String(o["#text"]).trim();
  }
  return "";
}

export function formatListingFieldValue(key: keyof Listing, listing: Listing): string {
  const v = listing[key];

  if (key === "view360" || key === "videoTourUrl" || key === "floorPlanUrl") {
    const s = coerceUrlLikeValue(v);
    return s.length ? s : "—";
  }

  if (key === "sourceAgency") {
    const s = typeof v === "string" ? v.trim() : "";
    return s.length ? s : "—";
  }

  if (key === "rawXml") {
    const s = typeof v === "string" ? v : "";
    if (!s.length) return "—";
    const head = s.length > 1200 ? `${s.slice(0, 1200)}…` : s;
    return `[${s.length} characters]\n${head}`;
  }

  if (key === "description") {
    if (v == null) return "—";
    const s = typeof v === "string" ? v : String(v);
    if (!s.trim()) return "—";
    if (s.length > 2500) return `${s.slice(0, 2500)}…\n[${s.length} characters total]`;
    return s;
  }

  if (v == null) return "—";
  if (typeof v === "string" && v.trim() === "") return "—";

  if (key === "downPaymentPrice" || key === "serviceCharge") {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n <= 0) return "—";
    const cur = listing.currency?.trim();
    return cur ? `${cur} ${formatPriceFull(n)}` : formatPriceFull(n);
  }
  if (key === "agent" && v && typeof v === "object" && !Array.isArray(v)) {
    const a = v as Listing["agent"];
    const parts = [a.name, a.phone, a.email, a.photo].filter(Boolean);
    return parts.length ? parts.join(" · ") : "—";
  }
  if (key === "images" && Array.isArray(v)) {
    if (!v.length) return "—";
    return `${v.length} image${v.length === 1 ? "" : "s"}`;
  }
  if (key === "amenities" && Array.isArray(v)) return v.length ? v.slice(0, 12).join(", ") + (v.length > 12 ? "…" : "") : "—";
  if (key === "latitude" || key === "longitude") return typeof v === "number" ? String(v) : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
