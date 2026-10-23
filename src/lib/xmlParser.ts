import { FieldMapper } from "./fieldMapper";
import { FieldMapping, ImportResult, Listing, MappingConfig, ParsedXmlNode, XmlFlatEntry, XmlFlatValue } from './types';

/** Max XML string length for single-file and stream-folder imports (JS chars; ASCII-heavy feeds ≈ bytes). */
export const MAX_XML_TEXT_CHARS = 50_000_000;

/**
 * Bump when parsing changes in a way that changes output for the same file. It is part of each
 * version's fingerprint, so "Re-parse" creates a new version instead of a duplicate.
 * 2: period-nested rent prices, CS offering, agent licence/id/info, raw type codes.
 */
export const PARSER_VERSION = 2;

function sanitizeXml(xml: string): { xml: string; removed: number } {
  // XML 1.0 forbids most ASCII control chars (except tab, LF, CR).
  // Some real-world feeds contain NULs or other control characters; DOMParser will hard-fail on them.
  const before = xml.length;
  const cleaned = xml.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return { xml: cleaned, removed: before - cleaned.length };
}

function getTextContent(el: Element, tag: string): string {
  const child = el.getElementsByTagName(tag)[0];
  return child?.textContent?.trim() || '';
}

const RENT_PERIODS = ['yearly', 'monthly', 'weekly', 'daily'] as const;

function parseOfferingType(val: string): 'sale' | 'rent' | 'unknown' {
  const v = val.toLowerCase();
  // RS/CS = residential/commercial sale, RR/CR = residential/commercial rent (Property Finder codes).
  if (v === 'rs' || v === 'cs' || v.includes('sale')) return 'sale';
  if (v === 'rr' || v === 'cr' || v.includes('rent')) return 'rent';
  return 'unknown';
}

const PROPERTY_TYPE_MAP: Record<string, string> = {
  'AP': 'Apartment',
  'VH': 'Villa',
  'TH': 'Townhouse',
  'PH': 'Penthouse',
  'LP': 'Land/Plot',
  'OF': 'Office',
  'RE': 'Retail',
  'WH': 'Warehouse',
  'FF': 'Full Floor',
  'BU': 'Building',
  'CO': 'Compound',
  'DU': 'Duplex',
  'HF': 'Half Floor',
  'FA': 'Farm',
  'WB': 'Whole Building',
  'SH': 'Shop',
  'SR': 'Show Room',
  'ST': 'Studio',
  'SA': 'Staff Accommodation',
  'LA': 'Land',
};

function mapPropertyType(code: string): string {
  return PROPERTY_TYPE_MAP[code] || code;
}

