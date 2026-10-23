export interface Listing {
  id: string;
  reference: string;
  title: string;
  description: string;
  price: number;
  /** Rent period when the feed states one (e.g. <price><monthly>); empty for sales or unknown. */
  rentPeriod?: "yearly" | "monthly" | "weekly" | "daily" | "";
  priceOnApplication: string;
  currency: string;
  paymentMethod: string;
  downPaymentPrice: number;
  serviceCharge: number;
  cheques: string;
  purpose: 'sale' | 'rent' | 'unknown';
  propertyType: string;
  beds: number;
  baths: number;
  area: number;
  areaUnit: string;
  plotSize: number;
  community: string;
  city: string;
  address: string;
  subCommunity: string;
  propertyName: string;
  developer: string;
  buildYear: string;
  floor: string;
  stories: string;
  latitude: number | null;
  longitude: number | null;
  images: string[];
  amenities: string[];
  view360: string;
  videoTourUrl: string;
  floorPlanUrl: string;
  agent: {
    name: string;
    phone: string;
    email: string;
    photo: string;
    /** Broker licence (e.g. RERA BRN), when the feed provides it. */
    licenseNo?: string;
    /** Agent identifier or profile URL from the feed. */
    id?: string;
    /** Free-text role / languages line. */
    info?: string;
  };
  /** Raw offering code from the feed (RS, RR, CS, CR) — purpose is the normalised form. */
  offeringType?: string;
  /** Raw property type code from the feed (AP, VH…) — propertyType is the readable name. */
  propertyTypeCode?: string;
  rawXml: string;
  furnished: string;
  parking: number;
  completionStatus: string;
  permitNumber: string;
  lastUpdate: string;
  /**
   * Name of the source this listing belongs to (set when live versions load).
   * Used to roll listings into the same agency buckets as classic imports.
   */
  sourceAgency?: string;
}

export interface FieldMapping {
  xmlPath: string;
  uiField: keyof Listing | '';
}

export interface MappingConfig {
  listingNodePath: string;
  mappings: FieldMapping[];
}

export type MappingPreset = {
  id: string;
  name: string;
  createdAt: string;
  config: MappingConfig;
};

export type XmlFlatValue = string | string[] | null;

export interface XmlFlatEntry {
  path: string;
  name: string;
  value: XmlFlatValue;
  attributes?: Record<string, string>;
}

export interface ImportResult {
  success: boolean;
  listings: Listing[];
  totalCount: number;
  warnings: string[];
  errors: string[];
  detectedNodes: string[];
  agencyInfo?: {
    name: string;
    logo: string;
    email: string;
    phone: string;
    website: string;
  };
}

export interface ParsedXmlNode {
  name: string;
  path: string;
  value: string | null;
  children: ParsedXmlNode[];
  attributes: Record<string, string>;
  count: number;
}

export const UI_FIELDS: { key: keyof Listing; label: string; required: boolean }[] = [
  { key: 'id', label: 'ID', required: false },
  { key: 'reference', label: 'Reference', required: true },
  { key: 'title', label: 'Title', required: true },
  { key: 'description', label: 'Description', required: false },
  { key: 'price', label: 'Price', required: true },
  { key: 'priceOnApplication', label: 'Price on Application', required: false },
  { key: 'currency', label: 'Currency', required: false },
  { key: 'paymentMethod', label: 'Payment Method', required: false },
  { key: 'downPaymentPrice', label: 'Down Payment', required: false },
  { key: 'serviceCharge', label: 'Service Charge', required: false },
  { key: 'cheques', label: 'Cheques', required: false },
  { key: 'purpose', label: 'Purpose (Sale/Rent)', required: true },
  { key: 'propertyType', label: 'Property Type', required: true },
  { key: 'beds', label: 'Bedrooms', required: false },
  { key: 'baths', label: 'Bathrooms', required: false },
  { key: 'area', label: 'Area', required: false },
  { key: 'areaUnit', label: 'Area Unit', required: false },
  { key: 'plotSize', label: 'Plot Size', required: false },
  { key: 'community', label: 'Community', required: false },
  { key: 'city', label: 'City', required: false },
  { key: 'address', label: 'Address', required: false },
  { key: 'subCommunity', label: 'Sub Community', required: false },
  { key: 'propertyName', label: 'Property Name', required: false },
  { key: 'developer', label: 'Developer', required: false },
  { key: 'buildYear', label: 'Build Year', required: false },
  { key: 'floor', label: 'Floor', required: false },
  { key: 'stories', label: 'Stories', required: false },
  { key: 'latitude', label: 'Latitude', required: false },
  { key: 'longitude', label: 'Longitude', required: false },
  { key: 'images', label: 'Images', required: false },
  { key: 'amenities', label: 'Amenities', required: false },
  { key: 'view360', label: '360 View URL', required: false },
  { key: 'videoTourUrl', label: 'Video Tour URL', required: false },
  { key: 'floorPlanUrl', label: 'Floor Plan URL', required: false },
  { key: 'agent', label: 'Agent', required: false },
  { key: 'furnished', label: 'Furnished', required: false },
  { key: 'parking', label: 'Parking', required: false },
  { key: 'completionStatus', label: 'Completion Status', required: false },
  { key: 'permitNumber', label: 'Permit Number', required: false },
  { key: 'lastUpdate', label: 'Last Update', required: false },
];

export type Role = "admin" | "editor" | "viewer";

export type AuthUser = {
  id: string;
  username: string;
  role: Role | (string & {});
  /** ISO string from server when available */
  createdAt?: string;
};

export type ImportListingStatus = "new" | "updated" | "unchanged" | "removed" | "duplicate";

export type ImportDiffSummary = {
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  removedCount: number;
  duplicateCount: number;
};

export type MappingConflict = {
  uiField: keyof Listing;
  xmlPaths: string[];
};

export type ImportConflictsSummary = {
  duplicateIds: string[];
  duplicateReferences: string[];
  mappingConflicts: MappingConflict[];
  missingRequiredFields: (keyof Listing)[];
};

export type ImportListingDiff = {
  id: string;
  reference: string;
  status: ImportListingStatus;
  changedKeys: (keyof Listing)[];
};

export type ImportSession = {
  id: string;
  createdAt: string;
  fileName: string;
  /** Classic XML upload path; stream workspace merges use `"stream"`. */
  classicImportMode?: "single" | "batch" | "stream";
  /**
   * Folder/stream merge: distinct XML agency names in the merged snapshot (for labels + rollups).
   * Populated on scan; older sessions may omit this field.
   */
  streamBrandNames?: string[];
  strictMode: boolean;
  agencyInfo?: ImportResult["agencyInfo"];
  listingCount: number;
  warnings: string[];
  errors: string[];
  conflicts: ImportConflictsSummary;
  diffSummary: ImportDiffSummary;
  listingDiffById: Record<string, ImportListingDiff>;
  /**
   * Snapshot session whose listing rows were used as "before" for this run's per-listing diff
   * (classic import: previous session for the same agency). Used to load baselines for Git-style text previews.
   */
  diffBaselineSessionId?: string | null;
};

