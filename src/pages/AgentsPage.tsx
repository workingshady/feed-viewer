import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Users, Phone, Mail, Image as ImageIcon, Search, ArrowRight, Building2, TrendingUp } from "lucide-react";
import { AgentPhoto } from "@/components/AgentPhoto";
import AppHeader from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAppData } from "@/providers/DataProvider";
import type { Listing } from "@/lib/types";

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
    () => Array.from(listingsByAgency.keys()).filter(Boolean).sort((a, b) => a.localeCompare(b)),
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

  const agents = useMemo(() => {
    const byName = new Map<string, any>();
    for (const l of sourceListings) {
      const name = (l.agent?.name || "").trim();
      if (!name) continue;
      const cur = byName.get(name) ?? {
        name,
        count: 0,
        sale: 0,
        rent: 0,
        sumPrice: 0,
        pricedCount: 0,
        missingPhone: 0,
        missingEmail: 0,
        missingPhoto: 0,
        topCommunities: new Map<string, number>(),
        photo: "" as string,
      };
      cur.count++;
      if (l.purpose === "sale") cur.sale++;
      if (l.purpose === "rent") cur.rent++;
      if (l.price) {
        cur.sumPrice += safeNum(l.price);
        cur.pricedCount++;
      }
      if (!l.agent?.phone) cur.missingPhone++;
      if (!l.agent?.email) cur.missingEmail++;
      if (!l.agent?.photo) cur.missingPhoto++;
      if (!cur.photo && l.agent?.photo) cur.photo = l.agent.photo;
      const comm = (l.community || "").trim();
      if (comm) cur.topCommunities.set(comm, (cur.topCommunities.get(comm) ?? 0) + 1);
      byName.set(name, cur);
    }

    const arr = Array.from(byName.values()).map((a) => {
      const avgPrice = a.pricedCount ? a.sumPrice / a.pricedCount : 0;
      const top = Array.from(a.topCommunities.entries())
        .sort((x, y) => y[1] - x[1])
        .slice(0, 3)
        .map(([name]) => name);
      return { ...a, avgPrice, top };
    });

    const query = q.trim().toLowerCase();
    const filtered = !query
      ? arr
      : arr.filter((a) => a.name.toLowerCase().includes(query) || a.top.join(" ").toLowerCase().includes(query));

    filtered.sort((a, b) => {
      switch (sort) {
        case "count_asc":
          return a.count - b.count;
        case "name_asc":
          return a.name.localeCompare(b.name);
        case "avg_price_desc":
          return b.avgPrice - a.avgPrice;
        default:
          return b.count - a.count;
      }
    });

    return filtered;
  }, [sourceListings, q, sort]);

  const profileHref = (agentName: string) =>
    agencyKey === ALL_AGENCIES
      ? `/agents/${encodeURIComponent(agentName)}`
      : `/agencies/${encodeURIComponent(agencyKey)}/agents/${encodeURIComponent(agentName)}`;

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
              Browse agents from all live feeds, or focus on one agency. Cards show inventory, average price, and contact
              completeness.
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
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agents or communities…" className="pl-10" />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="count_desc">Most listings</SelectItem>
                <SelectItem value="count_asc">Fewest listings</SelectItem>
                <SelectItem value="avg_price_desc">Highest avg price</SelectItem>
                <SelectItem value="name_asc">Name A → Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {agencyKey === ALL_AGENCIES ? (
          <Badge variant="outline" className="mb-4 text-xs font-medium">
            Showing agents aggregated across every agency
          </Badge>
        ) : (
          <Badge variant="secondary" className="mb-4 text-xs font-medium">
            Scoped to {agencyKey} — profile links open the agency-specific agent page
          </Badge>
        )}

        {agents.length === 0 ? (
          <Card className="p-10 text-center">
            <div className="text-lg font-bold text-foreground mb-2">No agent data found</div>
            <div className="text-sm text-muted-foreground mb-5">
              Upload a feed that contains agent nodes (name/phone/email/photo), or pick another agency.
            </div>
            <Button asChild>
              <Link to="/sources">Go to Sources</Link>
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {agents.map((a) => (
              <Link key={`${agencyKey}:${a.name}`} to={profileHref(a.name)} className="block group">
                <Card className="overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col">
                  <div className="relative w-full aspect-[3/4] bg-gradient-to-br from-primary/20 via-accent to-muted">
                    {a.photo ? (
                      <AgentPhoto variant="hero" src={a.photo} alt="" loading="lazy" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Users className="w-16 h-16 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-lg font-extrabold font-heading text-foreground truncate drop-shadow-sm">{a.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {a.top.length ? a.top.join(" • ") : "—"}
                        </div>
                      </div>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-bold shrink-0">
                        {a.count} listings
                      </span>
                    </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col">
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="bg-accent/60 rounded-lg p-2.5">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Avg price</div>
                        <div className="text-sm font-bold text-foreground flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5 text-primary-text shrink-0" /> {fmtMoney(a.avgPrice)}
                        </div>
                      </div>
                      <div className="bg-accent/60 rounded-lg p-2.5">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Sale / rent</div>
                        <div className="text-sm font-bold text-foreground">
                          {a.sale}/{a.rent}
                        </div>
                      </div>
                      <div className="bg-accent/60 rounded-lg p-2.5">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Gaps</div>
                        <div className="text-sm font-bold text-foreground">{a.missingPhone + a.missingEmail + a.missingPhoto}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs mt-auto">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded border ${
                          a.missingPhone ? "border-warning/40 bg-warning/5 text-warning" : "border-border bg-card text-muted-foreground"
                        }`}
                      >
                        <Phone className="w-3 h-3" /> {a.missingPhone ? `${a.missingPhone} missing` : "ok"}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded border ${
                          a.missingEmail ? "border-warning/40 bg-warning/5 text-warning" : "border-border bg-card text-muted-foreground"
                        }`}
                      >
                        <Mail className="w-3 h-3" /> {a.missingEmail ? `${a.missingEmail} missing` : "ok"}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded border ${
                          a.missingPhoto ? "border-warning/40 bg-warning/5 text-warning" : "border-border bg-card text-muted-foreground"
                        }`}
                      >
                        <ImageIcon className="w-3 h-3" /> {a.missingPhoto ? `${a.missingPhoto} missing` : "ok"}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border bg-card text-muted-foreground">
                        <Building2 className="w-3 h-3" /> {a.top.length ? `${a.top.length} areas` : "—"}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center justify-end text-sm font-semibold text-primary-text opacity-0 group-hover:opacity-100 transition-opacity">
                      View profile <ArrowRight className="w-4 h-4 ml-1" />
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentsPage;
