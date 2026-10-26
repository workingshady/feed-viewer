import { FieldMapper } from "./fieldMapper";
import { FieldMapping, ImportResult, Listing, MappingConfig, ParsedXmlNode, XmlFlatEntry, XmlFlatValue } from './types';
import { MARKETS, marketCodeOf, marketCodeOfCurrency } from './markets';

/** Max XML string length for single-file and stream-folder imports (JS chars; ASCII-heavy feeds ≈ bytes). */
export const MAX_XML_TEXT_CHARS = 400_000_000;

/**
 * Bump when parsing changes in a way that changes output for the same file. It is part of each
 * version's fingerprint, so "Re-parse" creates a new version instead of a duplicate.
 * 2: period-nested rent prices, CS offering, agent licence/id/info, raw type codes.
 * 3: per-listing market (country / state), chunked parsing that skips malformed listings.
 */
export const PARSER_VERSION = 3;

function sanitizeXml(xml: string): { xml: string; removed: number } {
  // XML 1.0 forbids most ASCII control chars (except tab, LF, CR).
  // Some real-world feeds contain NULs or other control characters; DOMParser will hard-fail on them.
  const before = xml.length;
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  const cleaned = xml.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return { xml: cleaned, removed: before - cleaned.length };
}

function getTextContent(el: Element, tag: string): string {
  const child = el.getElementsByTagName(tag)[0];
  return child?.textContent?.trim() || '';
}

