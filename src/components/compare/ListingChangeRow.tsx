import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ImageIcon } from "lucide-react";
import { CATEGORY_ICON, fieldLabel } from "@/lib/changeDisplay";
import { GitStyleDiffBlock } from "@/components/GitStyleDiffBlock";
import { mediaKey, type FieldChange, type ListingChangeSet } from "@/lib/listingChanges";
import { formatListingFieldValue } from "@/lib/listingFieldFormat";
import { diffPlainText } from "@/lib/textLineDiff";
import type { Listing } from "@/lib/types";
import { formatPriceCompact } from "@/lib/displayPrice";
import { cn } from "@/lib/utils";

/** One change as a compact chip: category icon + plain-language summary. Price direction uses text tokens. */
export function ChangeChip({ change }: { change: FieldChange }) {
  const Icon = CATEGORY_ICON[change.category];
  const down = change.key === "price" && change.summary.includes("(−");
  const up = change.key === "price" && change.summary.includes("(+");
  return (
    <span
      title={`${fieldLabel(change.key)}: ${change.summary}`}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md bg-muted/70 px-1.5 py-0.5 text-[11px] ring-1 ring-inset ring-border/70",
        change.minor && "opacity-75",
      )}
    >
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className="shrink-0 font-medium text-foreground">{fieldLabel(change.key)}</span>
      <span className={cn("truncate text-muted-foreground", down && "text-success", up && "text-destructive-text")}>{change.summary}</span>
    </span>
  );
}

function Thumb({ src, className }: { src?: string; className?: string }) {
  return src ? (
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className={cn("rounded-md bg-muted object-cover", className)} />
  ) : (
    <span className={cn("flex items-center justify-center rounded-md bg-muted", className)}>
      <ImageIcon className="h-4 w-4 text-muted-foreground/60" aria-hidden />
    </span>
  );
}

function PhotoDelta({ before, after }: { before: Listing; after: Listing }) {
  const b = new Set(before.images.map(mediaKey));
  const a = new Set(after.images.map(mediaKey));
  const added = after.images.filter((u) => !b.has(mediaKey(u)));
  const removed = before.images.filter((u) => !a.has(mediaKey(u)));
  const strip = (label: string, urls: string[]) =>
    urls.length ? (
      <div className="space-y-1">
        <div className="text-[11px] font-semibold text-muted-foreground">
          {label} ({urls.length})
        </div>
        <div className="flex flex-wrap gap-1.5">
          {urls.slice(0, 10).map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer">
              <Thumb src={u} className="h-12 w-16" />
            </a>
          ))}
        </div>
      </div>
    ) : null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {strip("Photos added", added)}
      {strip("Photos removed", removed)}
    </div>
  );
}

/** Field-by-field detail for one changed listing: values, text diffs, photo changes, data gaps. */
export function ChangeDetail({ before, after, changes }: { before: Listing; after: Listing; changes: ListingChangeSet }) {
  const table = changes.material.filter((c) => c.key !== "description" && c.key !== "images");
  const desc = changes.material.find((c) => c.key === "description");
  const photos = changes.material.find((c) => c.key === "images");
  const value = (k: keyof Listing, l: Listing) => (k === "latitude" ? `${l.latitude ?? "—"}, ${l.longitude ?? "—"}` : formatListingFieldValue(k, l));
  return (
    <div className="space-y-4">
      {table.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[32rem] text-xs">
            <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Field</th>
                <th className="px-3 py-2 font-semibold">Before</th>
                <th className="px-3 py-2 font-semibold">After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {table.map((c) => (
                <tr key={c.key}>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground">{fieldLabel(c.key)}</td>
                  <td className="max-w-[18rem] break-words px-3 py-2 text-muted-foreground line-through decoration-destructive/40">{value(c.key, before)}</td>
                  <td className="max-w-[18rem] break-words px-3 py-2 text-foreground">{value(c.key, after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {desc && (() => {
        const d = diffPlainText(before.description ?? "", after.description ?? "");
        return <GitStyleDiffBlock label="Description" lines={d.lines} truncated={d.truncated} fallback={d.fallback} maxHeightClass="max-h-72" />;
      })()}
      {photos && <PhotoDelta before={before} after={after} />}
      {changes.completeness.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Data completeness: </span>
          {changes.completeness.map((c) => `${fieldLabel(c.key)} ${c.kind === "filled" ? "filled in" : "now empty"}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

/**
 * A changed (or relisted) listing as one scannable row: photo, title, reference, the changes as
 * chips; expands into the full field-by-field detail.
 */
export function ListingChangeRow({
  before,
  after,
  changes,
  href,
  header,
  defaultOpen = false,
}: {
  before: Listing;
  after: Listing;
  changes: ListingChangeSet;
  href?: string;
  /** Extra line under the title (e.g. relisted: old → new reference with evidence). */
  header?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const chips = changes.material;
  return (
    <li className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Thumb src={after.images[0] || before.images[0]} className="h-14 w-20 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{after.title || before.title || "Untitled"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="font-mono">{after.reference || before.reference || "no reference"}</span>
            {after.community && <span>· {after.community}</span>}
            {after.price > 0 && <span className="tabular-nums">· {after.currency} {formatPriceCompact(after.price)}</span>}
          </div>
          {header}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {chips.slice(0, 5).map((c) => (
                <ChangeChip key={c.key} change={c} />
              ))}
              {chips.length > 5 && <span className="self-center text-[11px] text-muted-foreground">+{chips.length - 5} more</span>}
            </div>
          )}
        </div>
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-3 pb-3 pt-3">
          <ChangeDetail before={before} after={after} changes={changes} />
          {href && (
            <Link to={href} className="inline-block text-xs font-medium text-primary-text hover:underline">
              Open listing →
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

