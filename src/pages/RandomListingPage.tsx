import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppData } from "@/providers/DataProvider";
import { Shuffle } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";

/** Picks one listing ID at random from the current merged scope (`listings`). */
function pickListingId(ids: string[]): string | null {
  if (ids.length === 0) return null;
  const i = Math.floor(Math.random() * ids.length);
  return ids[i] ?? null;
}

/**
 * **Surprise listing** — jump to an arbitrary listing for exploratory QA / spot checks.
 * Novel deep-link route; avoids duplicating filters or CSV export flows.
 */
export default function RandomListingPage() {
  const { listings } = useAppData();
  const navigate = useNavigate();
  const redirected = useRef(false);

  const ids = useMemo(() => listings.map((l) => l.id).filter(Boolean), [listings]);

  useEffect(() => {
    if (redirected.current || ids.length === 0) return;
    redirected.current = true;
    const id = pickListingId(ids);
    if (id) {
      navigate(`/listing/${encodeURIComponent(id)}`, { replace: true });
    }
  }, [ids, navigate]);

  if (ids.length === 0) {
    return (
      <div className="min-h-[50vh] bg-background flex flex-col">
        <AppHeader />
        <main className="flex-1 container max-w-lg py-16 px-4 mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shuffle className="w-5 h-5 text-muted-foreground" aria-hidden />
                Surprise listing
              </CardTitle>
              <CardDescription>No feeds yet. Upload an agency XML feed to start.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="default">
                <Link to="/sources">Go to Sources</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/listings">Browse listings</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-[40vh] bg-background flex flex-col">
      <AppHeader />
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 gap-4 text-muted-foreground">
        <Shuffle className="w-10 h-10 animate-pulse opacity-40" aria-hidden />
        <p className="text-sm font-medium text-foreground">Opening a random listing…</p>
      </main>
    </div>
  );
}
