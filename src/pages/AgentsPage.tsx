import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentsDashboard } from "@/components/agents/AgentsDashboard";
import { Download, Search, Users } from "lucide-react";
import { AgentPhoto } from "@/components/AgentPhoto";
import AppHeader from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { useAppData } from "@/providers/DataProvider";
import type { Listing } from "@/lib/types";
import { AgentCard, summarizeAgents, usePaged } from "@/components/AgentCard";
import { downloadText } from "@/components/sources/format";
import { toCsv } from "@/lib/reports";

type SortKey = "count_desc" | "count_asc" | "name_asc" | "avg_price_desc";

function safeNum(n: number) {
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(n: number) {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 100_000) return `${Math.round(n / 1000)}K`;
  return n.toLocaleString();
}

const ALL_AGENCIES = "__all__";

const AgentsPage = () => {
  const { listingsByAgency } = useAppData();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("count_desc");
  const [agencyKey, setAgencyKey] = useState<string>(ALL_AGENCIES);

  const agencyNames = useMemo(
    () =>
      Array.from(listingsByAgency.keys())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [listingsByAgency],
  );

  const sourceListings = useMemo((): Listing[] => {
    if (agencyKey === ALL_AGENCIES) {
      const all: Listing[] = [];
      for (const arr of listingsByAgency.values()) all.push(...arr);
      return all;
    }
    return listingsByAgency.get(agencyKey) ?? [];
  }, [agencyKey, listingsByAgency]);

  const allAgents = useMemo(
    () => summarizeAgents(sourceListings, agencyNames),
    [sourceListings, agencyNames],
  );
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "directory" ? "directory" : "dashboard";
  const setView = (v: string) =>
    setParams(
      (p) => {
        p.set("view", v);
        return p;
      },
      { replace: true },
    );

  const agents = useMemo(() => {
    const arr = [...allAgents];
    const query = q.trim().toLowerCase();
    const filtered = !query
      ? arr
      : arr.filter(
          (a) =>
            a.name.toLowerCase().includes(query) ||
            a.topCommunities.join(" ").toLowerCase().includes(query),
        );
    filtered.sort((a, b) => {
      switch (sort) {
        case "count_asc":
          return a.count - b.count;
        case "name_asc":
          return a.name.localeCompare(b.name);
        case "avg_price_desc":
          return (b.medianSale ?? 0) - (a.medianSale ?? 0);
        default:
          return b.count - a.count;
      }
    });
    return filtered;
  }, [allAgents, q, sort]);
  const paged = usePaged(agents);

  const exportCsv = () => {
    const csv = toCsv(
      [
        "name",
        "email",
        "phone",
        "listings",
        "sale",
        "rent",
        "median_sale",
        "top_communities",
        "listings_without_phone",
        "listings_without_email",
      ],
      agents.map((a) => [
        a.name,
        a.email,
        a.phone,
        a.count,
        a.sale,
        a.rent,
        a.medianSale ?? "",
        a.topCommunities.join(" | "),
        a.missingPhone,
        a.missingEmail,
      ]),
    );
    downloadText(
      `agents-${agencyKey === ALL_AGENCIES ? "all-sources" : agencyKey}.csv`,
      csv,
    );
  };

  const profileHref = (agentName: string) =>
    agencyKey === ALL_AGENCIES
      ? `/agents/${encodeURIComponent(agentName)}`
      : `/agencies/${encodeURIComponent(agencyKey)}/agents/${encodeURIComponent(agentName)}`;

  const noAgents = (
    <Card className="p-10 text-center">
      <div className="mb-2 text-lg font-bold text-foreground">
        No agent data found
      </div>
      <div className="mb-5 text-sm text-muted-foreground">
        Upload a feed that contains agent details (name, phone, email, photo),
        or pick another agency.
      </div>
      <Button asChild>
        <Link to="/sources">Go to Sources</Link>
      </Button>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold font-heading text-foreground flex items-center gap-2">
              <Users className="w-6 h-6 text-primary-text" /> Agents
            </h1>
            <p className="text-sm text-muted-foreground">
              {allAgents.length.toLocaleString()} agents in the live feeds
              {agencyKey === ALL_AGENCIES
                ? " across every agency"
                : ` at ${agencyKey}`}
              . Pick an agency to focus on its team.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Select value={agencyKey} onValueChange={setAgencyKey}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_AGENCIES}>All agencies</SelectItem>
                {agencyNames.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {view === "directory" && (
              <>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search agents or communities…"
                    className="pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={exportCsv}
                  disabled={agents.length === 0}
                >
                  <Download className="mr-1.5 h-4 w-4" /> CSV
                </Button>
                <Select
                  value={sort}
                  onValueChange={(v) => setSort(v as SortKey)}
                >
                  <SelectTrigger className="w-full sm:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="count_desc">Most listings</SelectItem>
                    <SelectItem value="count_asc">Fewest listings</SelectItem>
                    <SelectItem value="avg_price_desc">
                      Highest median sale price
                    </SelectItem>
                    <SelectItem value="name_asc">Name A → Z</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </div>

        <Tabs value={view} onValueChange={setView}>
          <TabsList className="mb-4">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="directory">Directory</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard">
            {allAgents.length === 0 ? (
              noAgents
            ) : (
              <AgentsDashboard
                agents={allAgents}
                listings={sourceListings}
                listingsByAgency={listingsByAgency}
                agencyNames={agencyNames}
                profileHref={profileHref}
                allAgencies={agencyKey === ALL_AGENCIES}
              />
            )}
          </TabsContent>
          <TabsContent value="directory">
            {agents.length === 0 ? (
              q ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No agents match "{q}".
                </p>
              ) : (
                noAgents
              )
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {paged.visible.map((a) => (
                    <AgentCard
                      key={`${agencyKey}:${a.name}:${a.email}`}
                      agent={a}
                      href={profileHref(a.name)}
                    />
                  ))}
                </div>
                {paged.more}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AgentsPage;
