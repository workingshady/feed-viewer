export type FieldMapperStats = {
  itemsProcessed: number;
  offeringTypesMapped: number;
  propertyTypesMapped: number;
  completionStatusMapped: number;
  unmappedValues: string[];
};

// Mirrors FieldMappingPipeline / FieldMapper logic from Python version, but in TS and
// usable on plain values (no Scrapy dependency).
export class FieldMapper {
  public stats: FieldMapperStats = {
    itemsProcessed: 0,
    offeringTypesMapped: 0,
    propertyTypesMapped: 0,
    completionStatusMapped: 0,
    unmappedValues: [],
  };

  // Offering type → GetListings codes
  public static OFFERING_TYPE_MAP: Record<string, string> = {
    // Sales
    "for sale": "RS",
    "for-sale": "RS",
    sale: "RS",
    sales: "RS",
    buy: "RS",
    "residential sale": "RS",
    // Rentals
    "for rent": "RR",
    "for-rent": "RR",
    rent: "RR",
    rental: "RR",
    rentals: "RR",
    lease: "RR",
    "residential rent": "RR",
    // Off-plan inventory still counts as sale for feed codes
    "off-plan": "RS",
    "off plan": "RS",
    offplan: "RS",
    // Commercial
    "commercial sale": "CS",
    "commercial rent": "CR",
    "commercial for sale": "CS",
    "commercial for rent": "CR",
  };

  public static PROPERTY_TYPE_MAP: Record<string, string> = {
    // Residential
    apartment: "AP",
    apartments: "AP",
    flat: "AP",
    flats: "AP",
    "apartment/flat": "AP",
    "loft apartment": "AP",
    "full floor residential": "AP",
    villa: "VH",
    villas: "VH",
    "villa/house": "VH",
    "commercial villa": "VH",
    townhouse: "TH",
    townhouses: "TH",
    "town house": "TH",
    penthouse: "PH",
    penthouses: "PH",
    "whole building": "BU",
    "land/plot": "LP",
    duplex: "DU",
    duplexes: "DU",
    studio: "ST",
    studios: "ST",
    "studio apartment": "ST",
    // Land
    land: "LP",
    plot: "LP",
    "land plot": "LP",
    "residential land": "LP",
    "land residential": "LP",
    "land commercial": "LP",
    // Commercial
    office: "OF",
    offices: "OF",
    "office space": "OF",
    "full floor": "OF",
    "co-working space": "OF",
    shop: "SH",
    shops: "SH",
    retail: "SH",
    "retail space": "SH",
    warehouse: "WH",
    warehouses: "WH",
    factory: "WH",
    building: "BU",
    buildings: "BU",
    "full building": "BU",
    "commercial full building": "BU",
    "residential building": "BU",
    "bulk units": "BU",
    "commercial bulk unit": "BU",
    "labour camp": "BU",
    "labor camp": "BU",
    "business centre": "OF",
    "business center": "OF",
    showroom: "SH",
    showrooms: "SH",
    hotel: "HO",
    "hotel apartment": "HA",
    "residential full floor": "AP",
  };

  public static COMPLETION_STATUS_MAP: Record<string, string> = {
    "off plan": "off_plan",
    "off-plan": "off_plan",
    offplan: "off_plan",
    off_plan_primary: "off_plan",
    "off plan primary": "off_plan",
    off_plan_secondary: "off_plan",
    "off plan secondary": "off_plan",
    "under construction": "off_plan",
    ready: "completed",
    completed: "completed",
    completed_primary: "completed",
    "completed primary": "completed",
    "ready to move": "completed",
    "ready to move in": "completed",
    handover: "completed",
    // Some feeds provide publication state instead of completion state
    published: "completed",
    unpublished: "completed",
    // Common timeline phrases: normalize to off_plan
    "q4 2029": "off_plan",
    "q2 2028": "off_plan",
    "q4 2026": "off_plan",
    "q4 2025": "off_plan",
    "q1 2029 (expected)": "off_plan",
    "dec 2029": "off_plan",
    "march 2029": "off_plan",
    "december 2027": "off_plan",
    "june 2031 (100% construction completion)": "off_plan",
    "to be announced": "off_plan",
    "[to be confirmed]": "off_plan",
  };

