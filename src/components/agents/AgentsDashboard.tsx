import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { ChartCard, Columns, HBars, Meter, SERIES, type SeriesDef } from "@/components/charts/ChartKit";
import type { AgentSummary } from "@/components/AgentCard";
import { summarizeAgents } from "@/components/AgentCard";
import { formatPriceCompact } from "@/lib/displayPrice";
import type { Listing } from "@/lib/types";

const SALE_RENT: SeriesDef[] = [
  { key: "sale", label: "Sale", color: SERIES[0] },
  { key: "rent", label: "Rent", color: SERIES[1] },
];
const LOAD_BANDS = [
  { label: "1", max: 1 },
  { label: "2–5", max: 5 },
  { label: "6–10", max: 10 },
  { label: "11–25", max: 25 },
  { label: "26–50", max: 50 },
  { label: "51–100", max: 100 },
  { label: "100+", max: Infinity },
];
const pct = (n: number) => `${Math.round(n)}%`;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-mono text-xl font-semibold tabular-nums">{value}</div>
        {hint && <div className="truncate text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

/**
 * Agent analytics for the current scope: who carries the inventory, how evenly it's spread,
 * how concentrated each agency is, and how complete agent contact details are.
 */
export function AgentsDashboard({
  agents,
  listings,
  listingsByAgency,
  agencyNames,
  profileHref,
  allAgencies,
}: {
  agents: AgentSummary[];
  listings: Listing[];
  listingsByAgency: Map<string, Listing[]>;
  agencyNames: string[];
  profileHref: (name: string) => string;
  allAgencies: boolean;
}) {
  const navigate = useNavigate();

  const d = useMemo(() => {
    const people = agents.filter((a) => !a.isAgencyAccount);
    const byCount = [...agents].sort((a, b) => b.count - a.count);
    const load = LOAD_BANDS.map((b) => ({ label: b.label, count: 0 }));
    for (const a of agents) load[LOAD_BANDS.findIndex((b) => a.count <= b.max)].count++;
    const withListings = listings.filter((l) => l.agent?.name?.trim());
    const share = (pred: (l: Listing) => boolean) => (withListings.length ? withListings.filter(pred).length / withListings.length : 0);
    const agencies = [...listingsByAgency.entries()]
      .filter(([name]) => name)
      .map(([name, ls]) => {
        const team = summarizeAgents(ls, agencyNames).sort((a, b) => b.count - a.count);
        const assigned = team.reduce((n, a) => n + a.count, 0);
        return {
          name,
          agents: team.length,
          topShare: assigned ? (team[0].count / assigned) * 100 : 0,
          topAgent: team[0]?.name ?? "",
          perAgent: team.length ? assigned / team.length : 0,
        };
      })
      .sort((a, b) => b.agents - a.agents);
    const priced = agents
      .filter((a) => a.medianSale && a.sale >= 3)
      .sort((a, b) => b.medianSale! - a.medianSale!)
      .slice(0, 12)
      .map((a) => ({ name: a.name, median: a.medianSale! }));
    return {
      people: people.length,
      agencyAccounts: agents.length - people.length,
      top: byCount.slice(0, 15).map((a) => ({ name: a.name, sale: a.sale, rent: a.rent })),
      load,
      avg: agents.length ? withListings.length / agents.length : 0,
      topShare: withListings.length && byCount[0] ? byCount[0].count / withListings.length : 0,
      topName: byCount[0]?.name ?? "",
      unassigned: listings.length - withListings.length,
      contact: { phone: share((l) => !!l.agent.phone?.trim()), email: share((l) => !!l.agent.email?.trim()), photo: share((l) => !!l.agent.photo?.trim()) },
      agencies,
      priced,
    };
  }, [agents, listings, listingsByAgency, agencyNames]);

  if (!agents.length) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Agents" value={d.people.toLocaleString()} hint={d.agencyAccounts ? `+ ${d.agencyAccounts} agency account(s)` : "people with listings"} />
        <Stat label="Listings per agent" value={d.avg.toFixed(1)} hint="average" />
        <Stat label="Largest share" value={pct(d.topShare * 100)} hint={d.topName} />
        <Stat label="Listings without agent" value={d.unassigned.toLocaleString()} hint={`of ${listings.length.toLocaleString()}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard
          title="Top agents"
          description="Listings per agent, split by purpose. Click a bar for the profile."
          legend={SALE_RENT}
          className="lg:col-span-2"
          table={{ columns: ["Agent", "Sale", "Rent", "Total"], rows: d.top.map((a) => [a.name, a.sale, a.rent, a.sale + a.rent]) }}
        >
          <HBars data={d.top} labelKey="name" series={SALE_RENT} onSelect={(r) => navigate(profileHref(String(r.name)))} />
        </ChartCard>
        <div className="space-y-6">
          <ChartCard
            title="Workload spread"
            description="Agents by number of listings."
            table={{ columns: ["Listings", "Agents"], rows: d.load.map((b) => [b.label, b.count]) }}
          >
            <Columns data={d.load} xKey="label" series={[{ key: "count", label: "Agents", color: SERIES[0] }]} height={180} />
          </ChartCard>
          <ChartCard
            title="Agent contact on listings"
            table={{
              columns: ["Field", "% of listings"],
              rows: [
                ["Phone", Math.round(d.contact.phone * 100)],
                ["Email", Math.round(d.contact.email * 100)],
                ["Photo", Math.round(d.contact.photo * 100)],
              ],
            }}
          >
            <div className="space-y-3">
              <Meter label="Phone" value={d.contact.phone} />
              <Meter label="Email" value={d.contact.email} />
              <Meter label="Photo" value={d.contact.photo} />
            </div>
          </ChartCard>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {allAgencies && d.agencies.length > 1 && (
          <ChartCard
            title="Concentration by agency"
            description="Share of each agency's listings held by its busiest agent. High values usually mean listings are assigned to one account."
            table={{
              columns: ["Agency", "Agents", "Top agent", "Top agent share %", "Listings per agent"],
              rows: d.agencies.map((a) => [a.name, a.agents, a.topAgent, Math.round(a.topShare), Number(a.perAgent.toFixed(1))]),
            }}
          >
            <HBars
              data={d.agencies.map((a) => ({ name: a.name, share: a.topShare }))}
              labelKey="name"
              series={[{ key: "share", label: "Top agent share", color: SERIES[0] }]}
              valueFormat={pct}
              max={100}
              onSelect={(r) => navigate(`/agencies/${encodeURIComponent(String(r.name))}`)}
            />
          </ChartCard>
        )}
        <ChartCard
          title="Highest median sale price"
          description="Agents with at least 3 sale listings."
          table={{ columns: ["Agent", "Median sale (AED)"], rows: d.priced.map((a) => [a.name, a.median]) }}
        >
          <HBars
            data={d.priced}
            labelKey="name"
            series={[{ key: "median", label: "Median sale", color: SERIES[0] }]}
            valueFormat={(n) => (n ? formatPriceCompact(n) : "0")}
            onSelect={(r) => navigate(profileHref(String(r.name)))}
          />
        </ChartCard>
      </div>
    </div>
  );
}
