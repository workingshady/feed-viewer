import { priceOnApplicationIsAffirmative } from "@/lib/databaseFormat";
import type { Listing } from "@/lib/types";

export type ListingTag = { id: string; label: string };

export type ListingFlagDef = {
  id: string;
  label: string;
  /** Tailwind / badge tone */
  tone: "neutral" | "warn" | "bad" | "info" | "good";
};

function norm(s: string | undefined | null): string {
  return (s ?? "").trim();
}

/** Stable categorical tags for grouping and filters (not data-quality warnings). */
export function getListingTags(l: Listing): ListingTag[] {
  const tags: ListingTag[] = [];
  const purpose = l.purpose;
  if (purpose === "sale") tags.push({ id: "purpose-sale", label: "Sale" });
  else if (purpose === "rent") tags.push({ id: "purpose-rent", label: "Rent" });
  else tags.push({ id: "purpose-unknown", label: "Purpose ?" });

  const pt = norm(l.propertyType);
  if (pt) tags.push({ id: `type:${pt}`, label: pt });

  const furn = norm(l.furnished);
  if (furn) tags.push({ id: `furn:${furn}`, label: furn });

  const comp = norm(l.completionStatus);
  if (comp) tags.push({ id: `completion:${comp}`, label: comp });

  const beds = l.beds;
  if (Number.isFinite(beds) && beds > 0) {
    tags.push({ id: `beds-${beds}`, label: `${beds} bed${beds === 1 ? "" : "s"}` });
  }

  return tags;
}

export type RowContext = {
  isFavorite: boolean;
  inCompare: boolean;
};

/** Data-quality and workflow flags shown in the database table. */
export function getListingFlags(l: Listing, ctx: RowContext): ListingFlagDef[] {
  const flags: ListingFlagDef[] = [];

  if (!l.images?.length) flags.push({ id: "no_images", label: "No images", tone: "warn" });
  const lat = l.latitude;
  const lng = l.longitude;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    flags.push({ id: "no_geo", label: "No map", tone: "warn" });
  }

  const hasPoa = priceOnApplicationIsAffirmative(l.priceOnApplication);
  if (!l.price || l.price <= 0) {
    flags.push({ id: "no_price", label: hasPoa ? "POA" : "No price", tone: hasPoa ? "info" : "bad" });
  }

  const title = norm(l.title);
  if (!title || title.length < 2) flags.push({ id: "thin_title", label: "Weak title", tone: "bad" });

  if (!norm(l.agent?.name)) flags.push({ id: "no_agent", label: "No agent", tone: "warn" });

  if (ctx.isFavorite) flags.push({ id: "favorite", label: "Favorite", tone: "good" });
  if (ctx.inCompare) flags.push({ id: "compare", label: "Compare", tone: "info" });

  return flags;
}

/** Issue-style flags only (excludes favorite / compare). */
export function listingHasDataIssue(flags: ListingFlagDef[]): boolean {
  return flags.some((f) => f.tone === "bad" || f.tone === "warn");
}

export function flagToneClass(tone: ListingFlagDef["tone"]): string {
  switch (tone) {
    case "bad":
      return "border-destructive/40 bg-destructive/10 text-destructive-text";
    case "warn":
      return "border-warning/40 bg-warning/10 text-warning";
    case "info":
      return "border-primary/30 bg-primary/10 text-primary-text";
    case "good":
      return "border-green-500/35 bg-green-500/10 text-green-600 dark:text-green-400";
    default:
      return "border-border bg-muted/50 text-muted-foreground";
  }
}
