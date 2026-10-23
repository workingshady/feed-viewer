import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Download, FileWarning, GitCompare, MoreHorizontal, Pin, PinOff, Play, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { SourceDTO, VersionDTO } from "@/lib/sourcesApi";
import { fetchVersionListings, fetchVersionXml } from "@/lib/versionBlobs";
import { qualityIssuesCsv } from "@/lib/versionStats";
import { checkFeed } from "@/lib/feedValidation";
import { changesCsv, feedCheckCsv, listingsCsv } from "@/lib/reports";
import { diffListings } from "@/lib/versionDiff";
import { toast } from "sonner";
import { useUpdateVersion } from "@/hooks/useSources";
import { ScoreBadge } from "./health";
import { GateBadge } from "./FeedChecks";
import { downloadText, formatBytes, timeAgo } from "./format";

export function DiffBadges({ added, removed, changed }: { added: number; removed: number; changed: number }) {
  return (
    <span className="inline-flex flex-wrap gap-1 font-mono text-xs tabular-nums">
      <span className="rounded bg-success/15 px-1.5 py-0.5 text-success" title="Added listings">+{added}</span>
      <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-destructive-text" title="Removed listings">−{removed}</span>
      <span className="rounded bg-warning/15 px-1.5 py-0.5 text-warning" title="Changed listings">~{changed}</span>
    </span>
  );
}

/** Signed change vs the previous version; hidden when there is nothing to compare. */
function Delta({ value, label = "listings vs previous version" }: { value: number | null; label?: string }) {
  if (value == null || value === 0) return null;
  return (
    <span
      title={`${value > 0 ? "+" : ""}${value} ${label}`}
      className={cn("ml-1 font-mono text-[11px] tabular-nums", value > 0 ? "text-success" : "text-destructive-text")}
    >
      ({value > 0 ? "+" : ""}
      {value.toLocaleString()})
    </span>
  );
}

