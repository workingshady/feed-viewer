import { cn } from "@/lib/utils";
import { ArrowRightLeft, GitCompare, Link2 } from "lucide-react";
import { Fragment } from "react";
import { Link } from "react-router-dom";

export type WorkflowComparePageId = "listing-compare" | "feed-compare" | "cross-agency";

const LINKS: {
  id: WorkflowComparePageId;
  to: string;
  label: string;
  Icon: typeof GitCompare;
}[] = [
  { id: "listing-compare", to: "/compare", label: "Listing compare", Icon: GitCompare },
  { id: "feed-compare", to: "/feed-compare", label: "Feed compare", Icon: ArrowRightLeft },
  { id: "cross-agency", to: "/cross-agency-dupes", label: "Cross-agency dupes", Icon: Link2 },
];

type Props = {
  /** Highlights the active page and sets aria-current="page". */
  current?: WorkflowComparePageId;
  className?: string;
  /** Visible label before links (hidden on very small screens if needed). */
  heading?: string;
};

/**
 * Cross-links between listing-side-by-side compare, feed diff, and cross-agency duplicate detection.
 */
export function WorkflowCompareLinks({ current, className, heading = "Compare & analysis" }: Props) {
  return (
    <nav
      aria-label={heading}
      className={cn("flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground", className)}
    >
      <span className="font-medium text-foreground">{heading}</span>
      {LINKS.map((item) => (
        <Fragment key={item.id}>
          <span className="opacity-40" aria-hidden>
            ·
          </span>
          <Link
            to={item.to}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm outline-none transition-colors hover:text-primary-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              current === item.id
                ? "font-semibold text-foreground underline decoration-primary/50 underline-offset-4"
                : "text-primary-text hover:underline underline-offset-2"
            )}
            aria-current={current === item.id ? "page" : undefined}
          >
            <item.Icon className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden />
            {item.label}
          </Link>
        </Fragment>
      ))}
    </nav>
  );
}