/** Prefer the ISO code (<currency code="AED">UAE Dirham</currency>) over the display name. */
function metadataCurrency(metaEl: Element): string {
  const el = metaEl.getElementsByTagName('currency')[0];
  return el?.getAttribute('code')?.trim() || el?.textContent?.trim() || 'AED';
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
  'HA': 'Hotel Apartment',
  'HO': 'Hotel',
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
  defaults: FeedDefaults,
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
  const countryRaw = pickFlatValue(getByPath(getMappedField(mappings, 'country') || 'property.country'));
  const country = marketCodeOf(countryRaw) ?? (defaults.country || marketCodeOfCurrency(defaults.currency) || '');
  const state = pickFlatValue(getByPath(getMappedField(mappings, 'state') || 'property.state')).trim();
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
    country,
    state,
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

type FeedDefaults = { currency: string; areaUnit: string; country: string };

type FeedHead = { agencyInfo?: ImportResult["agencyInfo"]; defaults: FeedDefaults; market: string };

/** Listings parsed per DOMParser call: small documents keep memory flat on 100 MB+ feeds. */
const CHUNK_LISTINGS = 500;

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** First `<tag …>…</tag>` element in `xml` (searching only `xml`), parsed on its own. */
function parseFirstElement(xml: string, tag: string): Element | null {
  const m = new RegExp(`<${escapeRe(tag)}(?=[\\s>/])[\\s\\S]*?</${escapeRe(tag)}>`).exec(xml);
  if (!m) return null;
  const doc = new DOMParser().parseFromString(m[0], "text/xml");
  return doc.querySelector("parsererror") ? null : doc.documentElement;
}

/** Feed-level info from the part of the file before the first listing. */
function readFeedHead(head: string): FeedHead {
  const agencyEl = parseFirstElement(head, "agency");
  const metaEl = parseFirstElement(head, "metadata");
  const countryEl = metaEl?.getElementsByTagName("country")[0];
  const currency = metaEl ? metadataCurrency(metaEl) : "";
  const market =
    marketCodeOf(countryEl?.getAttribute("code")) ?? marketCodeOf(countryEl?.textContent) ?? marketCodeOfCurrency(currency) ?? "";
  return {
    agencyInfo: agencyEl
      ? {
          name: getTextContent(agencyEl, "company_name"),
          logo: getTextContent(agencyEl, "company_logo"),
          email: getTextContent(agencyEl, "company_email"),
          phone: getTextContent(agencyEl, "company_phone"),
          website: getTextContent(agencyEl, "company_website"),
        }
      : undefined,
    defaults: {
      currency: currency || (market ? MARKETS[market].currency : "AED"),
      areaUnit: (metaEl && getTextContent(metaEl, "area_unit")) || "sqft",
      country: market,
    },
    market,
  };
}

/**
 * Cuts a feed into its listing elements without building one DOM for the whole file, so feeds of
 * any size parse with bounded memory. Matches `<property>` / `<property …>` but not `<property_type>`.
 */
export function splitListingBlocks(xml: string, tag: string): { head: string; blocks: string[] } {
  const open = new RegExp(`<${escapeRe(tag)}(?=[\\s>/])`, "g");
  const close = `</${tag}>`;
  const blocks: string[] = [];
  let head = "";
  let m: RegExpExecArray | null;
  while ((m = open.exec(xml))) {
    if (!blocks.length) head = xml.slice(0, m.index);
    const gt = xml.indexOf(">", m.index);
    if (gt < 0) break;
    if (xml[gt - 1] === "/") {
      blocks.push(xml.slice(m.index, gt + 1));
      open.lastIndex = gt + 1;
      continue;
    }
    // Same-named elements nested inside a listing are kept inside it.
    let depth = 1;
    let pos = gt + 1;
    let end = -1;
    while (depth > 0) {
      const c = xml.indexOf(close, pos);
      if (c < 0) break;
      open.lastIndex = pos;
      const inner = open.exec(xml);
      if (inner && inner.index < c) {
        const igt = xml.indexOf(">", inner.index);
        if (xml[igt - 1] !== "/") depth++;
        pos = igt + 1;
        continue;
      }
      depth--;
      pos = c + close.length;
      if (depth === 0) end = pos;
    }
    if (end < 0) break;
    blocks.push(xml.slice(m.index, end));
    open.lastIndex = end;
  }
  return { head: blocks.length ? head : xml, blocks };
}

/** Root element wrapping a chunk, re-declaring the root's namespaces so prefixed names stay valid. */
function chunkRoot(head: string): [string, string] {
  const root = /<([A-Za-z_][\w:.-]*)([^>]*)>/.exec(head.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>/g, ""));
  const ns = root ? (root[2].match(/\sxmlns(:[\w.-]+)?\s*=\s*("[^"]*"|'[^']*')/g) ?? []).join("") : "";
  return [`<feedchunk${ns}>`, "</feedchunk>"];
}

type ParseOpts = {
  strictMode?: boolean;
  mappingConfig?: MappingConfig | null;
  onProgress?: (p: { total: number; done: number }) => void;
};

/**
 * Shared parser: feed head once, then listings in chunks of CHUNK_LISTINGS. A malformed chunk is
 * retried listing by listing, so one broken listing no longer fails the whole file.
 */
function* parseFeedSteps(xmlString: string, opts: ParseOpts): Generator<void, ImportResult> {
  const strictMode = opts.strictMode ?? false;
  const mappingConfig = opts.mappingConfig ?? null;
  const warnings: string[] = [];
  const errors: string[] = [];
  const sanitized = sanitizeXml(xmlString);
  if (sanitized.removed > 0) {
    warnings.push(`Sanitized XML: removed ${sanitized.removed} invalid control character(s)`);
  }
  const xml = sanitized.xml;
  const listingTag = (mappingConfig?.listingNodePath?.split(".").filter(Boolean).pop() || "property").replace(/^@/, "");
  const detectedNodes = ["list", "metadata", "agency", "properties", "property"];
  const { head, blocks } = splitListingBlocks(xml, listingTag);

  if (!blocks.length) {
    // Nothing to chunk: report a parse error if the file is not XML at all, as before.
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const parseError = doc.querySelector("parsererror");
    return {
      success: false,
      listings: [],
      totalCount: 0,
      warnings,
      errors: [parseError ? `XML Parse Error: ${parseError.textContent}` : `No <${listingTag}> elements found in XML`],
      detectedNodes: parseError ? [] : detectedNodes,
    };
  }

  const { agencyInfo, defaults, market } = readFeedHead(head);
  const [rootOpen, rootClose] = chunkRoot(head);
  const parser = new DOMParser();
  const parseOne = (src: string): Element[] | string => {
    const doc = parser.parseFromString(`${rootOpen}${src}${rootClose}`, "text/xml");
    const err = doc.querySelector("parsererror");
    if (err) return err.textContent?.trim() || "malformed XML";
    return Array.from(doc.documentElement.children).filter((el) => el.localName === listingTag || el.tagName === listingTag);
  };

  const listings: Listing[] = [];
  const total = blocks.length;
  let parseFailures = 0;
  const build = (prop: Element, i: number) => {
    try {
      const listing = buildListingFromPropertyEl(prop, i, defaults, mappingConfig);
      if (!listing.price) warnings.push(`Listing ${listing.reference || i}: missing price`);
      if (!listing.title) warnings.push(`Listing ${listing.reference || i}: missing title`);
      if (listing.images.length === 0) warnings.push(`Listing ${listing.reference || i}: no images`);
      listings.push(listing);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (strictMode) errors.push(`Failed to parse listing ${i}: ${msg}`);
      else warnings.push(`Skipped listing ${i}: ${msg}`);
    }
  };

  for (let start = 0; start < total; start += CHUNK_LISTINGS) {
    const chunk = blocks.slice(start, start + CHUNK_LISTINGS);
    const els = parseOne(chunk.join("\n"));
    if (typeof els !== "string") {
      els.forEach((el, k) => build(el, start + k));
    } else {
      chunk.forEach((block, k) => {
        const one = parseOne(block);
        if (typeof one !== "string" && one[0]) build(one[0], start + k);
        else {
          parseFailures++;
          const msg = `Listing ${start + k}: XML error, skipped (${typeof one === "string" ? one.split("\n")[0].slice(0, 160) : "empty"})`;
          if (strictMode) errors.push(msg);
          else warnings.push(msg);
        }
      });
    }
    opts.onProgress?.({ total, done: Math.min(total, start + CHUNK_LISTINGS) });
    yield; // between chunks: the async caller lets the browser paint
  }
  if (parseFailures) warnings.unshift(`${parseFailures} listing(s) had malformed XML and were skipped`);

  return {
    success: errors.length === 0,
    listings,
    totalCount: listings.length,
    warnings,
    errors,
    detectedNodes,
    agencyInfo,
    market: market || undefined,
  };
}

/** Synchronous parse (tests, small files). Large files: prefer `parseXmlStringAsync`. */
export function parseXmlString(xmlString: string, strictMode = false, mappingConfig?: MappingConfig | null): ImportResult {
  const steps = parseFeedSteps(xmlString, { strictMode, mappingConfig });
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

export async function parseXmlStringAsync(
  xmlString: string,
  opts: {
    strictMode?: boolean;
    mappingConfig?: MappingConfig | null;
    /** Unused: listings are parsed in fixed chunks. Kept for callers. */
    batchSize?: number;
    onProgress?: (p: { total: number; done: number }) => void;
    yieldMs?: number;
  } = {}
): Promise<ImportResult> {
  const yieldMs = Math.max(0, Math.floor(opts.yieldMs ?? 0));
  /**
   * Hand the main thread back between chunks so the browser can paint. A scheduler yield (or a
   * MessageChannel message, which is a macrotask and so still allows a paint) costs one task hop
   * instead of a fixed sleep; `yieldMs` is honoured only by the final fallback.
   */
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  const pause = (): Promise<void> => {
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
  const steps = parseFeedSteps(xmlString, { strictMode: opts.strictMode, mappingConfig: opts.mappingConfig, onProgress: opts.onProgress });
  let r = steps.next();
  while (!r.done) {
    await pause();
    r = steps.next();
  }
  return r.value;
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
