import { cn } from "@/lib/utils";
import { SITE_FOOTER_GROUPS } from "@/lib/siteFooterData";
import { Keyboard } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

export type SiteFooterVariant = "brand" | "surface";

type SiteFooterProps = {
  variant?: SiteFooterVariant;
  className?: string;
};

/**
 * Shared site footer — logo locks to header branding; columns follow `siteFooterData`.
 * Use `brand` on the marketing home shell; `surface` on standard app pages.
 */
export function SiteFooter({ variant = "surface", className }: SiteFooterProps) {
  const isBrand = variant === "brand";
  const year = new Date().getFullYear();

  return (
    <footer
      className={cn(
        "w-full shrink-0 border-t",
        isBrand
          ? "border-primary/25 bg-[#070807] text-white"
          : "border-border bg-muted/35 text-foreground",
        className,
      )}
      aria-label="Site footer"
    >
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-8 py-12 lg:py-14">
        <div className="flex flex-col gap-12 lg:flex-row lg:gap-12 xl:gap-16">
          {/* Brand */}
          <div className="shrink-0 space-y-4 lg:w-[min(100%,280px)]">
            <Link
              to="/"
              className={cn(
                "inline-flex items-center gap-3 rounded-xl outline-none transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isBrand ? "focus-visible:ring-offset-[#070807]" : "focus-visible:ring-offset-background",
              )}
              aria-label="FeedView home"
            >
              <span className="sr-only">FeedView</span>
              <img
                src="/logo.webp"
                alt=""
                width={280}
                height={64}
                className={cn(
                  "h-10 w-auto max-w-[min(220px,52vw)] object-contain object-left sm:h-11",
                  isBrand && "brightness-0 invert contrast-110 opacity-95",
                )}
              />
            </Link>
            <p
              className={cn(
                "max-w-md text-sm leading-relaxed font-body",
                isBrand ? "text-white/65" : "text-muted-foreground",
              )}
            >
              XML property feed viewer — import, map, validate, compare, and browse listings with operational clarity.
            </p>
          </div>

          <div className="grid min-w-0 flex-1 grid-cols-1 gap-10 sm:grid-cols-2 xl:grid-cols-4 xl:gap-x-10">
          {SITE_FOOTER_GROUPS.map((group) => (
            <nav key={group.id} className="min-w-0 space-y-3" aria-labelledby={`footer-${group.id}`}>
              <h2
                id={`footer-${group.id}`}
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-[0.22em] font-body",
                  isBrand ? "text-white/45" : "text-muted-foreground",
                )}
              >
                {group.title}
              </h2>
              <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
                {group.links.map((item) => (
                  <li key={`${group.id}-${item.to}`}>
                    <Link
                      to={item.to}
                      className={cn(
                        "inline-block text-[13px] font-medium font-body py-0.5 transition-colors rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        isBrand
                          ? "text-white/75 hover:text-brand-amber focus-visible:text-brand-amber focus-visible:ring-offset-[#070807]"
                          : "text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:ring-offset-background",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className={cn(
            "mt-12 flex flex-col gap-4 border-t pt-8 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
            isBrand ? "border-white/10" : "border-border",
          )}
        >
          <p className={cn("text-[12px] font-body order-2 sm:order-1", isBrand ? "text-white/45" : "text-muted-foreground")}>
            © {year} FeedView. Property feed tooling for teams and integrators.
          </p>
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] font-body order-1 sm:order-2",
              isBrand ? "text-white/55" : "text-muted-foreground",
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <Keyboard className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              <span>
                Quick search:{" "}
                <kbd
                  className={cn(
                    "rounded border px-1.5 py-0.5 font-mono text-[10px]",
                    isBrand ? "border-white/20 bg-white/10 text-white/85" : "border-border bg-background text-foreground",
                  )}
                >
                  Ctrl
                </kbd>
                {" + "}
                <kbd
                  className={cn(
                    "rounded border px-1.5 py-0.5 font-mono text-[10px]",
                    isBrand ? "border-white/20 bg-white/10 text-white/85" : "border-border bg-background text-foreground",
                  )}
                >
                  K
                </kbd>
              </span>
            </span>
            <span className={isBrand ? "text-white/25" : "text-border"} aria-hidden>
              |
            </span>
            <Link
              to="/shortcuts"
              className={cn(
                "font-medium underline-offset-4 hover:underline outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring",
                isBrand ? "text-white/75 hover:text-brand-amber focus-visible:ring-offset-2 focus-visible:ring-offset-[#070807]" : "hover:text-foreground focus-visible:text-foreground",
              )}
            >
              All shortcuts
            </Link>
            <span className={isBrand ? "text-white/25" : "text-border"} aria-hidden>
              |
            </span>
            <Link
              to="/sitemap"
              className={cn(
                "font-medium underline-offset-4 hover:underline outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring",
                isBrand ? "text-white/75 hover:text-brand-amber focus-visible:ring-offset-2 focus-visible:ring-offset-[#070807]" : "hover:text-foreground focus-visible:text-foreground",
              )}
            >
              Full site map
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

/** Renders footer for most routes; hides on auth screens; home uses richer `brand` styling. */
export function SiteFooterGate() {
  const { pathname } = useLocation();
  if (pathname === "/login" || pathname === "/signup") return null;
  const variant: SiteFooterVariant = pathname === "/" ? "brand" : "surface";
  return <SiteFooter variant={variant} />;
}
