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

describe("agent reports (ZibaAi format)", () => {
  it("groups listings by agent with totals, codes and references", async () => {
    const { agentsJson, agentsReportJson } = await import("@/lib/versionReports");
    const xml = feed(
      prop("TA-R-00001", "RR", "<price><yearly>120000</yearly></price>").replace(
        "</property>",
        "<agent><name>Sara</name><email>sara@x.ae</email><phone>+971500</phone><license_no>123</license_no><info>Advisor</info></agent></property>",
      ),
      prop("TA-S-00002", "CS", "<price>2500000</price>").replace("</property>", "<agent><name>Sara</name><email>SARA@x.ae</email></agent></property>"),
      prop("TA-S-00003", "RS", "<price>900000</price>"),
    );
    const listings = parseXmlString(xml).listings;
    const source = { name: "Test", agencyName: "Test Agency", agencyInfo: { name: "Test Agency" } } as never;
    const version = { number: 3, fileName: "f.xml", createdAt: "2026-10-23T00:00:00Z" } as never;
    const report = agentsReportJson(source, version, listings);
    expect(report.totals).toMatchObject({
      total_agents: 1,
      total_listings: 3,
      listings_attributed: 2,
      listings_unattributed: 1,
      by_offering_type: { RR: 1, CS: 1, RS: 1 },
      by_property_type: { AP: 3 },
    });
    expect(report.agents[0]).toMatchObject({ name: "Sara", license_no: "123", info: "Advisor", listing_count: 2, reference_numbers: ["TA-R-00001", "TA-S-00002"] });
    expect(agentsJson(source, version, listings).agents[0]).not.toHaveProperty("listings");
  });
});

describe("agent concentration", () => {
  it("warns when one agent holds most of a large feed", () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      prop(`TA-S-${String(i).padStart(5, "0")}`, "RS", "<price>1500000</price>").replace("</property>", "<agent><name>Default Agent</name><email>info@x.ae</email></agent></property>"),
    );
    const c = checkFeed(parseXmlString(feed(...many)).listings);
    expect(c.issues.find((i) => i.code === "agent_concentration")).toMatchObject({ severity: "warning", count: 120 });
  });
});

describe("Ziba import checks", () => {
  const base = { ...checkFeedBase() };
  function checkFeedBase() {
    return {
      id: "x",
      reference: "R-1",
      title: "t",
      description: "d".repeat(250),
      price: 1_000_000,
      priceOnApplication: "",
      purpose: "sale" as const,
      propertyType: "Apartment",
      city: "Dubai",
      community: "Marina",
      currency: "AED",
      images: ["https://img/1.jpg"],
      agent: { name: "A", phone: "1", email: "a@x.ae", photo: "" },
    };
  }
  const L = (o: Record<string, unknown>) => ({ ...base, ...o }) as unknown as Parameters<typeof checkFeed>[0][number];

  it("forecasts POA, expiring images and missing photos as held back", () => {
    const r = checkFeed([
      L({ reference: "A" }),
      L({ reference: "B", priceOnApplication: "Yes", price: 0 }),
      L({ reference: "C", images: ["https://b.s3.amazonaws.com/p.jpg?X-Amz-Expires=3600&X-Amz-Signature=abc"] }),
      L({ reference: "D", images: [] }),
    ]);
    expect(r.forecast?.publishable).toBe(1);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["poa_not_published", "expiring_image_urls", "small_feed"]));
  });

  it("reports agents merged by a shared email", () => {
    const r = checkFeed([
      L({ reference: "A", agent: { name: "Ann", email: "info@x.ae", phone: "1", photo: "" } }),
      L({ reference: "B", agent: { name: "Bob", email: "info@x.ae", phone: "1", photo: "" } }),
    ]);
    expect(r.issues.find((i) => i.code === "agents_share_email")?.title).toBe("2 agents become 1 profile on import");
  });
});
