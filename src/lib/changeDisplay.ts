import { Banknote, Building2, FileText, ImageIcon, MapPin, Ruler, Tag, UserRound, type LucideIcon } from "lucide-react";
import type { ChangeCategory } from "@/lib/listingChanges";
import { UI_FIELDS, type Listing } from "@/lib/types";

const FIELD_LABEL = Object.fromEntries(UI_FIELDS.map((f) => [f.key, f.label])) as Record<string, string>;

/** Display name for a listing field; the map pin is compared as one point under "latitude". */
export const fieldLabel = (k: keyof Listing) => (k === "latitude" ? "Map pin" : FIELD_LABEL[k] ?? String(k));

export const CATEGORY_ICON: Record<ChangeCategory, LucideIcon> = {
  price: Banknote,
  status: Tag,
  layout: Ruler,
  location: MapPin,
  media: ImageIcon,
  text: FileText,
  agent: UserRound,
  other: Building2,
};
