import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, ImageIcon } from "lucide-react";
import { DiffSide, TextDiffPanes } from "@/components/compare/InlineDiff";
import { wordDiff } from "@/lib/wordDiff";
import { CATEGORY_ICON, fieldLabel } from "@/lib/changeDisplay";
import { mediaKey, type FieldChange, type ListingChangeSet } from "@/lib/listingChanges";
import { formatListingFieldValue } from "@/lib/listingFieldFormat";
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
  const strip = (label: string, urls: string[], tone: string) =>
    urls.length ? (
      <div className={cn("space-y-1.5 rounded-lg border p-2", tone)}>
        <div className="text-[11px] font-semibold text-muted-foreground">
          {label} ({urls.length})
        </div>
        <div className="flex flex-wrap gap-1.5">
          {urls.slice(0, 10).map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer">
              <Thumb src={u} className="h-14 w-20" />
            </a>
          ))}
          {urls.length > 10 && <span className="self-center text-[11px] text-muted-foreground">+{urls.length - 10}</span>}
        </div>
      </div>
    ) : null;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {strip("Photos removed", removed, "border-destructive/20 bg-destructive/[0.03]")}
      {strip("Photos added", added, "border-success/25 bg-success/[0.04]")}
    </div>
  );
}

/** Short text fields shown as a word diff inside the before/after cells. */
const WORD_DIFF_KEYS: ReadonlySet<keyof Listing> = new Set<keyof Listing>(["title", "address", "community", "subCommunity", "propertyName", "city", "developer"]);

/** "+5.4%" style badge for numeric changes, coloured by direction where direction has meaning. */
function DeltaBadge({ change, before, after }: { change: FieldChange; before: Listing; after: Listing }) {
  const x = Number(before[change.key]);
  const y = Number(after[change.key]);
  if (!(x > 0 && y > 0) || !["price", "area", "plotSize", "serviceCharge"].includes(change.key)) return null;
  const pct = ((y - x) / x) * 100;
  const tone = change.key === "price" || change.key === "serviceCharge" ? (pct < 0 ? "text-success" : "text-destructive-text") : "text-muted-foreground";
  return (
    <span className={cn("ml-2 inline-flex items-center rounded-full bg-muted px-1.5 py-px font-mono text-[10px] tabular-nums", tone)}>
      {pct > 0 ? "+" : "−"}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/**
 * Field-by-field detail for one changed listing, laid out as Before → After: removed values on a red
 * tint, new values on a green tint, words that changed highlighted inside text, numeric moves as a
 * % badge, description as two side-by-side panes, photos as removed/added strips, and data that was
 * only filled in or dropped listed separately.
 */
export function ChangeDetail({
  before,
  after,
  changes,
  labels = { before: "Before", after: "After" },
}: {
  before: Listing;
  after: Listing;
  changes: ListingChangeSet;
  labels?: { before: string; after: string };
}) {
  const table = changes.material.filter((c) => c.key !== "description" && c.key !== "images");
  const desc = changes.material.find((c) => c.key === "description");
  const photos = changes.material.find((c) => c.key === "images");
  const value = (k: keyof Listing, l: Listing) => (k === "latitude" ? `${l.latitude ?? "—"}, ${l.longitude ?? "—"}` : formatListingFieldValue(k, l));
  return (
    <div className="space-y-4">
      {(photos || before.images[0] !== after.images[0]) && (
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          {([["before", before], ["after", after]] as const).map(([side, l]) => (
            <figure key={side} className="space-y-1">
              <Thumb src={l.images[0]} className="aspect-[4/3] w-full" />
              <figcaption className="text-[11px] text-muted-foreground">
                {labels[side]} · {l.images.length} photos
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {table.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[36rem] text-xs">
            <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-36 px-3 py-2 font-semibold">Field</th>
                <th className="px-3 py-2 font-semibold">{labels.before}</th>
                <th className="w-6 px-0 py-2" aria-hidden />
                <th className="px-3 py-2 font-semibold">{labels.after}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {table.map((c) => {
                const vb = value(c.key, before);
                const va = value(c.key, after);
                const d = WORD_DIFF_KEYS.has(c.key) ? wordDiff(vb, va) : null;
                return (
                  <tr key={c.key} className="align-top">
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                      {fieldLabel(c.key)}
                      {c.minor && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">minor</span>}
                    </td>
                    <td className="max-w-[20rem] break-words bg-destructive/[0.05] px-3 py-2 text-muted-foreground">
                      {d ? <DiffSide tokens={d.tokens} side="before" /> : vb}
                    </td>
                    <td className="px-0 py-2 text-center text-muted-foreground" aria-hidden>
                      <ArrowRight className="mx-auto h-3.5 w-3.5" />
                    </td>
                    <td className="max-w-[20rem] break-words bg-success/[0.06] px-3 py-2 font-medium text-foreground">
                      {d ? <DiffSide tokens={d.tokens} side="after" /> : va}
                      <DeltaBadge change={c} before={before} after={after} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {desc && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-foreground">Description</div>
          <TextDiffPanes before={before.description ?? ""} after={after.description ?? ""} labels={labels} />
        </div>
      )}
      {photos && <PhotoDelta before={before} after={after} />}
      {changes.completeness.length > 0 && (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Data only filled in or dropped (not counted as a change): </span>
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
  labels,
}: {
  before: Listing;
  after: Listing;
  changes: ListingChangeSet;
  href?: string;
  /** Extra line under the title (e.g. relisted: old → new reference with evidence). */
  header?: ReactNode;
  defaultOpen?: boolean;
  /** Names for the two sides, e.g. "Before · v3" / "After · v4". */
  labels?: { before: string; after: string };
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
          <ChangeDetail before={before} after={after} changes={changes} labels={labels} />
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

