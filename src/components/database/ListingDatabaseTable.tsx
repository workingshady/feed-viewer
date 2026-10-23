import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DB_MISSING,
  clipDb,
  dbCurrency,
  dbDate,
  dbNum,
  dbPriceLabel,
  dbPurpose,
  dbStr,
  statusBadgeClass,
} from "@/lib/databaseFormat";
import { importListingDiffKey } from "@/lib/importAnalysis";
import type { DatabaseSortDir, DatabaseSortKey } from "@/lib/databaseSort";
import type { ListingTag } from "@/lib/listingDatabaseMeta";
import type { ImportListingStatus, Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

export type ListingDatabaseRow = {
  listing: Listing;
  tags: ListingTag[];
  rowKey: string;
};

type SortHeaderAlign = "start" | "center" | "end";

type CellCtx = {
  listing: Listing;
  tags: ListingTag[];
  rowKey: string;
  statusById: Map<string, ImportListingStatus>;
};

type ColDef = {
  id: string;
  header: string;
  sortKey: DatabaseSortKey | null;
  align: SortHeaderAlign;
  thExtra?: string;
  tdExtra?: string;
  render: (ctx: CellCtx) => React.ReactNode;
};

function SortHeader({
  colKey,
  label,
  sortKey,
  sortDir,
  onSort,
  align,
}: {
  colKey: DatabaseSortKey;
  label: string;
  sortKey: DatabaseSortKey;
  sortDir: DatabaseSortDir;
  onSort: (k: DatabaseSortKey) => void;
  align: SortHeaderAlign;
}) {
  const active = sortKey === colKey;
  return (
    <button
      type="button"
      onClick={() => onSort(colKey)}
      className={cn(
        "inline-flex min-h-8 w-full gap-1 rounded-md px-1 py-0.5 text-xs font-semibold transition-colors",
        align === "start" && "items-center justify-start text-left",
        align === "center" && "items-center justify-center text-center",
        align === "end" && "items-center justify-end text-right",
        active ? "text-foreground" : "text-muted-foreground",
        "hover:bg-background/80 hover:text-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      {active ? (
        sortDir === "asc" ? (
          <ArrowUp className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
        ) : (
          <ArrowDown className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 shrink-0 opacity-30" aria-hidden />
      )}
    </button>
  );
}

const LISTING_COLUMNS: ColDef[] = [
  {
    id: "importStatus",
    header: "Δ",
    sortKey: "importStatus",
    align: "center",
    thExtra: "w-20",
    tdExtra: "text-center",
    render: ({ listing: l, statusById }) => {
      const st = statusById.get(importListingDiffKey(l));
      return st ? (
        <Badge variant="outline" className={cn("px-2 py-0.5 text-[10px] font-medium capitalize", statusBadgeClass(st))}>
          {st}
        </Badge>
      ) : (
        <span className="font-mono text-xs text-muted-foreground">{DB_MISSING}</span>
      );
    },
  },
  {
    id: "reference",
    header: "Reference",
    sortKey: "reference",
    align: "start",
    thExtra: "min-w-[7rem]",
    tdExtra: "font-mono text-xs font-medium",
    render: ({ listing: l }) => <span className="break-all">{dbStr(l.reference)}</span>,
  },
  {
    id: "listingId",
    header: "ID",
    sortKey: "listingId",
    align: "start",
    thExtra: "min-w-[5.5rem]",
    tdExtra: "font-mono text-xs text-muted-foreground",
    render: ({ listing: l }) => (
      <span className="block max-w-[7rem] break-all" title={l.id || undefined}>
        {clipDb(l.id, 14)}
      </span>
    ),
  },
  {
    id: "title",
    header: "Title",
    sortKey: "title",
    align: "start",
    thExtra: "min-w-[12rem] max-w-[18rem]",
    tdExtra: "max-w-[18rem]",
    render: ({ listing: l }) => <span className="line-clamp-2 break-words">{dbStr(l.title)}</span>,
  },
  {
    id: "tags",
    header: "Tags",
    sortKey: null,
    align: "start",
    thExtra: "min-w-[8rem]",
    render: ({ tags }) =>
      tags.length === 0 ? (
        <span className="font-mono text-xs text-muted-foreground">{DB_MISSING}</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 4).map((t) => (
            <span
              key={t.id}
              className="inline rounded border border-border/60 bg-muted/50 px-1.5 py-px text-[10px] text-muted-foreground"
            >
              {t.label}
            </span>
          ))}
          {tags.length > 4 && <span className="text-[10px] text-muted-foreground">+{tags.length - 4}</span>}
        </div>
      ),
  },
  {
    id: "purpose",
    header: "Use",
    sortKey: "purpose",
    align: "center",
    thExtra: "w-16",
    tdExtra: "text-center capitalize text-muted-foreground",
    render: ({ listing: l }) => dbPurpose(l.purpose),
  },
  {
    id: "type",
    header: "Property type",
    sortKey: "propertyType",
    align: "start",
    thExtra: "min-w-[7rem]",
    tdExtra: "text-muted-foreground",
    render: ({ listing: l }) => <span className="line-clamp-2 break-words">{dbStr(l.propertyType)}</span>,
  },
  {
    id: "price",
    header: "Price",
    sortKey: "price",
    align: "end",
    thExtra: "min-w-[6.5rem]",
    tdExtra: "text-right tabular-nums",
    render: ({ listing: l }) => {
      const pl = dbPriceLabel(l);
      const cl = dbCurrency(l);
      if (pl === DB_MISSING) return <span className="font-mono text-muted-foreground">{DB_MISSING}</span>;
      return (
        <>
          <span className="font-medium text-foreground">{pl}</span>
          <span className={cn("ml-1 text-xs", cl === DB_MISSING ? "font-mono text-muted-foreground" : "text-muted-foreground")}>
            {cl}
          </span>
        </>
      );
    },
  },
  {
    id: "bedrooms",
    header: "Beds",
    sortKey: "beds",
    align: "center",
    thExtra: "w-12",
    tdExtra: "text-center font-mono text-xs tabular-nums text-muted-foreground",
    render: ({ listing: l }) => dbNum(l.beds),
  },
  {
    id: "bathrooms",
    header: "Baths",
    sortKey: "baths",
    align: "center",
    thExtra: "w-12",
    tdExtra: "text-center font-mono text-xs tabular-nums text-muted-foreground",
    render: ({ listing: l }) => dbNum(l.baths),
  },
  {
    id: "area",
    header: "Area",
    sortKey: "area",
    align: "end",
    thExtra: "min-w-[5.5rem]",
    tdExtra: "text-right font-mono text-xs tabular-nums text-muted-foreground",
    render: ({ listing: l }) =>
      typeof l.area === "number" && Number.isFinite(l.area) && l.area > 0 ? (
        <>
          {l.area}
          <span className="text-muted-foreground"> {dbStr(l.areaUnit)}</span>
        </>
      ) : (
        DB_MISSING
      ),
  },
  {
    id: "images",
    header: "Img",
    sortKey: "images",
    align: "center",
    thExtra: "w-11",
    tdExtra: "text-center font-mono text-xs tabular-nums text-muted-foreground",
    render: ({ listing: l }) => (Array.isArray(l.images) ? dbNum(l.images.length) : DB_MISSING),
  },
  {
    id: "furnished",
    header: "Furn.",
    sortKey: "furnished",
    align: "start",
    thExtra: "min-w-[5rem]",
    tdExtra: "text-muted-foreground",
    render: ({ listing: l }) => <span className="line-clamp-2 break-words">{clipDb(l.furnished, 14)}</span>,
  },
  {
    id: "completion",
    header: "Completion",
    sortKey: "completion",
    align: "start",
    thExtra: "min-w-[6rem]",
    tdExtra: "text-muted-foreground",
    render: ({ listing: l }) => <span className="line-clamp-2 break-words">{clipDb(l.completionStatus, 18)}</span>,
  },
  {
    id: "parking",
    header: "Pk",
    sortKey: "parking",
    align: "center",
    thExtra: "w-11",
    tdExtra: "text-center font-mono text-xs tabular-nums text-muted-foreground",
    render: ({ listing: l }) => dbNum(l.parking),
  },
  {
    id: "permit",
    header: "Permit",
    sortKey: "permit",
    align: "start",
    thExtra: "min-w-[6rem]",
    tdExtra: "font-mono text-xs text-muted-foreground",
    render: ({ listing: l }) => <span className="break-all">{clipDb(l.permitNumber, 16)}</span>,
  },
  {
    id: "amenities",
    header: "Amn",
    sortKey: "amenities",
    align: "center",
    thExtra: "w-11",
    tdExtra: "text-center font-mono text-xs tabular-nums text-muted-foreground",
    render: ({ listing: l }) => (Array.isArray(l.amenities) ? dbNum(l.amenities.length) : DB_MISSING),
  },
  {
    id: "location",
    header: "City / area",
    sortKey: "city",
    align: "start",
    thExtra: "min-w-[8rem]",
    render: ({ listing: l }) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">{dbStr(l.city)}</div>
        <div className="truncate text-xs text-muted-foreground">{dbStr(l.community)}</div>
      </div>
    ),
  },
  {
    id: "subCommunity",
    header: "Sub",
    sortKey: "subCommunity",
    align: "start",
    thExtra: "min-w-[6rem]",
    tdExtra: "text-muted-foreground",
    render: ({ listing: l }) => <span className="line-clamp-2 break-words">{dbStr(l.subCommunity)}</span>,
  },
  {
    id: "developer",
    header: "Developer",
    sortKey: "developer",
    align: "start",
    thExtra: "min-w-[7rem]",
    tdExtra: "text-muted-foreground",
    render: ({ listing: l }) => <span className="line-clamp-2 break-words">{clipDb(l.developer, 22)}</span>,
  },
  {
    id: "payment",
    header: "Payment",
    sortKey: "paymentMethod",
    align: "start",
    thExtra: "min-w-[6rem]",
    tdExtra: "text-muted-foreground",
    render: ({ listing: l }) => <span className="line-clamp-2 break-words">{clipDb(l.paymentMethod, 16)}</span>,
  },
  {
    id: "agent",
    header: "Agent",
    sortKey: "agentName",
    align: "start",
    thExtra: "min-w-[7rem]",
    tdExtra: "text-muted-foreground",
    render: ({ listing: l }) => <span className="line-clamp-2 break-words">{dbStr(l.agent?.name)}</span>,
  },
  {
    id: "updated",
    header: "Updated",
    sortKey: "lastUpdate",
    align: "start",
    thExtra: "min-w-[5.5rem]",
    tdExtra: "whitespace-nowrap font-mono text-xs text-muted-foreground",
    render: ({ listing: l }) => dbDate(l.lastUpdate),
  },
  {
    id: "actions",
    header: "",
    sortKey: null,
    align: "end",
    thExtra: "w-12",
    tdExtra: "text-right",
    render: ({ listing: l }) => (
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
        <Link to={`/listing/${encodeURIComponent(l.id)}`} aria-label={`Open listing ${l.reference || l.id}`}>
          <ExternalLink className="h-4 w-4" />
        </Link>
      </Button>
    ),
  },
];

