import { describe, expect, it } from "vitest";
import { parseXmlString } from "@/lib/xmlParser";
import { checkFeed, completenessDelta, shapeOf } from "@/lib/feedValidation";
import { extractPropertyXml, indexPropertyXml } from "@/hooks/useListingRawXml";

const prop = (ref: string, offering: string, price: string) => `
  <property last_update="2026-10-01 10:00:00">
    <reference_number><![CDATA[${ref}]]></reference_number>
    <offering_type><![CDATA[${offering}]]></offering_type>
    <property_type><![CDATA[AP]]></property_type>
    <price_on_application>No</price_on_application>
    ${price}
    <city><![CDATA[Dubai]]></city>
    <community><![CDATA[Dubai Marina]]></community>
    <title_en><![CDATA[Flat ${ref}]]></title_en>
    <bedroom>2</bedroom>
    <geopoints><![CDATA[25.08,55.14]]></geopoints>
    <photo><url><![CDATA[https://x/1.jpg]]></url></photo>
  </property>`;

const feed = (...props: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<list><metadata><currency code="AED">UAE Dirham</currency></metadata>
<agency><company_name><![CDATA[Test Agency]]></company_name></agency>
<properties>${props.join("")}</properties></list>`;

describe("ZibaAi enriched XML", () => {
  const r = parseXmlString(
    feed(
      prop("TA-R-00001", "RR", "<price><yearly>120000</yearly></price>"),
      prop("TA-R-00002", "RR", "<price><monthly>9000</monthly></price>"),
      prop("TA-S-00003", "CS", "<price>2500000</price>"),
      prop("TA-S-00003", "RS", "<price>40000</price>"),
    ),
  );

  it("reads period-nested rent prices and commercial sale codes", () => {
    const [yearly, monthly, cs] = r.listings;
    expect(yearly).toMatchObject({ price: 120000, rentPeriod: "yearly", purpose: "rent" });
    expect(monthly).toMatchObject({ price: 9000, rentPeriod: "monthly", purpose: "rent" });
    expect(cs.purpose).toBe("sale");
    expect(r.warnings.filter((w) => w.includes("missing price"))).toEqual([]);
  });

  it("groups problems by rule and gates the feed", () => {
    const c = checkFeed(r.listings);
    const codes = Object.fromEntries(c.issues.map((i) => [i.code, i.count]));
    expect(codes.duplicate_reference).toBe(2);
    expect(codes.price_too_low).toBe(1);
    expect(c.rentPeriods).toEqual({ yearly: 1, monthly: 1 });
    expect(c.gate).toBe("fail");
  });

  it("finds a listing's raw XML in the original feed", () => {
    const xml = feed(prop("TA-R-00001", "RR", "<price>1</price>"), prop("TA-R-00002", "RR", "<price>2</price>"));
    expect(extractPropertyXml(xml, "TA-R-00002")).toContain("Flat TA-R-00002");
    expect([...indexPropertyXml(xml).keys()]).toEqual(["TA-R-00001", "TA-R-00002"]);
  });

  it("profiles reference shapes and flags completeness drops", () => {
    expect(shapeOf("DP-S-64142")).toBe("A{2}-A-9{5}");
    const drop = completenessDelta(r.listings, r.listings.map((l) => ({ ...l, latitude: null })));
    expect(drop.find((d) => d.field === "Map location")).toMatchObject({ before: 1, after: 0, flagged: true });
  });
});
