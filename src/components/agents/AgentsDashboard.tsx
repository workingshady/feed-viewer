import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, AlertTriangle, ChevronDown, Info } from "lucide-react";
import { ChartCard, Columns, Donut, HBars, Heatmap, Meter, SERIES, type SeriesDef } from "@/components/charts/ChartKit";
import { AGENT_FIELDS, agentFieldCoverage, agentIssues, agentSpecialisation, type AgentIssue } from "@/lib/agentDataQuality";
import { cn } from "@/lib/utils";
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
          coverage: agentFieldCoverage(team),
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
      coverage: agentFieldCoverage(agents),
      issues: agentIssues(agents),
      spec: agentSpecialisation(agents),
    };
  }, [agents, listings, listingsByAgency, agencyNames]);

  if (!agents.length) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Agents" value={d.people.toLocaleString()} hint={d.agencyAccounts ? `+ ${d.agencyAccounts} agency account(s)` : "people with listings"} />
        <Stat label="Listings per agent" value={d.avg.toFixed(1)} hint="average" />
        <Stat label="Largest share" value={pct(d.topShare * 100)} hint={d.topName} />
        <Stat label="With licence (BRN)" value={pct(d.coverage.licenseNo * 100)} hint="of agents" />
        <Stat label="Listings without agent" value={d.unassigned.toLocaleString()} hint={`of ${listings.length.toLocaleString()}`} />
        <Stat
          label="Agent data issues"
          value={d.issues.filter((i) => i.severity !== "info").reduce((n, i) => n + i.agents.length, 0).toLocaleString()}
          hint="errors and warnings"
        />
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
            title="Profile completeness"
            description="Share of agents with each field filled."
            table={{ columns: ["Field", "% of agents"], rows: AGENT_FIELDS.map((f) => [f.label, Math.round(d.coverage[f.key] * 100)]) }}
          >
            <div className="space-y-3">
              {AGENT_FIELDS.map((f) => (
                <Meter key={f.key} label={f.label} value={d.coverage[f.key]} />
              ))}
              <p className="text-[11px] text-muted-foreground">
                On listings: phone {pct(d.contact.phone * 100)} · email {pct(d.contact.email * 100)} · photo {pct(d.contact.photo * 100)}
              </p>
            </div>
          </ChartCard>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <ChartCard
          title="Agent data issues"
          description="Problems in agent profiles that portals reject or that lose leads. Open a row to see who."
          className="lg:col-span-2"
          table={{
            columns: ["Issue", "Severity", "Agents", "Names"],
            rows: d.issues.map((i) => [i.label, i.severity, i.agents.length, i.agents.join(" | ")]),
          }}
        >
          <IssueList issues={d.issues} onAgent={(n) => navigate(profileHref(n))} />
        </ChartCard>
        <ChartCard
          title="Sale or rent focus"
          table={{
            columns: ["Focus", "Agents"],
            rows: [
              ["Sale only", d.spec.sale],
              ["Rent only", d.spec.rent],
              ["Both", d.spec.both],
            ],
          }}
        >
          <Donut
            centerLabel="agents"
            data={[
              { label: "Sale only", value: d.spec.sale, color: SERIES[0] },
              { label: "Rent only", value: d.spec.rent, color: SERIES[1] },
              { label: "Both", value: d.spec.both, color: SERIES[2] },
            ]}
          />
        </ChartCard>
      </div>

      {allAgencies && d.agencies.length > 1 && (
        <ChartCard
          title="Profile completeness by agency"
          description="Share of each agency's agents with the field filled. Click an agency to open it."
          table={{
            columns: ["Agency", ...AGENT_FIELDS.map((f) => f.label)],
            rows: d.agencies.map((a) => [a.name, ...AGENT_FIELDS.map((f) => Math.round(a.coverage[f.key] * 100))]),
          }}
        >
          <Heatmap
            rows={d.agencies.map((a) => a.name)}
            columns={AGENT_FIELDS.map((f) => ({ key: f.key, label: f.label }))}
            value={(row, col) => d.agencies.find((a) => a.name === row)?.coverage[col as keyof typeof d.coverage] ?? null}
            onRow={(n) => navigate(`/agencies/${encodeURIComponent(n)}`)}
          />
        </ChartCard>
      )}

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

const SEVERITY = {
  error: { icon: AlertCircle, cls: "text-destructive-text", label: "Error" },
  warning: { icon: AlertTriangle, cls: "text-warning", label: "Warning" },
  info: { icon: Info, cls: "text-muted-foreground", label: "Info" },
} as const;

function IssueList({ issues, onAgent }: { issues: AgentIssue[]; onAgent: (name: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!issues.length) return <p className="py-6 text-center text-sm text-muted-foreground">No agent data issues found.</p>;
  return (
    <ul className="divide-y rounded-md border">
      {issues.map((i) => {
        const S = SEVERITY[i.severity];
        const isOpen = open === i.key;
        return (
          <li key={i.key}>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i.key)}
            >
              <S.icon className={cn("h-4 w-4 shrink-0", S.cls)} aria-label={S.label} />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{i.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{i.hint}</span>
              </span>
              <span className="font-mono tabular-nums">{i.agents.length}</span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div className="flex flex-wrap gap-1.5 px-3 pb-3 pl-10">
                {i.agents.slice(0, 60).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onAgent(n)}
                    className="rounded-md border px-2 py-0.5 text-xs hover:border-primary/50 hover:bg-muted/50"
                  >
                    {n}
                  </button>
                ))}
                {i.agents.length > 60 && <span className="text-xs text-muted-foreground">+{i.agents.length - 60} more in the CSV</span>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