/** Dubai-style feeds often ship "lat,lng" in `geopoints` instead of separate latitude/longitude nodes. */
function parseGeopoints(raw: string | null | undefined): { lat: number | null; lng: number | null } {
  if (raw == null) return { lat: null, lng: null };
  const s = String(raw).trim();
  if (!s) return { lat: null, lng: null };
  const parts = s.split(/[,\s;|]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { lat: null, lng: null };
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

function pickFlatValue(v: XmlFlatValue): string {
  if (v == null) return '';
  const x = Array.isArray(v) ? v[0] : v;
  return x == null ? '' : String(x).trim();
}

function firstNonEmptyByPath(
  getByPath: (path: string | null) => XmlFlatValue,
  paths: string[]
): XmlFlatValue {
  for (const p of paths) {
    const v = getByPath(p);
    if (pickFlatValue(v)) return v;
  }
  return null;
}

function serializeElement(el: Element): string {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(el);
}

function coerceListingField<K extends keyof Listing>(
  key: K,
  value: XmlFlatValue,
  defaults: { currency: string; areaUnit: string }
): Listing[K] {
  if (value == null) {
    const empty =
      (key === 'images' || key === 'amenities') ? [] :
      (key === 'latitude' || key === 'longitude') ? null :
      (key === 'price' || key === 'beds' || key === 'baths' || key === 'area' || key === 'parking') ? 0 :
      (key === 'agent') ? { name: '', phone: '', email: '', photo: '' } :
      '';
    return empty as Listing[K];
  }

  const v = Array.isArray(value) ? value[0] ?? '' : value;
  const s = typeof v === 'string' ? v : String(v);

  switch (key) {
    case 'price': return (parseFloat(s) || 0) as Listing[K];
    case 'downPaymentPrice': return (parseFloat(s) || 0) as Listing[K];
    case 'serviceCharge': return (parseFloat(s) || 0) as Listing[K];
    case 'beds': return (parseInt(s || '0') || 0) as Listing[K];
    case 'baths': return (parseInt(s || '0') || 0) as Listing[K];
    case 'area': return (parseFloat(s) || 0) as Listing[K];
    case 'plotSize': return (parseFloat(s) || 0) as Listing[K];
    case 'parking': return (parseInt(s || '0') || 0) as Listing[K];
    case 'latitude': return ((Number.isFinite(parseFloat(s)) ? parseFloat(s) : NaN) ? parseFloat(s) : null) as Listing[K];
    case 'longitude': return ((Number.isFinite(parseFloat(s)) ? parseFloat(s) : NaN) ? parseFloat(s) : null) as Listing[K];
    case 'purpose': return parseOfferingType(s) as Listing[K];
    case 'propertyType': return mapPropertyType(s) as Listing[K];
    case 'currency': return (s || defaults.currency) as Listing[K];
    case 'areaUnit': return (s || defaults.areaUnit) as Listing[K];
    case 'images': return (Array.isArray(value) ? value : [s]).filter(Boolean) as Listing[K];
    case 'amenities': {
      const arr = Array.isArray(value) ? value : [s];
      const out: string[] = [];
      for (const item of arr) {
        item.split(',').forEach(part => {
          const t = part.trim();
          if (t && !out.includes(t)) out.push(t);
        });
      }
      return out as Listing[K];
    }
    default:
      return s as Listing[K];
  }
}

function getMappedField(mappings: FieldMapping[] | undefined, uiField: keyof Listing): string | null {
  if (!mappings) return null;
  const hit = mappings.find(m => m.uiField === uiField);
  return hit?.xmlPath || null;
}

function flattenElement(el: Element, basePath: string): XmlFlatEntry[] {
  const entries: XmlFlatEntry[] = [];

  const attrs: Record<string, string> = {};
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    attrs[a.name] = a.value;
  }

  const hasChildren = el.children.length > 0;
  if (!hasChildren) {
    entries.push({
      path: basePath,
      name: el.tagName,
      value: el.textContent?.trim() || null,
      attributes: Object.keys(attrs).length ? attrs : undefined,
    });
    return entries;
  }

  // Include attribute-only nodes as entries too (so they can be mapped/visible).
  if (Object.keys(attrs).length) {
    entries.push({
      path: `${basePath}[@]`,
      name: `${el.tagName}[@]`,
      value: null,
      attributes: attrs,
    });
  }

  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i];
    const childPath = `${basePath}.${child.tagName}`;
    entries.push(...flattenElement(child, childPath));
  }

  return entries;
}

function buildFlatMap(entries: XmlFlatEntry[]): Record<string, XmlFlatValue> {
  const map: Record<string, XmlFlatValue> = {};
  for (const e of entries) {
    if (!(e.path in map)) {
      map[e.path] = e.value;
      continue;
    }
    const existing = map[e.path];
    const existingArr = Array.isArray(existing) ? existing : existing == null ? [] : [existing];
    const nextArr = Array.isArray(e.value) ? e.value : e.value == null ? [] : [e.value];
    map[e.path] = [...existingArr, ...nextArr];
  }
  return map;
}

