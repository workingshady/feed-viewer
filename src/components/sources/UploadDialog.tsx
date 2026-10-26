import { MarketBadge } from "@/components/MarketBadge";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileUp, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { applyVersion, listSources, type RegisterResult, type SourceDTO } from "@/lib/sourcesApi";
import { STAGE_LABELS, commitVersion, prepareVersion, type PreparedVersion, type UploadStage, fileMarket } from "@/lib/uploadVersion";
import { Progress } from "@/components/ui/progress";
import { diffCounts } from "@/lib/versionDiff";
import { SOURCES_KEY } from "@/hooks/useSources";
import { DiffBadges } from "./VersionRow";
import { FeedChecksSummary } from "./FeedChecks";
import { ScoreBadge } from "./health";
import { formatBytes } from "./format";

const NEW = "__new__";

type Row = {
  key: string;
  file: File;
  status: "queued" | "parsing" | "ready" | "saving" | "done" | "error";
  stage?: UploadStage;
  prepared?: PreparedVersion;
  /** Source id, or NEW to create one named `newName`. */
  target?: string;
  newName: string;
  result?: RegisterResult & { sourceId: string };
  error?: string;
};

/**
 * Feeds are parsed in chunks (memory stays flat) and gzipped before upload (~6× smaller), so the
 * practical limit is the browser holding the text: 300 MB is far above any real feed seen so far.
 */
const MAX_FILE_BYTES = 300 * 1024 * 1024;

/** Step label plus a bar: determinate when the stage reports progress, indeterminate otherwise. */
function StageProgress({ stage, step }: { stage: UploadStage; step: 1 | 2 }) {
  const pct = stage.progress != null ? Math.round(stage.progress * 100) : null;
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          Step {step} of 2 · {STAGE_LABELS[stage.stage]}…
        </span>
        {pct != null && <span className="font-mono tabular-nums">{pct}%</span>}
      </div>
      {pct != null ? (
        <Progress value={pct} className="h-1.5" aria-label={STAGE_LABELS[stage.stage]} />
      ) : (
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-1/3 animate-[topbar_1.1s_ease-in-out_infinite] rounded-full bg-primary" />
        </div>
      )}
    </div>
  );
}

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.message === "name_taken") return "A source with that name already exists.";
    if (e.message === "forbidden") return "Your role can't upload feeds.";
    return `Server error: ${e.message}`;
  }
  return e instanceof Error ? e.message : String(e);
}