export function VersionRow({
  source,
  version,
  previous = null,
  isLive,
  canEdit,
  onApply,
  onDelete,
}: {
  source: SourceDTO;
  version: VersionDTO;
  /** The version uploaded before this one, for change deltas. */
  previous?: VersionDTO | null;
  isLive: boolean;
  canEdit: boolean;
  onApply: () => void;
  onDelete: () => void;
}) {
  const update = useUpdateVersion();
  const [note, setNote] = useState(version.note ?? "");
  const issues = (version.warnings?.errors.length ?? 0) + (version.warnings?.warnings.length ?? 0);

  const saveNote = () => {
    const next = note.trim() || null;
    if (next !== (version.note ?? null)) update.mutate({ source, version, note: next });
  };

  // Cross-origin blob URLs ignore the `download` attribute, so fetch and save locally.
  const downloadXml = async () => {
    downloadText(version.fileName, await fetchVersionXml(version.xmlBlobUrl), "application/xml");
  };

  const base = `${source.name}-v${version.number}`;
  const download = async (kind: "quality" | "checks" | "listings" | "changes") => {
    try {
      const listings = await fetchVersionListings(version.listingsBlobUrl);
      if (kind === "quality") downloadText(`${base}-quality-issues.csv`, qualityIssuesCsv(listings));
      if (kind === "checks") downloadText(`${base}-feed-checks.csv`, feedCheckCsv(checkFeed(listings)));
      if (kind === "listings") downloadText(`${base}-listings.csv`, listingsCsv(listings));
      if (kind === "changes" && previous) {
        const before = await fetchVersionListings(previous.listingsBlobUrl);
        downloadText(`${source.name}-v${previous.number}-to-v${version.number}-changes.csv`, changesCsv(diffListings(before, listings)));
      }
    } catch (e) {
      toast.error(`Download failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <li className={cn("rounded-lg border bg-card p-3", isLive ? "border-primary" : "border-border")}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-foreground">v{version.number}</span>
          {isLive && <Badge className="gap-1"><Check className="h-3 w-3" aria-hidden /> Live</Badge>}
          {version.pinned && <Pin className="h-3.5 w-3.5 text-muted-foreground" aria-label="Pinned" />}
        </div>
        <div className="min-w-0 flex-1 text-xs text-muted-foreground">
          <div className="truncate" title={version.fileName}>
            {version.fileName} · {formatBytes(version.fileBytes)}
          </div>
          <div>
            {timeAgo(version.createdAt)}
            {version.createdBy ? ` by ${version.createdBy.username}` : ""} · {version.listingCount.toLocaleString()} listings
            <Delta value={previous ? version.listingCount - previous.listingCount : null} />
          </div>
        </div>
        <DiffBadges added={version.added} removed={version.removed} changed={version.changed} />
        <div className="flex items-center gap-1" title="Quality score">
          <ScoreBadge score={version.stats?.score} />
          <Delta
            value={previous?.stats && version.stats ? version.stats.score - previous.stats.score : null}
            label="quality vs previous version"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for v${version.number}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canEdit && !isLive && (
              <DropdownMenuItem onSelect={onApply}>
                <Play className="mr-2 h-4 w-4" /> Apply this version
              </DropdownMenuItem>
            )}
            {!isLive && (
              <DropdownMenuItem asChild>
                <Link to={`/feed-compare?source=${source.id}&a=live&b=${version.id}`}>
                  <GitCompare className="mr-2 h-4 w-4" /> Compare with live
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => void downloadXml()}>
              <Download className="mr-2 h-4 w-4" /> Download original XML
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Reports (CSV)</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => void download("checks")}>
              <FileWarning className="mr-2 h-4 w-4" /> Feed checks
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void download("quality")}>
              <FileWarning className="mr-2 h-4 w-4" /> Quality issues per listing
            </DropdownMenuItem>
            {previous && (
              <DropdownMenuItem onSelect={() => void download("changes")}>
                <GitCompare className="mr-2 h-4 w-4" /> Changes since v{previous.number}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => void download("listings")}>
              <Download className="mr-2 h-4 w-4" /> All listings
            </DropdownMenuItem>
            {canEdit && (
              <>
                <DropdownMenuItem onSelect={() => update.mutate({ source, version, pinned: !version.pinned })}>
                  {version.pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
                  {version.pinned ? "Unpin" : "Pin (never auto-delete)"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={isLive}
                  onSelect={onDelete}
                  className="text-destructive-text focus:text-destructive-text"
                  title={isLive ? "Apply another version first" : undefined}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> {isLive ? "Delete (apply another version first)" : "Delete version"}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {(canEdit || version.note) && (
        <div className="mt-2">
          {canEdit ? (
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              placeholder="Add a note (e.g. “agency fixed prices”)"
              maxLength={200}
              className="h-8 text-xs"
              aria-label={`Note for v${version.number}`}
            />
          ) : (
            <p className="text-xs text-muted-foreground">{version.note}</p>
          )}
        </div>
      )}
      {version.warnings?.checks ? (
        <details className="mt-2 text-xs">
          <summary className="flex cursor-pointer items-center gap-2 text-muted-foreground">
            <GateBadge gate={version.warnings.checks.gate} />
            {version.warnings.checks.issues.filter((i) => i.severity === "error").length} error types ·{" "}
            {version.warnings.checks.issues.filter((i) => i.severity === "warning").length} warning types
          </summary>
          <ul className="mt-1 space-y-0.5 pl-1">
            {version.warnings.checks.issues.map((i) => (
              <li key={i.code} className="flex gap-2">
                <span className={i.severity === "error" ? "text-destructive-text" : i.severity === "warning" ? "text-warning" : "text-muted-foreground"}>
                  {i.severity}
                </span>
                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                <span className="font-mono tabular-nums text-muted-foreground">{i.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : issues > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {version.warnings?.errors.length ?? 0} errors · {version.warnings?.warnings.length ?? 0} warnings from parsing
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {[...(version.warnings?.errors ?? []), ...(version.warnings?.warnings ?? [])].slice(0, 20).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}
