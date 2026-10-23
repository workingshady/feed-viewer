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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { SourceDTO, VersionDTO } from "@/lib/sourcesApi";
import { fetchVersionListings, fetchVersionXml } from "@/lib/versionBlobs";
import { qualityIssuesCsv } from "@/lib/versionStats";
import { useUpdateVersion } from "@/hooks/useSources";
import { ScoreBadge } from "./health";
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

export function VersionRow({
  source,
  version,
  isLive,
  canEdit,
  onApply,
  onDelete,
}: {
  source: SourceDTO;
  version: VersionDTO;
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

  const exportIssues = async () => {
    const listings = await fetchVersionListings(version.listingsBlobUrl);
    downloadText(`${source.name}-v${version.number}-quality-issues.csv`, qualityIssuesCsv(listings));
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
          </div>
        </div>
        <DiffBadges added={version.added} removed={version.removed} changed={version.changed} />
        <div className="flex items-center gap-1" title="Quality score">
          <ScoreBadge score={version.stats?.score} />
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
            <DropdownMenuItem onSelect={() => void exportIssues()}>
              <FileWarning className="mr-2 h-4 w-4" /> Export quality issues (CSV)
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
      {issues > 0 && (
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