  public static AMENITY_NAME_TO_CODE: Record<string, string> = {
    // Balcony
    balcony: "BA",
    balconies: "BA",
    // BBQ area
    "bbq area": "BQ",
    bbq: "BQ",
    "bbq seating area": "BQ",
    "bbq and lounging": "BQ",
    // Swimming pool
    "private swimming pool": "PS",
    "shared swimming pool": "SP",
    "swimming pool": "SP",
    pool: "SP",
    pools: "SP",
    // Security
    security: "SE",
    "24hr security": "SE",
    "24 hour security": "SE",
    "24-hour security": "SE",
    "24/7 security": "SE",
    "24/7": "SE",
    surveillance: "SE",
    cctv: "SE",
    "cctv surveillance": "SE",
    // Built-in Wardrobes
    "built-in wardrobes": "BW",
    "built in wardrobes": "BW",
    wardrobe: "BW",
    wardrobes: "BW",
    "built-in": "BW",
    "built in": "BW",
    // Gym / Fitness
    gym: "SY",
    gymnasium: "SY",
    "fully-equipped gym": "SY",
    "fully equipped gym": "SY",
    "fitness center": "SY",
    "fitness centre": "SY",
    "state-of-the-art fitness": "SY",
    "sports facility": "SY",
    sports: "SY",
    fitness: "SY",
    yoga: "SY",
    "yoga zone": "SY",
    // Lobby / lounge-ish
    lobby: "LB",
    "lobby in building": "LB",
    lounge: "LB",
    cafeteria: "LB",
    "lounging zones": "LB",
    // Parking
    "private parking": "PR",
    "basement parking": "CP",
    "covered parking": "CP",
    covered: "CP",
    "parking spaces": "CP",
    parking: "CP",
    "parking available": "CP",
    "public parking": "VS",
    "visitors parking": "VS",
    "visitor parking": "VS",
    visitors: "VS",
    // Garden
    garden: "GD",
    "private garden": "GD",
    "landscaped garden": "GD",
    "landscaped gardens": "GD",
    "walking paths": "GD",
    landscaping: "GD",
    // Views
    "garden view": "GV",
    "view of garden": "GV",
    "community view": "CV",
    community: "CV",
    "view of landmark": "VL",
    "landmark view": "VL",
    "city view": "CI",
    "view of city": "CI",
    "sea/water view": "WV",
    "sea view": "WV",
    "water view": "WV",
    // Misc common
    intercom: "IC",
    "kitchen white goods": "KW",
    "white goods": "KW",
    "built-in kitchen appliances": "KW",
    "built in kitchen appliances": "KW",
    "kitchen appliances": "KW",
    "fully fitted kitchen": "KF",
    "fully fitted": "KF",
    "fitted kitchen": "KF",
    jacuzzi: "JZ",
    sauna: "SA",
    "steam room": "SR",
    steam: "SR",
    basement: "BM",
    "beach access": "BX",
    beach: "BX",
    "cable-ready": "CB",
    "cable ready": "CB",
    "walk-in closet": "WI",
    "walk in closet": "WI",
    "walkin closet": "WI",
    // Kids / play
    "children's play area": "PA",
    "childrens play area": "PA",
    "play area": "PA",
    "children's play": "PA",
    "kids play area": "PA",
    "kids play": "PA",
    "play areas": "PA",
    "indoor play": "PA",
    "outdoor play": "PA",
    // Nearby
    "near school": "NS",
    "near schools": "NS",
    "near supermarket": "NU",
    "near supermarkets": "NU",
    "near super market": "NU",
    "near mosque": "MO",
    "near mosques": "MO",
    "near airport": "NA",
    "near airports": "NA",
    "near golf": "NG",
    "near golf course": "NG",
    "near hospital": "NH",
    "near hospitals": "NH",
    "near mall": "NM",
    "near malls": "NM",
    "near shopping mall": "NM",
    "near public transportation": "NT",
    "near public transport": "NT",
    "near metro": "NT",
    "near metro station": "NT",
    "near bus": "NT",
    "near bus station": "NT",
    "near restaurants": "NR",
    "near restaurant": "NR",
    dining: "NR",
    // Internet
    internet: "IN",
    wifi: "IN",
    "wi-fi": "IN",
    "high-speed internet": "IN",
    "high speed internet": "IN",
    "internet access": "IN",
    "wi-fi / dewa": "IN",
    // Elevator
    elevator: "EL",
    elevators: "EL",
    lift: "EL",
    lifts: "EL",
    "elevator access": "EL",
    "high-speed elevators": "EL",
    // Maintenance
    "24 hours maintenance": "MN",
    "24 hour maintenance": "MN",
    maintenance: "MN",
    // AC
    "central air conditioning": "AC",
    "central a/c": "AC",
    "a/c & heating": "AC",
    "air conditioning": "AC",
  };

