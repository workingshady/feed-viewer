import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Database, FileStack, Gauge, HardDrive, Loader2, Upload } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SourceList } from "@/components/sources/SourceList";
import { SourceDetail } from "@/components/sources/SourceDetail";
import { UploadDialog } from "@/components/sources/UploadDialog";
import { healthOf } from "@/components/sources/health";
import { formatBytes } from "@/components/sources/format";
import { useAppData } from "@/providers/useAppData";
import { useAuth } from "@/providers/AuthProvider";
import { hasRole } from "@/lib/roles";
import { liveVersionOf } from "@/lib/sourcesApi";

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Database; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="h-5 w-5 shrink-0 text-primary-text" aria-hidden />
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="font-mono text-lg font-semibold tabular-nums text-foreground">{value}</div>
          {hint && <div className="truncate text-xs text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SourcesPage() {
  const { sources, isLoading } = useAppData();
  const { user } = useAuth();
  const canEdit = hasRole(user?.role, "editor");
  const [params, setParams] = useSearchParams();
  const [upload, setUpload] = useState<{ open: boolean; fixed: boolean }>({ open: false, fixed: false });

  const selectedId = params.get("source") ?? sources[0]?.id ?? null;
  const selected = sources.find((s) => s.id === selectedId) ?? null;
  const select = (id: string | null) => setParams(id ? { source: id } : {}, { replace: true });

  const kpis = useMemo(() => {
    const lives = sources.map(liveVersionOf).filter((v) => v !== null);
    const scored = lives.filter((v) => v.stats);
    return {
      liveListings: lives.reduce((n, v) => n + v.listingCount, 0),
      avgScore: scored.length ? Math.round(scored.reduce((n, v) => n + (v.stats?.score ?? 0), 0) / scored.length) : null,
      attention: sources.filter((s) => healthOf(s) !== "healthy").length,
      storage: sources.reduce((n, s) => n + s.versions.reduce((m, v) => m + v.fileBytes, 0), 0),
      versions: sources.reduce((n, s) => n + s.versions.length, 0),
    };
  }, [sources]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container space-y-6 py-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="flex items-center gap-2 font-heading text-2xl font-extrabold text-foreground">
              <FileStack className="h-6 w-6 text-primary-text" aria-hidden /> Sources
            </h1>
            <p className="text-sm text-muted-foreground">
              Each agency feed and its uploaded versions. The live version of each source is what every page shows.
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => setUpload({ open: true, fixed: false })}>
              <Upload className="mr-1.5 h-4 w-4" /> Upload feeds
            </Button>
          )}
        </div>

        {isLoading && sources.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Loading sources…
          </div>
        ) : sources.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <FileStack className="h-10 w-10 text-muted-foreground" aria-hidden />
              <h2 className="text-lg font-semibold">No feeds yet</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                {canEdit
                  ? "Upload an agency XML feed. Each later upload of the same agency becomes a new version you can apply, compare or roll back."
                  : "Ask an editor to upload a feed."}
              </p>
              {canEdit && (
                <Button onClick={() => setUpload({ open: true, fixed: false })}>
                  <Upload className="mr-1.5 h-4 w-4" /> Upload feeds
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi icon={Database} label="Live listings" value={kpis.liveListings.toLocaleString()} hint={`${sources.length} sources`} />
              <Kpi icon={Gauge} label="Average quality" value={kpis.avgScore != null ? `${kpis.avgScore}/100` : "—"} />
              <Kpi icon={FileStack} label="Need attention" value={String(kpis.attention)} hint="Pending, low quality or not live" />
              <Kpi icon={HardDrive} label="Uploaded files" value={formatBytes(kpis.storage)} hint={`${kpis.versions} versions (original size)`} />
            </div>

            <div className="grid gap-6 md:grid-cols-[minmax(260px,340px)_1fr]">
              <aside className="min-w-0">
                <SourceList sources={sources} selectedId={selected?.id ?? null} onSelect={select} />
              </aside>
              <section aria-label="Source details" className="min-w-0">
                {selected ? (
                  <SourceDetail
                    source={selected}
                    canEdit={canEdit}
                    onUpload={() => setUpload({ open: true, fixed: true })}
                    onDeleted={() => select(null)}
                  />
                ) : (
                  <p className="py-12 text-center text-sm text-muted-foreground">Select a source.</p>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      <UploadDialog
        open={upload.open}
        onOpenChange={(open) => setUpload((u) => ({ ...u, open }))}
        sources={sources}
        fixedSource={upload.fixed ? selected : null}
        onDone={(id) => select(id)}
      />
    </div>
  );
}
