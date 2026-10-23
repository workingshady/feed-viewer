import { describe, expect, it } from "vitest";
import type { AgentSummary } from "@/components/AgentCard";
import { agentFieldCoverage, agentIssues } from "./agentDataQuality";

const agent = (o: Partial<AgentSummary>): AgentSummary => ({
  name: "A",
  photo: "",
  phone: "",
  email: "",
  licenseNo: "",
  agentId: "",
  info: "",
  count: 1,
  sale: 1,
  rent: 0,
  medianSale: null,
  topCommunities: [],
  missingPhone: 0,
  missingEmail: 0,
  isAgencyAccount: false,
  ...o,
});

describe("agentIssues", () => {
  it("flags bad emails, phones, licences and shared licences", () => {
    const issues = agentIssues([
      agent({ name: "Ann", email: "ann@x", phone: "12", licenseNo: "BRN 12345" }),
      agent({ name: "Bob", email: "bob@agency.ae", phone: "+971 50 123 4567", licenseNo: "12345" }),
      agent({ name: "Cy", licenseNo: "ABC" }),
    ]);
    const by = Object.fromEntries(issues.map((i) => [i.key, i.agents]));
    expect(by.invalid_email).toEqual(["Ann"]);
    expect(by.invalid_phone).toEqual(["Ann"]);
    expect(by.invalid_licence).toEqual(["Cy"]);
    expect(by.shared_licence?.sort()).toEqual(["Ann", "Bob"]);
    expect(by.missing_licence).toBeUndefined();
  });

  it("measures coverage on people only", () => {
    const c = agentFieldCoverage([agent({ licenseNo: "1234" }), agent({}), agent({ isAgencyAccount: true, licenseNo: "9" })]);
    expect(c.licenseNo).toBe(0.5);
  });
});
