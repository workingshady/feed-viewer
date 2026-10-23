import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  User,
  Phone,
  Mail,
  LayoutGrid,
  Building2,
  TrendingUp,
  Image as ImageIcon,
  Users,
  LineChart,
  Layers,
} from "lucide-react";
import { AgentPhoto } from "@/components/AgentPhoto";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PropertyCard from "@/components/PropertyCard";
import { useAppData } from "@/providers/DataProvider";
import ListingAnalyticsDashboard from "@/components/analytics/ListingAnalyticsDashboard";
import { formatAnalyticsMoney } from "@/lib/listingAnalytics";
import { useFavorites } from "@/hooks/usePrefs";
import { useLiveVersionStatus } from "@/hooks/useLiveVersionStatus";
import { COMPARE_UPDATED_EVENT, getCompareListingIds } from "@/lib/compareSelection";

function safeNum(n: number) {
  return Number.isFinite(n) ? n : 0;
}

const AgencyAgentDetailPage = () => {
  const { agency, agent } = useParams<{ agency: string; agent: string }>();
  const agencyName = useMemo(() => decodeURIComponent(agency || ""), [agency]);
  const agentName = useMemo(() => decodeURIComponent(agent || ""), [agent]);
  const { listingsByAgency, sources } = useAppData();
  const { ids: favoritesSet } = useFavorites();

  const [q, setQ] = useState("");
  const [compareTick, setCompareTick] = useState(0);

  useEffect(() => {
    const onCmp = () => setCompareTick((x) => x + 1);
    window.addEventListener(COMPARE_UPDATED_EVENT, onCmp);
    return () => window.removeEventListener(COMPARE_UPDATED_EVENT, onCmp);
  }, []);

  const baseListings = useMemo(() => listingsByAgency.get(agencyName) ?? [], [listingsByAgency, agencyName]);

  const agentScopeListings = useMemo(
    () => baseListings.filter((l) => (l.agent?.name || "").trim() === agentName),
    [baseListings, agentName],
  );

  const listings = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return agentScopeListings;
    return agentScopeListings.filter((l) => {
      return (
        (l.title || "").toLowerCase().includes(query) ||
        (l.community || "").toLowerCase().includes(query) ||
        (l.reference || "").toLowerCase().includes(query) ||
        (l.propertyName || "").toLowerCase().includes(query)
      );
    });
  }, [agentScopeListings, q]);

  const source = useMemo(() => sources.find((x) => x.name === agencyName) ?? null, [sources, agencyName]);
  const statusById = useLiveVersionStatus(source, baseListings);

  const compareSet = useMemo(() => new Set(getCompareListingIds()), [compareTick]);

  const agentInfo = useMemo(() => {
    const hit = baseListings.find((l) => (l.agent?.name || "").trim() === agentName);
    return hit?.agent ?? { name: agentName, phone: "", email: "", photo: "" };
  }, [baseListings, agentName]);

  const stats = useMemo(() => {
    let sale = 0;
    let rent = 0;
    let sumPrice = 0;
    let priced = 0;
    const communities = new Map<string, number>();
    for (const l of agentScopeListings) {
      if (l.purpose === "sale") sale++;
      if (l.purpose === "rent") rent++;
      if (l.price) {
        sumPrice += safeNum(l.price);
        priced++;
      }
      const c = (l.community || "").trim();
      if (c) communities.set(c, (communities.get(c) ?? 0) + 1);
    }
    const top = Array.from(communities.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([n]) => n);
    return { sale, rent, avgPrice: priced ? sumPrice / priced : 0, top };
  }, [agentScopeListings]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/agencies/${encodeURIComponent(agencyName)}`}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Agency
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-2 shrink-0">
            <Link to={`/agents/${encodeURIComponent(agentName)}`}>
              <Users className="w-4 h-4" />
              Open global profile (all agencies)
            </Link>
          </Button>
        </div>

        <div className="rounded-2xl border border-border overflow-hidden bg-card mb-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-stretch">
            <div className="relative w-full max-w-[min(100%,320px)] mx-auto md:mx-0 md:max-w-none md:w-[280px] lg:w-[300px] shrink-0 aspect-[3/4] bg-gradient-to-br from-primary/25 via-accent to-muted">
              {agentInfo.photo ? (
                <AgentPhoto variant="hero" src={agentInfo.photo} alt={agentInfo.name} />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <User className="w-24 h-24 text-muted-foreground/35" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/25 to-transparent md:bg-gradient-to-r md:from-transparent md:via-background/15 md:to-background/40" />
            </div>
            <div className="relative flex flex-col flex-1 justify-center gap-6 p-6 md:p-8 border-t border-border md:border-t-0 md:border-l border-border">
              <div className="min-w-0">
                <Badge variant="secondary" className="mb-3 font-semibold">
                  <Building2 className="w-3 h-3 mr-1" />
                  {agencyName}
                </Badge>
                <h1 className="text-3xl md:text-4xl font-extrabold font-heading text-foreground tracking-tight truncate">
                  {agentName}
                </h1>
                <div className="text-sm text-muted-foreground flex items-center gap-2 mt-2">
                  <LayoutGrid className="w-4 h-4 text-primary-text" /> {agentScopeListings.length} listings in this agency feed
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {agentInfo.phone && (
                  <a
                    href={`tel:${agentInfo.phone}`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/20"
                  >
                    <Phone className="w-4 h-4" /> {agentInfo.phone}
                  </a>
                )}
                {agentInfo.email && (
                  <a
                    href={`mailto:${agentInfo.email}`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-background/80 backdrop-blur-sm text-foreground font-semibold text-sm hover:bg-accent transition-colors"
                  >
                    <Mail className="w-4 h-4 text-primary-text" /> Email
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-3 h-11 mb-6">
            <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm">
              <User className="w-3.5 h-3.5 hidden sm:inline opacity-80" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="market" className="gap-1.5 text-xs sm:text-sm">
              <LineChart className="w-3.5 h-3.5 hidden sm:inline opacity-80" />
              Market
            </TabsTrigger>
            <TabsTrigger value="inventory" className="gap-1.5 text-xs sm:text-sm">
              <Layers className="w-3.5 h-3.5 hidden sm:inline opacity-80" />
              Inventory
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="outline-none space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card className="p-4 border-border/80">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Avg price (this agency)</div>
                <div className="text-lg font-bold text-foreground flex items-center gap-1.5 mt-1">
                  <TrendingUp className="w-4 h-4 text-primary-text" />
                  {formatAnalyticsMoney(stats.avgPrice)}
                </div>
              </Card>
              <Card className="p-4 border-border/80">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sale / rent</div>
                <div className="text-lg font-bold text-foreground mt-1">
                  {stats.sale} / {stats.rent}
                </div>
              </Card>
              <Card className="p-4 border-border/80">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Communities</div>
                <div className="text-sm text-foreground mt-2 flex flex-wrap gap-1.5">
                  {stats.top.length ? stats.top.map((c) => <Badge key={c} variant="outline">{c}</Badge>) : "—"}
                </div>
              </Card>
            </div>

            <Card className="p-4 border-border/80">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Contact on file</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground inline-flex items-center gap-2">
                    <Phone className="w-4 h-4 text-primary-text/70" /> Phone
                  </span>
                  <span className="font-medium text-foreground truncate">{agentInfo.phone || "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground inline-flex items-center gap-2">
                    <Mail className="w-4 h-4 text-primary-text/70" /> Email
                  </span>
                  <span className="font-medium text-foreground truncate">{agentInfo.email || "—"}</span>
                </div>
                <div className="sm:col-span-2 flex items-center justify-between gap-3">
                  <span className="text-muted-foreground inline-flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-primary-text/70" /> Agent photo
                  </span>
                  <span className="font-medium text-foreground">{agentInfo.photo ? "Present" : "Missing"}</span>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="market" className="outline-none mt-0">
            {agentScopeListings.length > 0 ? (
              <ListingAnalyticsDashboard
                listings={agentScopeListings}
                contextTitle={`${agentName} · ${agencyName}`}
                contextSubtitle={`Analytics for this agent within ${agencyName} only — compare with the global agent profile for cross-agency totals.`}
                hideHero
                sectionLabels={{
                  overview: "Summary",
                  market: "Pricing",
                  inventory: "Composition",
                  quality: "Coverage",
                }}
              />
            ) : (
              <Card className="p-10 text-center text-muted-foreground border-dashed">No listings to analyze.</Card>
            )}
          </TabsContent>

          <TabsContent value="inventory" className="outline-none mt-0 space-y-5">
            <div className="relative max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this agent’s listings…" className="pl-10" />
            </div>
            {listings.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">No listings.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {listings.map((l) => (
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
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AgencyAgentDetailPage;
