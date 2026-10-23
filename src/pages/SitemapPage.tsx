import AppHeader from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildSiteMapSections,
  SITEMAP_DYNAMIC_ROUTES,
  SITEMAP_REDIRECTS,
} from "@/lib/siteMapData";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { ListTree } from "lucide-react";
import { Link } from "react-router-dom";
import { useMemo } from "react";

export default function SitemapPage() {
  const { user } = useAuth();
  const sections = useMemo(() => buildSiteMapSections(user?.role), [user?.role]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      <main className="flex-1 container max-w-[min(100%,56rem)] py-8 px-4 sm:px-6 space-y-8 pb-16">
        <header className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 ring-1 ring-primary/20">
              <ListTree className="w-6 h-6 text-primary-text" aria-hidden />
            </span>
            Site map
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-prose">
            Every organized route in FeedView — same groupings as the navigation menu and footer shortcuts. Dynamic paths
            and redirects are listed at the bottom.
          </p>
        </header>

        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.id} aria-labelledby={`sitemap-${section.id}`}>
              <div className="mb-3">
                <h2 id={`sitemap-${section.id}`} className="text-lg font-semibold text-foreground">
                  {section.heading}
                </h2>
                {section.description ? (
                  <p className="text-xs text-muted-foreground mt-1">{section.description}</p>
                ) : null}
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {section.items.map((item) => (
                  <li key={`${section.id}-${item.to}`}>
                    <Link
                      to={item.to}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-sm shadow-sm transition-colors",
                        "hover:bg-accent/50 hover:border-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      )}
                    >
                      <span className="font-medium text-foreground">{item.label}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        {item.admin ? (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            Admin
                          </Badge>
                        ) : null}
                        <code className="text-[11px] text-muted-foreground font-mono truncate max-w-[14rem]">{item.to}</code>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <Card className="border-dashed bg-muted/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Redirects & aliases</CardTitle>
            <CardDescription className="text-xs">
              Old or short URLs that forward to the canonical route.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="divide-y divide-border rounded-md border border-border">
              {SITEMAP_REDIRECTS.map((r) => (
                <li key={r.from} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 font-mono text-[12px]">
                  <span className="text-muted-foreground">{r.from}</span>
                  <span aria-hidden className="text-muted-foreground/50">
                    →
                  </span>
                  <Link to={r.to} className="text-primary-text hover:underline">
                    {r.to}
                  </Link>
                  {r.note ? <span className="text-[11px] text-muted-foreground font-sans w-full sm:w-auto">{r.note}</span> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Dynamic routes</CardTitle>
            <CardDescription className="text-xs">
              Detail pages use parameters — replace placeholders with real ids from your workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-3">
              {SITEMAP_DYNAMIC_ROUTES.map((r) => (
                <li key={r.pattern} className="rounded-lg border border-border bg-muted/15 px-3 py-2">
                  <div className="font-mono text-xs text-foreground">{r.pattern}</div>
                  <div className="text-sm font-medium text-foreground mt-1">{r.label}</div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{r.hint}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <p className="text-[11px] text-muted-foreground text-center">
          Tip: Press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>{" "}
          +{" "}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">K</kbd> for the command
          palette — or see the full{" "}
          <Link to="/shortcuts" className="text-primary-text underline underline-offset-2 hover:text-primary-text/90">
            keyboard shortcuts
          </Link>{" "}
          page.
        </p>
      </main>
    </div>
  );
}
