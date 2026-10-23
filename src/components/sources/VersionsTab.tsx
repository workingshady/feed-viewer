import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SourceDTO, VersionDTO } from "@/lib/sourcesApi";
import { VersionRow } from "./VersionRow";

type Filter = "all" | "pending" | "pinned" | "issues";

/** Versions newer than live were held back (safety rule) or not yet applied. */
const isPending = (s: SourceDTO, v: VersionDTO) => {
  const live = s.versions.find((x) => x.id === s.activeVersionId);
  return v.id !== s.activeVersionId && (!live || v.number > live.number);
};

export function VersionsTab({
  source,
  canEdit,
  onApply,
  onDelete,
}: {
  source: SourceDTO;
  canEdit: boolean;
  onApply: (v: VersionDTO) => void;
  onDelete: (v: VersionDTO) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => ({
      all: source.versions.length,
      pending: source.versions.filter((v) => isPending(source, v)).length,
      pinned: source.versions.filter((v) => v.pinned).length,
      issues: source.versions.filter((v) => (v.warnings?.errors.length ?? 0) > 0).length,
    }),
    [source],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return source.versions.filter((v) => {
      if (filter === "pending" && !isPending(source, v)) return false;
      if (filter === "pinned" && !v.pinned) return false;
      if (filter === "issues" && !(v.warnings?.errors.length ?? 0)) return false;
      return !q || `v${v.number} ${v.fileName} ${v.note ?? ""} ${v.createdBy?.username ?? ""}`.toLowerCase().includes(q);
    });
  }, [source, filter, query]);

  const FILTERS: [Filter, string][] = [
    ["all", "All"],
    ["pending", "Waiting to apply"],
    ["pinned", "Pinned"],
    ["issues", "Parser errors"],
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter versions">
          {FILTERS.filter(([f]) => f === "all" || counts[f] > 0).map(([f, label]) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
              )}
            >
              {label} <span className="font-mono tabular-nums opacity-80">{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search file, note, uploader"
            className="pl-8"
            aria-label="Search versions"
          />
        </div>
      </div>
      <ol className="space-y-2">
        {shown.map((v) => (
          <VersionRow
            key={v.id + (v.note ?? "")}
            source={source}
            version={v}
            previous={source.versions.find((x) => x.number < v.number) ?? null}
            isLive={v.id === source.activeVersionId}
            canEdit={canEdit}
            onApply={() => onApply(v)}
            onDelete={() => onDelete(v)}
          />
        ))}
        {shown.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No versions match.</li>}
      </ol>
    </div>
  );
}