  private addUnmapped(fieldName: string, value: string) {
    const entry = `${fieldName}: '${value}'`;
    if (!this.stats.unmappedValues.includes(entry)) this.stats.unmappedValues.push(entry);
  }

  private mapValue(value: string, mapping: Record<string, string>, fieldName: string): string {
    if (!value) return value;
    const key = value.toLowerCase().trim();
    const mapped = mapping[key];
    if (mapped) return mapped;

    // Pass through already-valid mapped codes
    const knownCodes = new Set(Object.values(mapping));
    if (knownCodes.has(value)) return value;

    this.addUnmapped(fieldName, value);
    return value;
  }

  public mapOfferingType(value: unknown): string {
    const s = String(value ?? "").trim();
    const mapped = this.mapValue(s, FieldMapper.OFFERING_TYPE_MAP, "offering_type");
    if (mapped !== s) this.stats.offeringTypesMapped++;
    return mapped;
  }

  public mapPropertyType(value: unknown): string {
    const s = String(value ?? "").trim();
    const mapped = this.mapValue(s, FieldMapper.PROPERTY_TYPE_MAP, "property_type");
    if (mapped !== s) this.stats.propertyTypesMapped++;
    return mapped;
  }

  public mapCompletionStatus(value: unknown): string {
    const s = String(value ?? "").trim();
    const mapped = this.mapValue(s, FieldMapper.COMPLETION_STATUS_MAP, "completion_status");
    if (mapped !== s) this.stats.completionStatusMapped++;
    return mapped;
  }

  // Converts amenity text/list → "BA, BW, SP" codes string.
  // If already looks like "BA, BW, SP", returns normalized spacing.
  public mapAmenitiesToCodes(text: unknown): string {
    if (text == null) return "";

    const codesRe = /^[A-Z]{2}(?:\s*,\s*[A-Z]{2})*$/;

    // Already a codes string like "BA, BW, SP"
    if (typeof text === "string") {
      const s = text.trim();
      if (s) {
        if (codesRe.test(s)) {
          return s
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean)
            .join(", ");
        }
      }
    }

    // Lists/tuples: each element is one amenity phrase (may contain commas)
    if (Array.isArray(text)) {
      const arr = text.map((x) => String(x ?? "").trim()).filter(Boolean);
      // If the feed already provides codes but split across nodes/values,
      // keep them (normalize to ", ").
      const flattened = arr
        .flatMap((s) => s.split(",").map((p) => p.trim()).filter(Boolean))
        .filter(Boolean);
      if (flattened.length && flattened.every((p) => /^[A-Z]{2}$/.test(p))) {
        return Array.from(new Set(flattened)).join(", ");
      }
    }

    const parts: string[] = Array.isArray(text)
      ? text.map((x) => String(x ?? "").trim()).filter(Boolean)
      : String(text).split(",").map((p) => p.trim()).filter(Boolean);

    if (!parts.length) return "";

    const sortedKw = Object.keys(FieldMapper.AMENITY_NAME_TO_CODE).sort((a, b) => b.length - a.length);
    const codes: string[] = [];
    const seen = new Set<string>();

    for (const part of parts) {
      const lower = part.toLowerCase();
      let matched: string | null = null;
      for (const kw of sortedKw) {
        if (lower.includes(kw) || (kw.includes(lower) && lower.length >= 3)) {
          matched = FieldMapper.AMENITY_NAME_TO_CODE[kw];
          break;
        }
      }
      if (matched && !seen.has(matched)) {
        codes.push(matched);
        seen.add(matched);
      }
    }

    return codes.join(", ");
  }
}