function buildListingFromPropertyEl(
  prop: Element,
  index: number,
  defaults: { currency: string; areaUnit: string },
  mappingConfig?: MappingConfig | null
): Listing {
  const rawXml = serializeElement(prop);
  const entries = flattenElement(prop, 'property');
  const flatMap = buildFlatMap(entries);
  const mappings = mappingConfig?.mappings;
  const fieldMapper = new FieldMapper();

  const getByPath = (path: string | null): XmlFlatValue => (path ? (flatMap[path] ?? null) : null);

  // Required-ish identifiers
  const referencePath = getMappedField(mappings, 'reference') || 'property.reference_number';
  const referenceVal = getByPath(referencePath);
  const refStr = Array.isArray(referenceVal) ? (referenceVal[0] || '') : (referenceVal || '');

  const id = (refStr || `listing-${index}`) as string;

  const title = coerceListingField('title', getByPath(getMappedField(mappings, 'title') || 'property.title_en') ?? getByPath('property.title'), defaults);
  const description = coerceListingField('description', getByPath(getMappedField(mappings, 'description') || 'property.description_en') ?? getByPath('property.description'), defaults);

  const rawOffering = getByPath(getMappedField(mappings, 'purpose') || 'property.offering_type');
  const purpose = coerceListingField(
    'purpose',
    typeof rawOffering === "string" ? fieldMapper.mapOfferingType(rawOffering) : rawOffering,
    defaults
  );

  const rawPropType = getByPath(getMappedField(mappings, 'propertyType') || 'property.property_type');
  const propertyType = coerceListingField(
    'propertyType',
    typeof rawPropType === "string" ? fieldMapper.mapPropertyType(rawPropType) : rawPropType,
    defaults
  );

  const community = coerceListingField('community', getByPath(getMappedField(mappings, 'community') || 'property.community'), defaults);
  const city = coerceListingField('city', getByPath(getMappedField(mappings, 'city') || 'property.city'), defaults);
  const subCommunity = coerceListingField('subCommunity', getByPath(getMappedField(mappings, 'subCommunity') || 'property.sub_community'), defaults);
  const propertyName = coerceListingField('propertyName', getByPath(getMappedField(mappings, 'propertyName') || 'property.property_name'), defaults);

  // Rentals often nest the amount under its period: <price><yearly>120000</yearly></price>.
  const mappedPricePath = getMappedField(mappings, 'price');
  let rentPeriod: Listing['rentPeriod'] = '';
  let rawPrice = getByPath(mappedPricePath || 'property.price');
  if (!mappedPricePath && (rawPrice == null || rawPrice === '')) {
    for (const period of RENT_PERIODS) {
      const v = getByPath(`property.price.${period}`);
      if (v != null && v !== '') {
        rawPrice = v;
        rentPeriod = period;
        break;
      }
    }
  }
  const price = coerceListingField('price', rawPrice, defaults);
  const priceOnApplication = coerceListingField('priceOnApplication', getByPath(getMappedField(mappings, 'priceOnApplication') || 'property.price_on_application'), defaults);
  const currency = coerceListingField('currency', getByPath(getMappedField(mappings, 'currency') || null), defaults);
  const paymentMethod = coerceListingField('paymentMethod', getByPath(getMappedField(mappings, 'paymentMethod') || 'property.payment_method'), defaults);
  const downPaymentPrice = coerceListingField('downPaymentPrice', getByPath(getMappedField(mappings, 'downPaymentPrice') || 'property.down_payment_price'), defaults);
  const serviceCharge = coerceListingField('serviceCharge', getByPath(getMappedField(mappings, 'serviceCharge') || 'property.service_charge'), defaults);
  const cheques = coerceListingField('cheques', getByPath(getMappedField(mappings, 'cheques') || 'property.cheques'), defaults);

  const beds = coerceListingField('beds', getByPath(getMappedField(mappings, 'beds') || 'property.bedroom') ?? getByPath('property.bedrooms'), defaults);
  const baths = coerceListingField('baths', getByPath(getMappedField(mappings, 'baths') || 'property.bathroom') ?? getByPath('property.bathrooms'), defaults);
  const area = coerceListingField('area', getByPath(getMappedField(mappings, 'area') || 'property.size') ?? getByPath('property.built_up_area') ?? getByPath('property.bua'), defaults);
  const areaUnit = coerceListingField('areaUnit', getByPath(getMappedField(mappings, 'areaUnit') || null), defaults);
  const plotSize = coerceListingField('plotSize', getByPath(getMappedField(mappings, 'plotSize') || 'property.plot_size'), defaults);

  const furnished = coerceListingField('furnished', getByPath(getMappedField(mappings, 'furnished') || 'property.furnished') ?? getByPath('property.furnishing'), defaults);
  const parking = coerceListingField('parking', getByPath(getMappedField(mappings, 'parking') || 'property.parking'), defaults);
  const rawCompletion = getByPath(getMappedField(mappings, 'completionStatus') || 'property.completion_status');
  const completionStatus = coerceListingField(
    'completionStatus',
    typeof rawCompletion === "string" ? fieldMapper.mapCompletionStatus(rawCompletion) : rawCompletion,
    defaults
  );
  const permitNumber = coerceListingField('permitNumber', getByPath(getMappedField(mappings, 'permitNumber') || 'property.permit_number'), defaults);

  const developer = coerceListingField('developer', getByPath(getMappedField(mappings, 'developer') || 'property.developer'), defaults);
  const buildYear = coerceListingField('buildYear', getByPath(getMappedField(mappings, 'buildYear') || 'property.build_year'), defaults);
  const floor = coerceListingField('floor', getByPath(getMappedField(mappings, 'floor') || 'property.floor'), defaults);
  const stories = coerceListingField('stories', getByPath(getMappedField(mappings, 'stories') || 'property.stories'), defaults);
  const view360Path = getMappedField(mappings, 'view360');
  const view360 = coerceListingField(
    'view360',
    view360Path
      ? getByPath(view360Path)
      : firstNonEmptyByPath(getByPath, ['property.view360', 'property.view_360', 'property.virtual_tour_url']),
    defaults
  );
  const videoTourPath = getMappedField(mappings, 'videoTourUrl');
  const videoTourUrl = coerceListingField(
    'videoTourUrl',
    videoTourPath
      ? getByPath(videoTourPath)
      : firstNonEmptyByPath(getByPath, [
          'property.video_tour_url',
          'property.video_tour',
          'property.tour_video_url',
          'property.tour_url',
          'property.video_url',
        ]),
    defaults
  );
  const floorPlanPath = getMappedField(mappings, 'floorPlanUrl');
  const floorPlanUrl = coerceListingField(
    'floorPlanUrl',
    floorPlanPath
      ? getByPath(floorPlanPath)
      : firstNonEmptyByPath(getByPath, ['property.floor_plan', 'property.floorplan', 'property.floor_plan_url']),
    defaults
  );

  let lat = coerceListingField('latitude', getByPath(getMappedField(mappings, 'latitude') || 'property.latitude'), defaults);
  let lng = coerceListingField('longitude', getByPath(getMappedField(mappings, 'longitude') || 'property.longitude'), defaults);
  if (lat == null || lng == null) {
    const gpRaw = firstNonEmptyByPath(getByPath, ['property.geopoints', 'property.geo_points', 'property.coordinates']);
    const gpStr = pickFlatValue(gpRaw);
    const { lat: glat, lng: glng } = parseGeopoints(gpStr);
    if (lat == null && glat != null) lat = glat;
    if (lng == null && glng != null) lng = glng;
  }

  const images = ((): string[] => {
    const mapped = getMappedField(mappings, 'images');
    const v = mapped ? getByPath(mapped) : null;
    if (v) return coerceListingField('images', v, defaults);

    // Common patterns: property.photo.url, property.image.url, property.photo
    const urls = flatMap['property.photo.url'] ?? flatMap['property.image.url'] ?? flatMap['property.photo'] ?? flatMap['property.image'];
    if (!urls) return [];
    return coerceListingField('images', urls, defaults).filter(u => u.startsWith('http'));
  })();

  const amenities = ((): string[] => {
    const mapped = getMappedField(mappings, 'amenities');
    const v = mapped ? getByPath(mapped) : null;
    if (v) return coerceListingField('amenities', v, defaults);

    const merged: string[] = [];
    const features = flatMap['property.features.feature'];
    if (features) merged.push(...coerceListingField('amenities', features, defaults));
    const priv = flatMap['property.private_amenities'];
    if (priv) {
      const codes = fieldMapper.mapAmenitiesToCodes(priv);
      if (codes) merged.push(...coerceListingField('amenities', codes, defaults));
    }
    const comm = flatMap['property.commercial_amenities'];
    if (comm) {
      const codes = fieldMapper.mapAmenitiesToCodes(comm);
      if (codes) merged.push(...coerceListingField('amenities', codes, defaults));
    }
    return Array.from(new Set(merged));
  })();

  const agentEl = prop.getElementsByTagName('agent')[0];
  const agent = {
    name: agentEl ? getTextContent(agentEl, 'name') : '',
    phone: agentEl ? getTextContent(agentEl, 'phone') : '',
    email: agentEl ? getTextContent(agentEl, 'email') : '',
    photo: agentEl ? getTextContent(agentEl, 'photo') : '',
    licenseNo: agentEl ? getTextContent(agentEl, 'license_no') : '',
    id: agentEl ? getTextContent(agentEl, 'id') : '',
    info: agentEl ? getTextContent(agentEl, 'info') : '',
  };

  return {
    id,
    reference: String(refStr || ''),
    title: String(title || ''),
    description: String(description || ''),
    price,
    rentPeriod,
    priceOnApplication: String(priceOnApplication || ''),
    currency: String(currency || defaults.currency),
    paymentMethod: String(paymentMethod || ''),
    downPaymentPrice,
    serviceCharge,
    cheques: String(cheques || ''),
    purpose,
    propertyType: String(propertyType || ''),
    beds,
    baths,
    area,
    areaUnit: String(areaUnit || defaults.areaUnit),
    plotSize,
    community: String(community || ''),
    city: String(city || ''),
    address: [String(subCommunity || ''), String(community || ''), String(city || '')].filter(Boolean).join(', '),
    subCommunity: String(subCommunity || ''),
    propertyName: String(propertyName || ''),
    developer: String(developer || ''),
    buildYear: String(buildYear || ''),
    floor: String(floor || ''),
    stories: String(stories || ''),
    latitude: lat,
    longitude: lng,
    images,
    amenities,
    view360: String(view360 || ''),
    videoTourUrl: String(videoTourUrl || ''),
    floorPlanUrl: String(floorPlanUrl || ''),
    agent,
    offeringType: typeof rawOffering === "string" ? rawOffering.trim().toUpperCase() : '',
    propertyTypeCode: typeof rawPropType === "string" ? rawPropType.trim().toUpperCase() : '',
    rawXml,
    furnished: String(furnished || ''),
    parking,
    completionStatus: String(completionStatus || ''),
    permitNumber: String(permitNumber || ''),
    lastUpdate: prop.getAttribute('last_update') || '',
  };
}

