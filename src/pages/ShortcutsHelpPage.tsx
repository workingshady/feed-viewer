import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dispatchOpenCommandPalette } from "@/lib/commandPaletteBus";
import {
  KEYBOARD_SHORTCUT_GROUPS,
  WORKFLOW_TIP_SECTIONS,
  formatShortcutKeys,
  preferMacModifier,
} from "@/lib/keyboardShortcuts";
import { cn } from "@/lib/utils";
import { Keyboard, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";

const SHORTCUTS_PANEL_TAB_KEY = "feedview.shortcuts.panel";

type PanelTab = "reference" | "workflow";

function readStoredPanel(): PanelTab | null {
  try {
    const raw = sessionStorage.getItem(SHORTCUTS_PANEL_TAB_KEY);
    if (raw === "reference" || raw === "workflow") return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export default function ShortcutsHelpPage() {
  const mac = preferMacModifier();
  const [panel, setPanel] = useState<PanelTab>(() => readStoredPanel() ?? "reference");

  useEffect(() => {
    try {
      sessionStorage.setItem(SHORTCUTS_PANEL_TAB_KEY, panel);
    } catch {
      /* ignore */
    }
  }, [panel]);

  const openPaletteDemo = useCallback(() => {
    dispatchOpenCommandPalette();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      <main className="flex-1 container max-w-[min(100%,56rem)] py-8 px-4 sm:px-6 space-y-8 pb-16">
        <header className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 ring-1 ring-primary/20">
              <Keyboard className="w-6 h-6 text-primary-text" aria-hidden />
            </span>
            Keyboard shortcuts
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-prose">
            Reference tables plus workflow notes for the upload → review → apply loop. Toggle tabs
            below — your choice is remembered for this session.
          </p>
        </header>

        <Tabs value={panel} onValueChange={(v) => setPanel(v as PanelTab)} className="w-full space-y-6">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/40 p-1 sm:inline-flex sm:w-auto">
            <TabsTrigger value="reference" className="gap-2 rounded-lg">
              <Keyboard className="w-4 h-4 shrink-0 opacity-70" aria-hidden />
              Reference
            </TabsTrigger>
            <TabsTrigger value="workflow" className="gap-2 rounded-lg">
              <Sparkles className="w-4 h-4 shrink-0 opacity-70" aria-hidden />
              Workflow tips
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reference" className="space-y-6 mt-0 outline-none focus-visible:outline-none">
            {KEYBOARD_SHORTCUT_GROUPS.map((group) => (
              <Card key={group.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{group.title}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground text-xs uppercase tracking-wide">
                        <th className="py-2 pr-4 font-medium">Action</th>
                        <th className="py-2 pr-4 font-medium whitespace-nowrap">{mac ? "Shortcut (Mac)" : "Shortcut"}</th>
                        <th className="py-2 font-medium hidden sm:table-cell">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={`${group.id}-${row.action}`} className="border-b border-border/60 last:border-0">
                          <td className="py-3 pr-4 align-top font-medium text-foreground">{row.action}</td>
                          <td className="py-3 pr-4 align-top whitespace-nowrap">
                            <kbd
                              className={cn(
                                "rounded border border-border bg-muted px-2 py-1 font-mono text-[12px] text-foreground",
                                row.keys === "—" && "border-dashed text-muted-foreground",
                              )}
                            >
                              {formatShortcutKeys(row)}
                            </kbd>
                          </td>
                          <td className="py-3 align-top text-muted-foreground text-xs hidden sm:table-cell max-w-md">
                            {row.note ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="sm:hidden text-xs text-muted-foreground mt-3 space-y-1">
                    {group.rows.map((row) =>
                      row.note ? (
                        <span key={`${group.id}-${row.action}-m`} className="block">
                          <span className="font-medium text-foreground">{row.action}:</span> {row.note}
                        </span>
                      ) : null,
                    )}
                  </p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="workflow" className="space-y-6 mt-0 outline-none focus-visible:outline-none">
            <Card className="border-primary/20 bg-primary/[0.04]">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Try the command palette</CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  Opens the same dialog as Ctrl+K — search routes, workflows, and recent listings without leaving this page.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button type="button" size="sm" className="gap-2" onClick={openPaletteDemo}>
                  <Sparkles className="w-4 h-4" aria-hidden />
                  Open command palette
                </Button>
              </CardContent>
            </Card>

            {WORKFLOW_TIP_SECTIONS.map((sec) => (
              <Card key={sec.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{sec.title}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground leading-relaxed">
                    {sec.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>

        <Card className="border-dashed bg-muted/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Related</CardTitle>
            <CardDescription className="text-xs">
              Discover every route from one place, or jump to exports.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-x-3 gap-y-2 text-sm">
            <Link to="/sitemap" className="text-primary-text font-medium underline underline-offset-2 hover:text-primary-text/90">
              Site map
            </Link>
            <span className="text-muted-foreground" aria-hidden>
              ·
            </span>
            <Link to="/export-hub" className="text-primary-text font-medium underline underline-offset-2 hover:text-primary-text/90">
              Export hub
            </Link>
            <span className="text-muted-foreground" aria-hidden>
              ·
            </span>
            <Link
              to="/workspace-insights"
              className="text-primary-text font-medium underline underline-offset-2 hover:text-primary-text/90"
            >
              Workspace insights
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
