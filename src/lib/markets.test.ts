import { describe, expect, it } from "vitest";
import { checkFeed } from "@/lib/feedValidation";
import { annualRent, dominantMarket, marketCodeOf, marketOf, rentPeriodMisread } from "@/lib/markets";
import type { Listing } from "@/lib/types";
import { parseXmlString, splitListingBlocks } from "@/lib/xmlParser";

const prop = (ref: string, price: string, extra = "") => `
  <property last_update="2026-09-01 10:00:00">
    <reference_number><![CDATA[${ref}]]></reference_number>
    <offering_type><![CDATA[RR]]></offering_type>
    <property_type><![CDATA[AP]]></property_type>
    ${price}
    <city><![CDATA[Singapore]]></city>
    <community><![CDATA[Bukit Timah]]></community>
    <property_name><![CDATA[The Tembusu]]></property_name>
    <description_en><![CDATA[Bright two-bedroom unit near the MRT.]]></description_en>
    <size><![CDATA[850]]></size>
    <bedroom><![CDATA[2]]></bedroom>
    <photo><url><![CDATA[https://x.test/a.jpg]]></url></photo>
    <geopoints><![CDATA[1.33,103.80]]></geopoints>
    ${extra}
  </property>`;

const feed = (props: string, country = '<country code="SG">Singapore</country><currency code="SGD">Singapore Dollar</currency>') =>
  `<?xml version="1.0" encoding="UTF-8"?><list xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" listing_count="2"><metadata>${country}<area_unit>sqft</area_unit></metadata><agency><company_name><![CDATA[ERA]]></company_name></agency><properties>${props}</properties></list>`;

describe("markets", () => {
  it("resolves codes, names and aliases", () => {
    expect(marketCodeOf("SG")).toBe("SG");
    expect(marketCodeOf("Malaysia")).toBe("MY");
    expect(marketCodeOf("UAE - United Arab Emirates")).toBe("AE");
    expect(marketCodeOf("France")).toBeNull();
    expect(marketOf({ country: "", currency: "PKR" }).code).toBe("PK");
    expect(marketOf({ country: "", currency: "" }).code).toBe("AE");
  });

  it("reads a rent without a period in its market's usual period", () => {
    const sg = { purpose: "rent", price: 4500, rentPeriod: "", country: "SG", currency: "SGD" } as Listing;
    expect(annualRent(sg)).toBe(54_000);
    expect(rentPeriodMisread(sg)).toBe(true);
    const ae = { purpose: "rent", price: 120_000, rentPeriod: "", country: "AE", currency: "AED" } as Listing;
    expect(annualRent(ae)).toBe(120_000);
    expect(rentPeriodMisread(ae)).toBe(false);
  });
});

describe("chunked feed parsing", () => {
  it("splits listings without matching <property_type> or <property_name>", () => {
    const { head, blocks } = splitListingBlocks(feed(prop("A", "<price>1</price>") + prop("B", "<price>2</price>")), "property");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("<reference_number><![CDATA[A]]>");
    expect(head).toContain("<metadata>");
  });

  it("sets the market per listing and keeps nested rent periods", () => {
    const r = parseXmlString(feed(prop("A", "<price><monthly><![CDATA[3200]]></monthly></price>") + prop("B", "<price><![CDATA[4500]]></price>", "<country><![CDATA[Malaysia]]></country><state><![CDATA[Selangor]]></state>")));
    expect(r.market).toBe("SG");
    expect(r.listings.map((l) => [l.country, l.rentPeriod, l.currency])).toEqual([
      ["SG", "monthly", "SGD"],
      ["MY", "", "SGD"],
    ]);
    expect(r.listings[1].state).toBe("Selangor");
  });

  it("skips a malformed listing instead of failing the file", () => {
    const r = parseXmlString(feed(prop("A", "<price>1</price>") + prop("B", "<price>2</price>", "<broken>") + prop("C", "<price>3</price>")));
    expect(r.success).toBe(true);
    expect(r.listings.map((l) => l.reference)).toEqual(["A", "C"]);
    expect(r.warnings[0]).toMatch(/1 listing\(s\) had malformed XML/);
  });

  it("flags monthly-market rents sent without a period", () => {
    const r = parseXmlString(feed(prop("A", "<price><![CDATA[4500]]></price>") + prop("B", "<price><monthly>3200</monthly></price>")));
    const issue = checkFeed(r.listings).issues.find((i) => i.code === "rent_period_misread");
    expect(issue?.count).toBe(1);
    expect(issue?.severity).toBe("error");
    expect(dominantMarket(r.listings).currency).toBe("SGD");
  });
});