export function parseXmlString(xmlString: string, strictMode = false, mappingConfig?: MappingConfig | null): ImportResult {
  // Keep a sync API for existing callers; large feeds can be slow.
  // For better UX with big files, prefer `parseXmlStringAsync`.
  const warnings: string[] = [];
  const errors: string[] = [];
  const sanitized = sanitizeXml(xmlString);
  if (sanitized.removed > 0) {
    warnings.push(`Sanitized XML: removed ${sanitized.removed} invalid control character(s)`);
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized.xml, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    return {
      success: false,
      listings: [],
      totalCount: 0,
      warnings,
      errors: [`XML Parse Error: ${parseError.textContent}`],
      detectedNodes: [],
    };
  }

  // Detect agency info
  const agencyEl = doc.getElementsByTagName('agency')[0];
  const agencyInfo = agencyEl ? {
    name: getTextContent(agencyEl, 'company_name'),
    logo: getTextContent(agencyEl, 'company_logo'),
    email: getTextContent(agencyEl, 'company_email'),
    phone: getTextContent(agencyEl, 'company_phone'),
    website: getTextContent(agencyEl, 'company_website'),
  } : undefined;

  // Detect metadata
  const metaEl = doc.getElementsByTagName('metadata')[0];
  const defaultCurrency = metaEl ? getTextContent(metaEl, 'currency') : 'AED';
  const defaultAreaUnit = metaEl ? (getTextContent(metaEl, 'area_unit') || 'sqft') : 'sqft';

  // Find property nodes
  const listingTag = (mappingConfig?.listingNodePath?.split('.').filter(Boolean).pop() || 'property').replace(/^@/, '');
  const propertyNodes = doc.getElementsByTagName(listingTag);
  const detectedNodes = ['list', 'metadata', 'agency', 'properties', 'property'];

  if (propertyNodes.length === 0) {
    return {
      success: false,
      listings: [],
      totalCount: 0,
      warnings,
      errors: ['No <property> elements found in XML'],
      detectedNodes,
    };
  }

  const listings: Listing[] = [];

  for (let i = 0; i < propertyNodes.length; i++) {
    const prop = propertyNodes[i];
    try {
      const listing = buildListingFromPropertyEl(
        prop,
        i,
        { currency: defaultCurrency, areaUnit: defaultAreaUnit },
        mappingConfig
      );

      // Warnings for missing key fields
      if (!listing.price) warnings.push(`Listing ${listing.reference || i}: missing price`);
      if (!listing.title) warnings.push(`Listing ${listing.reference || i}: missing title`);
      if (listing.images.length === 0) warnings.push(`Listing ${listing.reference || i}: no images`);

      listings.push(listing);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (strictMode) {
        errors.push(`Failed to parse listing ${i}: ${msg}`);
      } else {
        warnings.push(`Skipped listing ${i}: ${msg}`);
      }
    }
  }

  return {
    success: errors.length === 0,
    listings,
    totalCount: listings.length,
    warnings,
    errors,
    detectedNodes,
    agencyInfo,
  };
}

