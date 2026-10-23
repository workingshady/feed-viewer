import type { Listing } from "@/lib/types";

/**
 * All mapped listing fields for `/compare`, including raw XML snippet (compact scroll in UI).
 */
export const LISTING_COMPARE_FIELD_GROUPS: { group: string; keys: (keyof Listing)[] }[] = [
  {
    group: "Identity & provenance",
    keys: ["id", "reference", "sourceAgency"],
  },
  {
    group: "Content",
    keys: ["title", "description"],
  },
  {
    group: "Pricing & terms",
    keys: [
      "price",
      "priceOnApplication",
      "currency",
      "paymentMethod",
      "downPaymentPrice",
      "serviceCharge",
      "cheques",
      "purpose",
    ],
  },
  {
    group: "Property",
    keys: [
      "propertyType",
      "beds",
      "baths",
      "area",
      "areaUnit",
      "plotSize",
      "furnished",
      "parking",
      "floor",
      "stories",
    ],
  },
  {
    group: "Location",
    keys: [
      "community",
      "subCommunity",
      "city",
      "address",
      "propertyName",
      "developer",
      "latitude",
      "longitude",
    ],
  },
  {
    group: "Media & links",
    keys: ["images", "amenities", "view360", "videoTourUrl", "floorPlanUrl"],
  },
  {
    group: "Agent",
    keys: ["agent"],
  },
  {
    group: "Status & compliance",
    keys: ["completionStatus", "buildYear", "lastUpdate", "permitNumber"],
  },
  {
    group: "Raw XML",
    keys: ["rawXml"],
  },
];
