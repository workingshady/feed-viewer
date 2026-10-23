import AppHeader from "@/components/AppHeader";
import PropertyCard from "@/components/PropertyCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COMPARE_UPDATED_EVENT, getCompareListingIds } from "@/lib/compareSelection";
import type { Listing } from "@/lib/types";
import { useAppData } from "@/providers/DataProvider";
import { Heart, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "@/components/ui/sonner";
import { useFavorites } from "@/hooks/usePrefs";

const FAV_SUBTAB_KEY = "feedview.favorites.subtab";

type FavSubTab = "in" | "stale";

function readFavSubTab(): FavSubTab | null {
  try {
    const r = sessionStorage.getItem(FAV_SUBTAB_KEY);
    if (r === "in" || r === "stale") return r;
  } catch {
    /* ignore */
  }
  return null;
}

export default function FavoritesPage() {
  const { listings, listingsByAgency } = useAppData();
  const favorites = useFavorites();
  const [compareTick, setCompareTick] = useState(0);
  const [favSub, setFavSub] = useState<FavSubTab>(() => readFavSubTab() ?? "in");

  useEffect(() => {
    const onCmp = () => setCompareTick((n) => n + 1);
    window.addEventListener(COMPARE_UPDATED_EVENT, onCmp);
    return () => {
      window.removeEventListener(COMPARE_UPDATED_EVENT, onCmp);
    };
  }, []);

  const favoriteIds = useMemo(() => Array.from(favorites.ids), [favorites.ids]);

  const listingById = useMemo(() => {
    const m = new Map<string, Listing>();
    for (const [, arr] of listingsByAgency.entries()) {
      for (const l of arr) {
        if (!m.has(l.id)) m.set(l.id, l);
      }
    }
    for (const l of listings) m.set(l.id, l);
    return m;
  }, [listings, listingsByAgency]);

  const compareSet = useMemo(() => new Set(getCompareListingIds()), [compareTick]);

  const resolved = useMemo(() => {
    return favoriteIds.map((id) => ({ id, listing: listingById.get(id) ?? null }));
  }, [favoriteIds, listingById]);

  const inWorkspace = resolved.filter((r) => r.listing !== null);
  const missing = resolved.filter((r) => r.listing === null);

  const onFavSubChange = useCallback(
    (v: string) => {
      const next = v as FavSubTab;
      setFavSub(next);
      try {
        sessionStorage.setItem(FAV_SUBTAB_KEY, next);
      } catch {
        /* ignore */
      }
    },
    [],
  );

  useEffect(() => {
    if (favSub === "stale" && missing.length === 0) setFavSub("in");
  }, [favSub, missing.length]);

  const pagePad = "w-full px-4 sm:px-6 lg:px-10 xl:px-14";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="border-b border-border bg-muted/30">
        <div className={`${pagePad} py-8`}>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 max-w-none">
            <div className="space-y-2 min-w-0">
              <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground font-semibold">Library</p>
              <h1 className="text-2xl sm:text-3xl font-heading font-semibold tracking-tight flex items-center gap-2">
                <Heart className="w-7 h-7 text-primary-text shrink-0 fill-primary/25" aria-hidden />
                Favorites
              </h1>
              <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
                Listings you starred in this browser (saved to your account). They stay here until you remove them. Open a listing to compare or jump back to the grid.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button variant="outline" size="sm" asChild>
                <Link to="/listings">Browse listings</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/sources" className="gap-2">
                  <Upload className="w-4 h-4" aria-hidden />
                  Sources
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className={`${pagePad} py-8 space-y-8 max-w-none`}>
        {favoriteIds.length === 0 ? (
          <Card className="max-w-lg mx-auto border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">No favorites yet</CardTitle>
              <CardDescription>
                Use the heart on any listing card or detail page. Favorites are saved to your account.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/listings">Go to listings</Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link to="/database">Listing table</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={favSub} onValueChange={onFavSubChange} className="w-full space-y-6">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/40 p-1 sm:inline-flex sm:w-auto">
              <TabsTrigger value="in" className="rounded-lg gap-2">
                In workspace
                <span className="tabular-nums text-muted-foreground">({inWorkspace.length})</span>
              </TabsTrigger>
              <TabsTrigger value="stale" className="rounded-lg gap-2" disabled={missing.length === 0}>
                Not loaded
                <span className="tabular-nums text-muted-foreground">({missing.length})</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="in" className="mt-0 outline-none focus-visible:outline-none space-y-4">
              {inWorkspace.length > 0 ? (
                <section aria-label="Favorite listings in workspace">
                  <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 list-none p-0 m-0">
                    {inWorkspace.map(({ id, listing }) => {
                      if (!listing) return null;
                      return (
                        <li key={id}>
                          <PropertyCard
                            listing={listing}
                                            isFavorite
                            inCompare={compareSet.has(id)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : (
                <p className="text-sm text-muted-foreground border border-dashed rounded-lg px-4 py-8 text-center max-w-lg">
                  No resolved favorites in the current workspace scope — check the other tab for orphaned IDs.
                </p>
              )}
            </TabsContent>

            <TabsContent value="stale" className="mt-0 outline-none focus-visible:outline-none space-y-3">
              {missing.length > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground max-w-2xl">
                    These IDs are still saved as favorites but no matching listing is loaded. Upload the feed again or remove
                    the entry.
                  </p>
                  <ul className="space-y-2 max-w-xl">
                    {missing.map(({ id }) => (
                      <li
                        key={id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                      >
                        <code className="text-xs font-mono truncate">{id}</code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-destructive-text hover:text-destructive-text gap-1"
                          onClick={() => {
                            favorites.remove(id);
                            toast.success("Removed from favorites");
                          }}
                        >
                          <Trash2 className="w-4 h-4" aria-hidden />
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing to clean up.</p>
              )}
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