export async function parseXmlStringAsync(
  xmlString: string,
  opts: {
    strictMode?: boolean;
    mappingConfig?: MappingConfig | null;
    batchSize?: number;
    onProgress?: (p: { total: number; done: number }) => void;
    yieldMs?: number;
  } = {}
): Promise<ImportResult> {
  const strictMode = opts.strictMode ?? false;
  const mappingConfig = opts.mappingConfig ?? null;
  const batchSize = Math.max(1, Math.floor(opts.batchSize ?? 50));
  const yieldMs = Math.max(0, Math.floor(opts.yieldMs ?? 0));

  const warnings: string[] = [];
  const errors: string[] = [];
  const sanitized = sanitizeXml(xmlString);
  if (sanitized.removed > 0) {
    warnings.push(`Sanitized XML: removed ${sanitized.removed} invalid control character(s)`);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized.xml, "text/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    return {
      success: false,
      listings: [],
      totalCount: 0,
      warnings,
      errors: [`XML Parse Error: ${parseError.textContent}`],
      detectedNodes: [],
    };
  }

  const agencyEl = doc.getElementsByTagName("agency")[0];
  const agencyInfo = agencyEl
    ? {
        name: getTextContent(agencyEl, "company_name"),
        logo: getTextContent(agencyEl, "company_logo"),
        email: getTextContent(agencyEl, "company_email"),
        phone: getTextContent(agencyEl, "company_phone"),
        website: getTextContent(agencyEl, "company_website"),
      }
    : undefined;

  const metaEl = doc.getElementsByTagName("metadata")[0];
  const defaultCurrency = metaEl ? getTextContent(metaEl, "currency") : "AED";
  const defaultAreaUnit = metaEl ? getTextContent(metaEl, "area_unit") || "sqft" : "sqft";

  const listingTag = (mappingConfig?.listingNodePath?.split(".").filter(Boolean).pop() || "property")
    .replace(/^@/, "");
  const propertyNodes = doc.getElementsByTagName(listingTag);
  const detectedNodes = ["list", "metadata", "agency", "properties", "property"];

  if (propertyNodes.length === 0) {
    return {
      success: false,
      listings: [],
      totalCount: 0,
      warnings,
      errors: ["No <property> elements found in XML"],
      detectedNodes,
    };
  }

  const listings: Listing[] = [];
  const total = propertyNodes.length;
  /**
   * Hand the main thread back between batches so the browser can paint.
   *
   * This deliberately does not sleep. `setTimeout(resolve, yieldMs)` paused for the full delay on
   * every batch — with the import default of 18ms over a 1700-listing feed that is ~750ms of pure
   * waiting, on top of setTimeout's 4ms clamp once timers nest. A scheduler yield (or a
   * MessageChannel message, which is a macrotask and so still allows a paint) gives the same
   * responsiveness for the cost of one task hop.
   *
   * `yieldMs` is honoured only by the final fallback, for environments with neither API.
   */
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  const yieldToUI = (): Promise<void> => {
    if (typeof scheduler?.yield === "function") return scheduler.yield();
    if (typeof MessageChannel !== "undefined") {
      return new Promise<void>((resolve) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = () => {
          ch.port1.close();
          resolve();
        };
        ch.port2.postMessage(undefined);
      });
    }
    return new Promise<void>((resolve) => setTimeout(resolve, yieldMs));
  };

  for (let i = 0; i < total; i++) {
    const prop = propertyNodes[i];
    try {
      const listing = buildListingFromPropertyEl(
        prop,
        i,
        { currency: defaultCurrency, areaUnit: defaultAreaUnit },
        mappingConfig
      );

      if (!listing.price) warnings.push(`Listing ${listing.reference || i}: missing price`);
      if (!listing.title) warnings.push(`Listing ${listing.reference || i}: missing title`);
      if (listing.images.length === 0) warnings.push(`Listing ${listing.reference || i}: no images`);

      listings.push(listing);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (strictMode) {
        errors.push(`Failed to parse listing ${i}: ${msg}`);
      } else {
        warnings.push(`Skipped listing ${i}: ${msg}`);
      }
    }

    const done = i + 1;
    if (done % batchSize === 0 || done === total) {
      opts.onProgress?.({ total, done });
      // Give the UI thread a chance to paint between batches.
      await yieldToUI();
    }
  }

  return {
    success: errors.length === 0,
    listings,
    totalCount: listings.length,
    warnings,
    errors,
    detectedNodes,
    agencyInfo,
  };
}

