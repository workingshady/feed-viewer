export type DatabaseSortKey =
  | "reference"
  | "listingId"
  | "title"
  | "purpose"
  | "propertyType"
  | "price"
  | "beds"
  | "baths"
  | "area"
  | "city"
  | "images"
  | "parking"
  | "amenities"
  | "permit"
  | "furnished"
  | "completion"
  | "developer"
  | "subCommunity"
  | "lastUpdate"
  | "importStatus"
  | "agentName"
  | "paymentMethod";

export type DatabaseSortDir = "asc" | "desc";

export const DATABASE_NUMERIC_SORT_DEFAULTS: DatabaseSortKey[] = [
  "price",
  "beds",
  "baths",
  "area",
  "images",
  "parking",
  "amenities",
];