export function UploadDialog({
  open,
  onOpenChange,
  sources,
  fixedSource,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: SourceDTO[];
  /** When set, every file becomes a version of this source. */
  fixedSource?: SourceDTO | null;
  onDone?: (sourceId: string) => void;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  async function addFiles(list: FileList | File[]) {
    const files = [...list].filter((f) => /\.xml$/i.test(f.name) || f.type.includes("xml"));
    if (!files.length) return;
    const added: Row[] = files.map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      file,
      status: "queued",
      newName: file.name.replace(/\.xml$/i, ""),
    }));
    setRows((rs) => [...rs, ...added]);
    setBusy(true);
    // Parse one at a time: large feeds are heavy on the main thread.
    for (const row of added) {
      if (row.file.size > MAX_FILE_BYTES) {
        patch(row.key, { status: "error", error: `File is larger than ${formatBytes(MAX_FILE_BYTES)}.` });
        continue;
      }
      patch(row.key, { status: "parsing", stage: { stage: "reading" } });
      try {
        const prepared = await prepareVersion(row.file, sources, {
          target: fixedSource ?? null,
          onStage: (stage) => patch(row.key, { stage }),
        });
        if (!prepared.result.success || prepared.result.listings.length === 0) {
          patch(row.key, {
            status: "error",
            error: prepared.result.errors[0] ?? "No listings found in this file.",
          });
          continue;
        }
        patch(row.key, {
          status: "ready",
          prepared,
          target: fixedSource?.id ?? prepared.matched?.id ?? NEW,
          newName: prepared.result.agencyInfo?.name?.trim() || row.newName,
        });
      } catch (e) {
        patch(row.key, { status: "error", error: errorText(e) });
      }
    }
    setBusy(false);
  }

  async function commitAll() {
    setBusy(true);
    let lastSourceId: string | null = null;
    for (const row of rows.filter((r) => r.status === "ready" && r.target && r.prepared)) {
      patch(row.key, { status: "saving" });
      try {
        // Re-read sources so two files for the same new agency end up in one source.
        const fresh = await listSources();
        const target =
          row.target === NEW
            ? fresh.find((s) => s.name.toLowerCase() === row.newName.trim().toLowerCase()) ?? {
                create: { name: row.newName.trim() },
              }
            : fresh.find((s) => s.id === row.target);
        if (!target) throw new Error("That source no longer exists.");
        const res = await commitVersion(row.prepared!, target, undefined, (stage) => patch(row.key, { stage }));
        lastSourceId = res.source.id;
        patch(row.key, { status: "done", result: { ...res, sourceId: res.source.id } });
      } catch (e) {
        patch(row.key, { status: "error", error: errorText(e) });
      }
    }
    await qc.invalidateQueries({ queryKey: SOURCES_KEY });
    setBusy(false);
    if (lastSourceId) onDone?.(lastSourceId);
  }

  async function applyBlocked(row: Row) {
    if (!row.result) return;
    await applyVersion(row.result.sourceId, row.result.version.id);
    patch(row.key, { result: { ...row.result, applied: true, blockedReason: undefined } });
    await qc.invalidateQueries({ queryKey: SOURCES_KEY });
  }

  const close = (o: boolean) => {
    if (busy) return;
    if (!o) setRows([]);
    onOpenChange(o);
  };

  const readyCount = rows.filter((r) => r.status === "ready").length;
  const missingTarget = rows.some((r) => r.status === "ready" && (!r.target || (r.target === NEW && !r.newName.trim())));

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{fixedSource ? `Upload a new version of ${fixedSource.name}` : "Upload feed files"}</DialogTitle>
          <DialogDescription>
            Files are read in your browser, compared with the live version, and saved as new versions. A version that drops more than
            30% of the live listings is saved but not applied.
          </DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border",
          )}
        >
          <FileUp className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">Drop XML feed files here</p>
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            Choose files
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xml,text/xml,application/xml"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {rows.length > 0 && (
          <ul className="space-y-2" aria-live="polite">
            {rows.map((row) => (
              <li key={row.key} className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-2">
                  {row.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                  ) : row.status === "error" ? (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive-text" aria-hidden />
                  ) : row.status === "parsing" || row.status === "saving" || row.status === "queued" ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                  ) : (
                    <FileUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium" title={row.file.name}>
                    {row.file.name}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatBytes(row.file.size)}</span>
                </div>

                {(row.status === "parsing" || row.status === "saving") && row.stage && (
                  <StageProgress stage={row.stage} step={row.status === "parsing" ? 1 : 2} />
                )}
                {row.status === "error" && <p className="text-xs text-destructive-text">{row.error}</p>}

                {row.prepared && row.status === "ready" && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <MarketBadge code={fileMarket(row.prepared)} withName />
                      <span>{row.prepared.result.listings.length.toLocaleString()} listings</span>
                      <span className="inline-flex items-center gap-1">
                        Quality <ScoreBadge score={row.prepared.stats.score} />
                      </span>
                      {row.prepared.diff && row.target === row.prepared.matched?.id && (
                        <span className="inline-flex items-center gap-1">
                          vs live <DiffBadges {...diffCounts(row.prepared.diff)} />
                        </span>
                      )}
                    </div>
                    <FeedChecksSummary result={row.prepared.checks} />
                    {!fixedSource && (
                      <p className="text-xs text-muted-foreground">
                        {row.prepared.matched && row.target === row.prepared.matched.id
                          ? `Detected: ${row.prepared.matched.name} (matched by ${row.prepared.matchedBy ?? "agency name"}). Change it below if that's wrong.`
                          : row.target === NEW
                            ? "No existing source matches this agency, so a new source will be created. Pick one below to add it there instead."
                            : "Chosen manually."}
                      </p>
                    )}
                    {!fixedSource && (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Select value={row.target ?? ""} onValueChange={(v) => patch(row.key, { target: v })}>
                          <SelectTrigger className="sm:w-64" aria-label={`Source for ${row.file.name}`}>
                            <SelectValue placeholder="Choose a source" />
                          </SelectTrigger>
                          <SelectContent>
                            {sources.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                            <SelectItem value={NEW}>New source: {row.newName.trim() || "…"}</SelectItem>
                          </SelectContent>
                        </Select>
                        {row.target === NEW && (
                          <Input
                            value={row.newName}
                            onChange={(e) => patch(row.key, { newName: e.target.value })}
                            placeholder="Source name"
                            maxLength={120}
                            aria-label="New source name"
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {row.result && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {row.result.duplicate ? (
                      <span className="text-muted-foreground">Already uploaded as v{row.result.version.number} — nothing changed.</span>
                    ) : row.result.applied ? (
                      <span className="text-success">Live as v{row.result.version.number}</span>
                    ) : (
                      <>
                        <span className="text-warning">
                          Saved as v{row.result.version.number}, not applied: the listing count dropped by more than 30%.
                        </span>
                        <Button size="sm" variant="outline" className="h-7" onClick={() => void applyBlocked(row)}>
                          Apply anyway
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={busy}>
            {rows.some((r) => r.status === "done") ? "Close" : "Cancel"}
          </Button>
          <Button onClick={() => void commitAll()} disabled={busy || readyCount === 0 || missingTarget}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
            Save {readyCount || ""} version{readyCount === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