export function buildXmlTree(xmlString: string): ParsedXmlNode[] {
  const sanitized = sanitizeXml(xmlString);
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized.xml, 'text/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) return [];

  function walk(el: Element, path: string): ParsedXmlNode {
    const childMap = new Map<string, { node: ParsedXmlNode; count: number }>();
    const children: ParsedXmlNode[] = [];

    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i];
      const childPath = `${path}.${child.tagName}`;
      const existing = childMap.get(child.tagName);
      if (existing) {
        existing.count++;
        existing.node.count = existing.count;
      } else {
        const node = walk(child, childPath);
        childMap.set(child.tagName, { node, count: 1 });
        children.push(node);
      }
    }

    const attrs: Record<string, string> = {};
    for (let i = 0; i < el.attributes.length; i++) {
      const a = el.attributes[i];
      attrs[a.name] = a.value;
    }

    return {
      name: el.tagName,
      path,
      value: el.children.length === 0 ? (el.textContent?.trim() || null) : null,
      children,
      attributes: attrs,
      count: 1,
    };
  }

  return [walk(doc.documentElement, doc.documentElement.tagName)];
}

export function flattenXmlString(xmlString: string, rootPath?: string): XmlFlatEntry[] {
  const sanitized = sanitizeXml(xmlString);
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized.xml, 'text/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) return [];

  const root = doc.documentElement;
  const base = rootPath || root.tagName;
  return flattenElement(root, base);
}

