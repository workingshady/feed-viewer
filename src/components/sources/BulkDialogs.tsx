import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileDown, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError } from "@/lib/api";
import { deleteVersion, listSources, liveVersionOf, type SourceDTO, type VersionDTO } from "@/lib/sourcesApi";
import { fetchVersionXml } from "@/lib/versionBlobs";
import { commitVersion, prepareVersion, STAGE_LABELS } from "@/lib/uploadVersion";
import { startJob } from "@/lib/jobs";
import { REPORTS, downloadVersionReport, type ReportKind } from "@/lib/versionReports";
import { SOURCES_KEY } from "@/hooks/useSources";
import { formatBytes, timeAgo } from "./format";

/** Previous version (by number) of `v` within the source. */
export const previousOf = (source: SourceDTO, v: VersionDTO) => source.versions.find((x) => x.number < v.number) ?? null;

function VersionChecklist({
  source,
  selected,
  onToggle,
  disabled,
}: {
  source: SourceDTO;
  selected: Set<string>;
  onToggle: (id: string) => void;
  disabled?: (v: VersionDTO) => string | null;
}) {
  return (
    <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
      {source.versions.map((v) => {
        const reason = disabled?.(v) ?? null;
        const id = `pick-${v.id}`;
        return (
          <li key={v.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <Checkbox id={id} checked={selected.has(v.id)} onCheckedChange={() => onToggle(v.id)} disabled={!!reason} />
            <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
              <span className="font-mono font-semibold">v{v.number}</span>
              {v.id === source.activeVersionId && <span className="ml-2 rounded bg-primary px-1.5 text-[10px] text-primary-foreground">Live</span>}
              {v.pinned && <span className="ml-2 text-xs text-muted-foreground">pinned</span>}
              <span className="block truncate text-xs text-muted-foreground">
                {v.fileName} · {formatBytes(v.fileBytes)} · {v.listingCount.toLocaleString()} listings · {timeAgo(v.createdAt)}
                {reason ? ` · ${reason}` : ""}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function useSelection(initial: string[] = []) {
  const [selected, setSelected] = useState(() => new Set(initial));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return { selected, setSelected, toggle };
}

/** Re-parse one or more versions from their original XML in the background. */
export function ReparseDialog({ source, open, onOpenChange }: { source: SourceDTO; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const live = liveVersionOf(source);
  const { selected, setSelected, toggle } = useSelection(live ? [live.id] : []);
  const start = () => {
    const picked = source.versions.filter((v) => selected.has(v.id)).sort((a, b) => a.number - b.number);
    startJob(
      `Re-parse ${source.name}`,
      picked,
      (v) => `v${v.number} · ${v.fileName}`,
      async (v, report) => {
        report({ detail: "Downloading original XML…" });
        const xml = await fetchVersionXml(v.xmlBlobUrl);
        const fresh = (await listSources()).find((s) => s.id === source.id);
        if (!fresh) throw new Error("Source was deleted");
        const prepared = await prepareVersion(new File([xml], v.fileName, { type: "text/xml" }), [fresh], {
          target: fresh,
          onStage: (s) => report({ detail: STAGE_LABELS[s.stage], progress: s.progress }),
        });
        // Only re-parsing the live version replaces what the site shows; older ones are saved for comparison.
        const isLive = v.id === fresh.activeVersionId;
        const res = await commitVersion(prepared, fresh, undefined, (s) => report({ detail: STAGE_LABELS[s.stage], progress: s.progress }), isLive ? "auto" : "never");
        if (res.duplicate) return { status: "skipped", detail: `Already up to date (v${res.version.number})` };
        return {
          detail: res.applied
            ? `New v${res.version.number} is live`
            : isLive
              ? `Saved as v${res.version.number}, held for review (listing count dropped)`
              : `Saved as v${res.version.number} (not live)`,
        };
      },
      () => void qc.invalidateQueries({ queryKey: SOURCES_KEY }),
    );
    toast.message("Re-parse started", { description: "Progress is shown at the bottom right. You can keep working." });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Re-parse versions of {source.name}</DialogTitle>
          <DialogDescription>
            Reads each original XML again with the current parser and this source's field mapping, and saves the result as a new
            version. Re-parsing the live version makes the new one live; others are saved for comparison only.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 text-xs">
          <Button variant="outline" size="sm" onClick={() => setSelected(new Set(source.versions.map((v) => v.id)))}>
            Select all
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelected(new Set(live ? [live.id] : []))}>
            Live only
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
        <VersionChecklist source={source} selected={selected} onToggle={toggle} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={start} disabled={selected.size === 0}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Re-parse {selected.size} version{selected.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Delete several versions at once (the live one is protected), in the background. */
export function BulkDeleteDialog({ source, open, onOpenChange }: { source: SourceDTO; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { selected, setSelected, toggle } = useSelection();
  const deletable = useMemo(() => source.versions.filter((v) => v.id !== source.activeVersionId), [source]);
  const bytes = source.versions.filter((v) => selected.has(v.id)).reduce((n, v) => n + v.fileBytes, 0);
  const start = () => {
    const picked = source.versions.filter((v) => selected.has(v.id));
    startJob(
      `Delete ${picked.length} version${picked.length === 1 ? "" : "s"} of ${source.name}`,
      picked,
      (v) => `v${v.number} · ${v.fileName}`,
      async (v) => {
        try {
          await deleteVersion(source.id, v.id);
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) return { status: "skipped", detail: "Already deleted" };
          if (e instanceof ApiError && e.message === "version_is_live") throw new Error("It became live — apply another version first");
          throw e;
        }
      },
      () => void qc.invalidateQueries({ queryKey: SOURCES_KEY }),
    );
    setSelected(new Set());
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete versions of {source.name}</DialogTitle>
          <DialogDescription>
            Removes the selected versions and their files. The live version can't be deleted — apply another first, or delete the
            whole source from its settings.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSelected(new Set(deletable.map((v) => v.id)))}>
            Select all except live
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelected(new Set(deletable.filter((v) => !v.pinned).map((v) => v.id)))}
          >
            Unpinned only
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
        <VersionChecklist
          source={source}
          selected={selected}
          onToggle={toggle}
          disabled={(v) => (v.id === source.activeVersionId ? "live — can't delete" : null)}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={start}
            disabled={selected.size === 0}
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete {selected.size} version{selected.size === 1 ? "" : "s"}
            {bytes ? ` (${formatBytes(bytes)})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Dropdown of every report for one version. */
export function ReportsMenu({
  source,
  version,
  label = "Reports",
  size = "sm",
}: {
  source: SourceDTO;
  version: VersionDTO;
  label?: string;
  size?: "sm" | "icon";
}) {
  const previous = previousOf(source, version);
  const run = async (kind: ReportKind) => {
    const id = toast.loading("Preparing report…");
    try {
      await downloadVersionReport(kind, source, version, previous);
      toast.success("Report downloaded", { id });
    } catch (e) {
      toast.error(`Report failed: ${e instanceof Error ? e.message : String(e)}`, { id });
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size === "icon" ? "icon" : "sm"} aria-label={`Reports for v${version.number}`}>
          <FileDown className={size === "icon" ? "h-4 w-4" : "mr-1.5 h-4 w-4"} />
          {size !== "icon" && label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          v{version.number}
          {previous ? ` · compared with v${previous.number}` : ""}
        </DropdownMenuLabel>
        {REPORTS.filter((r) => !r.needsPrevious || previous).map((r) => (
          <DropdownMenuItem key={r.kind} onSelect={() => void run(r.kind)}>
            <Download className="mr-2 h-4 w-4" /> {r.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
