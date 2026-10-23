import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Calendar, Search, ArrowRight, Link2 } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/providers/DataProvider";
import { AGENCIES_DIRECTORY_SUBTITLE } from "@/lib/agencyDirectoryCopy";
import { AgencyLogo } from "@/components/AgencyLogo";

type AgencyRow = {
  name: string;
  listingsCount: number;
  importsCount: number;
  lastImportedAt: string | null;
  logo?: string;
  website?: string;
  email?: string;
  phone?: string;
};

const AgenciesPage = () => {
  const { sources, listingsByAgency } = useAppData();
  const [q, setQ] = useState("");

  const agencies = useMemo(() => {
    const arr: AgencyRow[] = [];
    for (const s of sources) {
      if (!s.name.trim()) continue;
      const info = s.agencyInfo;
      arr.push({
        name: s.name,
        listingsCount: listingsByAgency.get(s.name)?.length ?? 0,
        importsCount: s.versions.length,
        lastImportedAt: s.versions[0]?.createdAt ?? null,
        logo: info?.logo || undefined,
        website: info?.website || undefined,
        email: info?.email || undefined,
        phone: info?.phone || undefined,
      });
    }
    arr.sort((x, y) => y.listingsCount - x.listingsCount);
    const query = q.trim().toLowerCase();
    return !query ? arr : arr.filter((a) => a.name.toLowerCase().includes(query));
  }, [sources, listingsByAgency, q]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold font-heading text-foreground flex items-center gap-2">
              <Building2 className="w-6 h-6 text-primary-text" /> Agencies
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">{AGENCIES_DIRECTORY_SUBTITLE}</p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agencies…" className="pl-10" />
          </div>
        </div>

        {agencies.length >= 2 && (
          <Card className="mb-6 p-4 border-primary/25 bg-gradient-to-r from-primary/5 to-transparent">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-primary-text" />
                  Cross-agency duplicate check
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                  You have multiple agencies in import history. Open the matcher to find the same property listed under
                  different brands (permit, map, photos, heuristics).
                </p>
              </div>
              <Button asChild variant="default" size="sm" className="shrink-0">
                <Link to="/cross-agency-dupes">Open matcher</Link>
              </Button>
            </div>
          </Card>
        )}

        {agencies.length === 0 ? (
          <Card className="p-10 text-center">
            <div className="text-lg font-bold text-foreground mb-2">No feeds yet</div>
            <div className="text-sm text-muted-foreground mb-5">Add a source and upload a feed to populate agencies.</div>
            <Button asChild>
              <Link to="/sources">Go to Sources</Link>
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {agencies.map((a) => (
              <Link key={a.name} to={`/agencies/${encodeURIComponent(a.name)}`} className="block">
                <Card className="p-7 hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-3">
                      <div className="w-16 h-16 rounded-xl bg-accent flex items-center justify-center overflow-hidden ring-1 ring-border shrink-0">
                        <AgencyLogo src={a.logo} name={a.name} className="h-full w-full" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-lg font-extrabold font-heading text-foreground truncate">{a.name}</div>
                        <div className="text-sm text-muted-foreground mt-1 inline-flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {a.lastImportedAt ? new Date(a.lastImportedAt).toLocaleString() : "—"}
                        </div>
                        {(() => {
                          const websiteLine =
                            a.website && a.website.trim().toLowerCase() !== a.name.trim().toLowerCase()
                              ? a.website
                              : null;
                          const contactLine =
                            websiteLine ?? a.email ?? a.phone ?? null;
                          return contactLine ? (
                            <div className="mt-3 text-sm text-muted-foreground space-y-0.5">
                              <div className="truncate">{contactLine}</div>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="bg-accent/60 rounded-lg p-3">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">Imports</div>
                      <div className="text-lg font-bold text-foreground">{a.importsCount}</div>
                    </div>
                    <div className="bg-accent/60 rounded-lg p-3">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">Listings</div>
                      <div className="text-lg font-bold text-foreground">{a.listingsCount}</div>
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

export default AgenciesPage;