export function exportListingsAsJson(listings: Listing[]): void {
  const json = JSON.stringify(listings, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `listings-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(v: string): string {
  const s = v.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportListingsAsCsv(listings: Listing[]): void {
  const headers = [
    "id",
    "reference",
    "title",
    "price",
    "currency",
    "purpose",
    "propertyType",
    "beds",
    "baths",
    "area",
    "areaUnit",
    "city",
    "community",
    "address",
    "latitude",
    "longitude",
    "agentName",
    "agentPhone",
    "agentEmail",
    "lastUpdate",
  ] as const;
  const lines: string[] = [headers.map((h) => csvCell(h)).join(",")];
  for (const l of listings) {
    lines.push(
      [
        csvCell(l.id),
        csvCell(l.reference),
        csvCell(l.title),
        csvCell(String(l.price)),
        csvCell(l.currency),
        csvCell(l.purpose),
        csvCell(l.propertyType),
        csvCell(String(l.beds)),
        csvCell(String(l.baths)),
        csvCell(String(l.area)),
        csvCell(l.areaUnit),
        csvCell(l.city),
        csvCell(l.community),
        csvCell(l.address),
        csvCell(l.latitude == null ? "" : String(l.latitude)),
        csvCell(l.longitude == null ? "" : String(l.longitude)),
        csvCell(l.agent?.name ?? ""),
        csvCell(l.agent?.phone ?? ""),
        csvCell(l.agent?.email ?? ""),
        csvCell(l.lastUpdate ?? ""),
      ].join(","),
    );
  }
  const body = lines.join("\r\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `listings-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
