import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { liveVersionOf, type SourceDTO, type VersionDTO } from "@/lib/sourcesApi";
import { useAppData } from "@/providers/DataProvider";

/** Source select shown while the app scope is "all"; choosing one narrows the scope to that source. */
export function SourcePicker({ className }: { className?: string }) {
  const { scope, setScope, sources } = useAppData();
  if (scope.mode !== "all" || sources.length === 0) return null;
  return (
    <div className={className}>
      <span className="mb-1.5 block text-xs text-muted-foreground">Source</span>
      <Select value="" onValueChange={(agencyName) => setScope({ mode: "agency", agencyName })}>
        <SelectTrigger className="w-[min(100%,280px)]" aria-label="Source">
          <SelectValue placeholder="Choose a source…" />
        </SelectTrigger>
        <SelectContent>
          {sources.map((s) => (
            <SelectItem key={s.id} value={s.name}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Shown by pages that work on one source. With sources available it opens the largest one right
 * away (same as picking it in the source menu) instead of leaving the page blank.
 */
export function NoSourceState({ what }: { what: string }) {
  const { sources, isLoading, scope, setScope } = useAppData();
  const largest = [...sources].sort((a, b) => (liveVersionOf(b)?.listingCount ?? 0) - (liveVersionOf(a)?.listingCount ?? 0))[0];
  useEffect(() => {
    if (!isLoading && scope.mode === "all" && largest) setScope({ mode: "agency", agencyName: largest.name });
  }, [isLoading, scope.mode, largest, setScope]);
  if (isLoading || (scope.mode === "all" && largest)) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Opening {largest?.name ?? "source"}…</p>;
  }
  if (sources.length === 0) {
    return (
      <div className="py-16 text-center">
        <h2 className="mb-2 font-heading text-xl font-bold text-foreground">No feeds yet</h2>
        <p className="mb-5 text-sm text-muted-foreground">Add a source and upload a feed to use {what}.</p>
        <Button asChild>
          <Link to="/sources">Go to Sources</Link>
        </Button>
      </div>
    );
  }
  return <p className="py-10 text-center text-sm text-muted-foreground">Choose a source above to use {what}.</p>;
}

/** Version select over one source's versions. `value` is a version id, or "live". */
export function VersionPicker({
  source,
  value,
  onChange,
  label,
  className,
}: {
  source: SourceDTO;
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  const live = liveVersionOf(source);
  return (
    <div className={className}>
      <span className="mb-1.5 block text-xs text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[min(100%,240px)]" aria-label={label}>
          <SelectValue placeholder="Choose a version…" />
        </SelectTrigger>
        <SelectContent>
          {source.versions.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {versionLabel(v, live)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function versionLabel(v: VersionDTO, live: VersionDTO | null): string {
  return `v${v.number}${live?.id === v.id ? " (live)" : ""} · ${new Date(v.createdAt).toLocaleDateString()}`;
}

/** The version just older than `v` in `source.versions` (newest first), if any. */
export function olderVersion(source: SourceDTO, v: VersionDTO | null): VersionDTO | null {
  if (!v) return null;
  const i = source.versions.findIndex((x) => x.id === v.id);
  return i >= 0 ? (source.versions[i + 1] ?? null) : null;
}