function thAlign(align: SortHeaderAlign): string {
  if (align === "center") return "text-center";
  if (align === "end") return "text-right";
  return "text-left";
}

function tdAlign(align: SortHeaderAlign): string {
  if (align === "center") return "text-center";
  if (align === "end") return "text-right";
  return "text-left";
}

type ListingDatabaseTableProps = {
  rows: ListingDatabaseRow[];
  visibleCols: Record<string, boolean>;
  sortKey: DatabaseSortKey;
  sortDir: DatabaseSortDir;
  onSort: (k: DatabaseSortKey) => void;
  statusById: Map<string, ImportListingStatus>;
  /** For screen readers */
  resultCount: number;
};

export function ListingDatabaseTable({
  rows,
  visibleCols,
  sortKey,
  sortDir,
  onSort,
  statusById,
  resultCount,
}: ListingDatabaseTableProps) {
  const activeCols = useMemo(
    () => LISTING_COLUMNS.filter((c) => visibleCols[c.id] !== false),
    [visibleCols],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="max-h-[min(72vh,780px)] w-full overflow-auto overscroll-contain [scrollbar-gutter:stable]">
        <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-[13px] leading-snug">
          <caption className="sr-only">
            Listing data grid, {resultCount} rows after filters, sorted by {sortKey} {sortDir}.
          </caption>
          <thead className="sticky top-0 z-20">
            <tr className="bg-muted/95 shadow-[inset_0_-1px_0_0_hsl(var(--border))] backdrop-blur-sm dark:bg-muted/90">
              {activeCols.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className={cn(
                    "border-b border-border px-3 py-2.5 align-middle first:pl-4 last:pr-4",
                    thAlign(c.align),
                    c.thExtra,
                  )}
                >
                  {c.sortKey ? (
                    <SortHeader
                      colKey={c.sortKey}
                      label={c.header}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={onSort}
                      align={c.align}
                    />
                  ) : c.id === "actions" ? (
                    <span className="sr-only">Open</span>
                  ) : (
                    <span className="text-xs font-semibold text-muted-foreground">{c.header}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&_tr:nth-child(even)]:bg-muted/20">
            {rows.map((row) => (
              <tr
                key={row.rowKey}
                className="border-b border-border/40 transition-colors hover:bg-primary/[0.04] dark:hover:bg-primary/[0.07]"
              >
                {activeCols.map((c) => (
                  <td
                    key={c.id}
                    className={cn(
                      "border-b border-border/35 px-3 py-2.5 align-middle first:pl-4 last:pr-4",
                      tdAlign(c.align),
                      c.tdExtra,
                    )}
                  >
                    {c.render({
                      listing: row.listing,
                      tags: row.tags,
                      rowKey: row.rowKey,
                      statusById,
                    })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const LISTING_DATABASE_COLUMN_IDS = LISTING_COLUMNS.map((c) => c.id);
