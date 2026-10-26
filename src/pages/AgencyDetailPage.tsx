import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Building2, Search, Users, LayoutGrid, Settings2, BarChart3 } from "lucide-react";
import { AgentPhoto } from "@/components/AgentPhoto";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import PropertyCard from "@/components/PropertyCard";
import { useAppData } from "@/providers/DataProvider";
import { useFavorites } from "@/hooks/usePrefs";
import { useLiveVersionStatus } from "@/hooks/useLiveVersionStatus";
import { COMPARE_UPDATED_EVENT, getCompareListingIds } from "@/lib/compareSelection";
import ListingAnalyticsDashboard from "@/components/analytics/ListingAnalyticsDashboard";
import { AgencyLogo } from "@/components/AgencyLogo";
import { AgentCard, summarizeAgents, usePaged } from "@/components/AgentCard";

type AgentRow = {
  name: string;
  count: number;
  phone?: string;
  email?: string;
  photo?: string;
};

const AgencyDetailPage = () => {
  const { name } = useParams<{ name: string }>();
  const agencyName = useMemo(() => decodeURIComponent(name || ""), [name]);
  const { listingsByAgency, setScope, sources } = useAppData();
  const { ids: favoritesSet } = useFavorites();
  const [compareTick, setCompareTick] = useState(0);

  useEffect(() => {
    const onCmp = () => setCompareTick((x) => x + 1);
    window.addEventListener(COMPARE_UPDATED_EVENT, onCmp);
    return () => window.removeEventListener(COMPARE_UPDATED_EVENT, onCmp);
  }, []);

  const compareSet = useMemo(() => new Set(getCompareListingIds()), [compareTick]);

  const source = useMemo(() => sources.find((x) => x.name === agencyName) ?? null, [sources, agencyName]);
  const agencyLogo = source?.agencyInfo?.logo || null;

  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"agents" | "listings" | "analysis">("agents");

  const listings = useMemo(() => listingsByAgency.get(agencyName) ?? [], [listingsByAgency, agencyName]);

  const filteredListings = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return listings;
    return listings.filter((l) => {
      return (
        (l.title || "").toLowerCase().includes(query) ||
        (l.community || "").toLowerCase().includes(query) ||
        (l.reference || "").toLowerCase().includes(query) ||
        (l.propertyName || "").toLowerCase().includes(query) ||
        (l.agent?.name || "").toLowerCase().includes(query)
      );
    });
  }, [listings, q]);

  const agents = useMemo(() => {
    const arr = summarizeAgents(listings, [agencyName, source?.agencyName ?? ""]).sort((a, b) => b.count - a.count);
    const query = q.trim().toLowerCase();
    return !query ? arr : arr.filter((a) => a.name.toLowerCase().includes(query));
  }, [listings, q, agencyName, source?.agencyName]);
  const pagedAgents = usePaged(agents);
  const pagedListings = usePaged(filteredListings, 24);

  const statusById = useLiveVersionStatus(source, listings);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <Button asChild variant="ghost" size="sm">
            <Link to="/agencies"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Agencies</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setScope({ mode: "agency", agencyName })}
              title="Use this agency as your active dataset"
            >
              Use this agency
            </Button>
            {source ? (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to={`/sources?source=${source.id}`}>
                  <Settings2 className="w-4 h-4" />
                  Manage source
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <AgencyLogo src={agencyLogo} name={agencyName} className="h-14 w-24 rounded-xl text-sm" />
              <div className="min-w-0">
                <h1 className="text-2xl font-extrabold font-heading text-foreground truncate">
                  {agencyName}
                </h1>
                <div className="text-sm text-muted-foreground mt-1">
                  {listings.length} listings • {agents.length} agents
                </div>
              </div>
            </div>
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search listings or agents…" className="pl-10" />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant={tab === "agents" ? "default" : "outline"} size="sm" onClick={() => setTab("agents")} className="gap-2">
              <Users className="w-4 h-4" /> Agents (people)
            </Button>
            <Button variant={tab === "listings" ? "default" : "outline"} size="sm" onClick={() => setTab("listings")} className="gap-2">
              <LayoutGrid className="w-4 h-4" /> Listings
            </Button>
            <Button variant={tab === "analysis" ? "default" : "outline"} size="sm" onClick={() => setTab("analysis")} className="gap-2">
              <BarChart3 className="w-4 h-4" /> Analysis
            </Button>
          </div>
        </div>

        {source && source.versions.length > 0 && (
          <Card className="p-5 mb-6">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-sm font-semibold text-foreground">Version history</div>
              <Button asChild variant="ghost" size="sm">
                <Link to={`/sources?source=${source.id}`}>Manage source</Link>
              </Button>
            </div>
            <div className="divide-y divide-border text-sm">
              {source.versions.map((v) => (
                <div key={v.id} className="py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-semibold text-foreground">
                    v{v.number}
                    {v.id === source.activeVersionId ? " (live)" : ""}
                  </span>
                  <span className="text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</span>
                  <span className="text-muted-foreground">{v.listingCount.toLocaleString()} listings</span>
                  <span className="text-muted-foreground">
                    +{v.added} / −{v.removed} / ~{v.changed}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {tab === "analysis" ? (
          <ListingAnalyticsDashboard
            listings={listings}
            contextTitle={agencyName}
            contextSubtitle={`Full property intelligence for ${agencyName}: pricing curves, inventory mix, geography, and agent workload — powered by the live feed version.`}
            showAgentWorkload
          />
        ) : tab === "agents" ? (
          agents.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">No agent people found in this agency feed.</Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {pagedAgents.visible.map((a) => (
                  <AgentCard
                    key={`${a.name}:${a.email}`}
                    agent={a}
                    href={`/agencies/${encodeURIComponent(agencyName)}/agents/${encodeURIComponent(a.name)}`}
                    showAgency={false}
                  />
                ))}
              </div>
              {pagedAgents.more}
            </>
          )
        ) : (
          filteredListings.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">No listings match.</Card>
          ) : (
            <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {pagedListings.visible.map((l) => (
                <PropertyCard
                  key={l.id}
                  listing={l}
                  highlightQuery={q.trim()}
                  status={statusById.get(l.id)}
                  isFavorite={favoritesSet.has(l.id)}
                  inCompare={compareSet.has(l.id)}
                />
              ))}
            </div>
            {pagedListings.more}
            </>
          )
        )}
      </div>
    </div>
  );
};

export default AgencyDetailPage;

