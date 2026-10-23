import AppHeader from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NoSourceState, SourcePicker } from "@/components/SourcePicker";
import { useVersionXml } from "@/hooks/useSources";
import { fingerprintMappingConfig } from "@/lib/mappingFingerprint";
import {
  computeListingDatasetStats,
  computeMappingAuditSummary,
  pct,
} from "@/lib/mappingQaMetrics";
import { flagToneClass, getListingFlags } from "@/lib/listingDatabaseMeta";
import { cn } from "@/lib/utils";
import { useAppData } from "@/providers/DataProvider";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Copy,
  Layers,
  ListChecks,
  MapPin,
  ScanSearch,
  Table2,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { toast } from "@/components/ui/sonner";

export default function MappingQaPage() {
  const { listings, selectedSource, selectedLiveVersion } = useAppData();
  const mappingConfig = selectedSource?.mapping ?? null;
  const xmlContent = useVersionXml(selectedLiveVersion).data ?? null;

  const audit = useMemo(() => computeMappingAuditSummary(mappingConfig, listings), [mappingConfig, listings]);
  const stats = useMemo(() => computeListingDatasetStats(listings), [listings]);

  const checklist = useMemo(() => {
    const noConflicts = audit.conflicts.length === 0;
    const noDupTargets = audit.conflicts.length === 0;
    const reqOk = audit.missingRequiredFields.length === 0;
    const unassignedWarn = audit.unassignedPaths > 0;
    const hasListings = stats.total > 0;
    const hasXmlBuffer = Boolean(xmlContent && xmlContent.length > 0);
    const mappingConfigured = Boolean(mappingConfig?.mappings?.length || mappingConfig?.listingNodePath);
    return [
      {
        id: "mapping-config",
        ok: mappingConfigured,
        label: "Mapping config present",
        hint: mappingConfigured ? "Listing node path and mapping rows exist." : "Configure XML field mapping before QA.",
      },
      {
        id: "dup-targets",
        ok: noDupTargets,
        label: "No duplicate UI targets",
        hint: noConflicts ? "Each mapped UI field maps from at most one XML path." : `${audit.conflicts.length} duplicate target group(s) — resolve on Field mapping.`,
      },
      {
        id: "required-fields",
        ok: reqOk,
        label: "Required fields covered",
        hint: reqOk
          ? "Every required listing field has a mapping or verified data."
          : `Still need: ${audit.missingRequiredFields.join(", ")}`,
      },
      {
        id: "unassigned",
        ok: !unassignedWarn,
        label: "Leaf paths assigned (or intentionally skipped)",
        hint:
          audit.unassignedPaths === 0
            ? "All discovered XML leaf rows point to a UI field."
            : `${audit.unassignedPaths} XML path(s) have no UI field — review or hide unused leaves.`,
      },
      {
        id: "dataset",
        ok: hasListings,
        label: "Workspace listings loaded",
        hint: hasListings ? `${stats.total} listings in current scope.` : "Upload a feed on Sources to run output checks.",
      },
      {
        id: "xml-buffer",
        ok: hasXmlBuffer,
        label: "Live version XML available",
        hint: hasXmlBuffer
          ? `${Math.round(xmlContent!.length / 1024)} KB — compare & validation can use it.`
          : "The live version's XML is not loaded yet.",
      },
    ];
  }, [audit, mappingConfig, stats, xmlContent]);

  const fp = useMemo(() => fingerprintMappingConfig(mappingConfig), [mappingConfig]);

  const copyFp = () => {
    void navigator.clipboard.writeText(fp);
    toast.success("Mapping fingerprint copied");
  };

  if (!selectedSource) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="container py-8">
          <SourcePicker className="mb-4" />
          <NoSourceState what="Mapping & XML QA" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      <main className="flex-1 container max-w-[min(100%,96rem)] py-6 px-4 sm:px-6 space-y-6 pb-14">
        <header className="space-y-2 max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 ring-1 ring-primary/20">
              <ClipboardCheck className="w-6 h-6 text-primary-text" aria-hidden />
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight">Mapping & XML QA</h1>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Sanity-check your XPath mapping against live parsed listings — duplicate targets, required fields, and spot issues
            before feeds go to buyers. Pair with{" "}
            <Link className="text-primary-text font-medium underline underline-offset-2 hover:text-primary-text/90" to="/validation">
              Import validation
            </Link>{" "}
            and{" "}
            <Link className="text-primary-text font-medium underline underline-offset-2 hover:text-primary-text/90" to="/field-quality">
              Field coverage (EDA)
            </Link>
            .
          </p>
          {selectedLiveVersion ? (
            <p className="text-[11px] text-muted-foreground font-mono truncate">
              Live version:{" "}
              <span className="text-foreground">
                {selectedSource.name} v{selectedLiveVersion.number} · {selectedLiveVersion.fileName}
              </span>
            </p>
          ) : null}
        </header>

        <Tabs defaultValue="overview" className="w-full space-y-6">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/40 p-1 sm:inline-flex sm:w-auto">
            <TabsTrigger value="overview" className="gap-2 rounded-lg">
              <ListChecks className="w-4 h-4 shrink-0 opacity-70" aria-hidden />
              Overview
            </TabsTrigger>
            <TabsTrigger value="paths" className="gap-2 rounded-lg">
              <Layers className="w-4 h-4 shrink-0 opacity-70" aria-hidden />
              Mapping paths
            </TabsTrigger>
            <TabsTrigger value="spot" className="gap-2 rounded-lg">
              <Table2 className="w-4 h-4 shrink-0 opacity-70" aria-hidden />
              Spot checks
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-0 outline-none">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Listings in scope</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-heading font-bold tabular-nums">{stats.total}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Images {pct(stats.withImages, stats.total)}% · Geo {pct(stats.withGeo, stats.total)}%
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Mapping rows</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-heading font-bold tabular-nums">{audit.mappingRows}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Assigned {audit.assignedPaths} · Unassigned {audit.unassignedPaths}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Duplicate targets</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-heading font-bold tabular-nums text-foreground">{audit.conflicts.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Same UI field from multiple XML paths</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Core fields present</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground space-y-1">
                    Ref {pct(stats.withReference, stats.total)}% · Title {pct(stats.withTitle, stats.total)}% · Price/POA{" "}
                    {pct(stats.withPriceOrPoa, stats.total)}%
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">QA checklist</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Listing node: <code className="text-[11px] bg-muted px-1 rounded">{audit.listingNodePath}</code>
                    </CardDescription>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="shrink-0 gap-2 h-9" onClick={copyFp}>
                    <Copy className="w-3.5 h-3.5" aria-hidden />
                    Copy mapping fingerprint
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {checklist.map((row) => (
                  <div
                    key={row.id}
                    className={cn(
                      "flex gap-3 rounded-lg border px-3 py-2.5 text-sm",
                      row.ok ? "border-border bg-muted/20" : "border-amber-500/35 bg-amber-500/[0.06]",
                    )}
                  >
                    {row.ok ? (
                      <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" aria-hidden />
                    ) : (
                      <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden />
                    )}
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-foreground">{row.label}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{row.hint}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/field-mapping">Edit field mapping</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/validation">Open validation</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/field-quality">
                  <ScanSearch className="w-3.5 h-3.5 mr-1.5 inline" aria-hidden />
                  Field coverage EDA
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/database">
                  <ClipboardList className="w-3.5 h-3.5 mr-1.5 inline" aria-hidden />
                  Listing table
                </Link>
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="paths" className="mt-0 outline-none space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">XML path → UI field</CardTitle>
                <CardDescription className="text-xs">
                  Unassigned rows still appear in your mapping table — they do not populate listing fields.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0 sm:p-6 pt-0">
                {!mappingConfig?.mappings?.length ? (
                  <p className="text-sm text-muted-foreground px-6 py-8">No mapping rows saved yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[12rem]">XML path</TableHead>
                        <TableHead className="min-w-[8rem]">UI field</TableHead>
                        <TableHead className="w-[7rem]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...mappingConfig.mappings]
                        .sort((a, b) => a.xmlPath.localeCompare(b.xmlPath))
                        .map((m) => {
                          const assigned = Boolean(m.uiField && String(m.uiField).trim());
                          return (
                            <TableRow key={m.xmlPath}>
                              <TableCell className="font-mono text-[11px] align-top">{m.xmlPath}</TableCell>
                              <TableCell className="text-sm align-top">
                                {assigned ? (
                                  String(m.uiField)
                                ) : (
                                  <span className="text-muted-foreground italic">— unassigned —</span>
                                )}
                              </TableCell>
                              <TableCell className="align-top">
                                {assigned ? (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Mapped
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-800 dark:text-amber-200">
                                    Unassigned
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {audit.conflicts.length > 0 ? (
              <Card className="border-amber-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden />
                    Duplicate UI targets
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Only one XML path should feed each listing field unless you intentionally overlay — importer uses last write
                    semantics.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {audit.conflicts.map((c) => (
                    <div key={String(c.uiField)} className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
                      <p className="font-medium text-foreground">{String(c.uiField)}</p>
                      <ul className="mt-1 font-mono text-[11px] text-muted-foreground space-y-0.5 list-disc pl-4">
                        {c.xmlPaths.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          <TabsContent value="spot" className="mt-0 outline-none">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Listing spot checks</CardTitle>
                <CardDescription className="text-xs">
                  First {Math.min(40, listings.length)} rows in current scope — flags mirror the listing table (images, geo,
                  price, title, agent).
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0 sm:p-6 pt-0">
                {listings.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-6 py-8">No listings in the live version.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead className="whitespace-nowrap">Price</TableHead>
                        <TableHead>Geo</TableHead>
                        <TableHead>Flags</TableHead>
                        <TableHead className="w-[4rem]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {listings.slice(0, 40).map((l) => {
                        const flags = getListingFlags(l, { isFavorite: false, inCompare: false });
                        const issueOnly = flags.filter((f) => f.tone === "bad" || f.tone === "warn");
                        const geoOk =
                          l.latitude != null &&
                          l.longitude != null &&
                          Number.isFinite(l.latitude) &&
                          Number.isFinite(l.longitude);
                        return (
                          <TableRow key={l.id}>
                            <TableCell className="font-mono text-xs">{l.reference || "—"}</TableCell>
                            <TableCell className="max-w-[14rem] truncate text-sm">{l.title || "—"}</TableCell>
                            <TableCell className="text-xs tabular-nums whitespace-nowrap">
                              {typeof l.price === "number" && l.price > 0 ? l.price : "—"}
                            </TableCell>
                            <TableCell>
                              {geoOk ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 text-xs">
                                  <MapPin className="w-3.5 h-3.5" aria-hidden />
                                  OK
                                </span>
                              ) : (
                                <span className="text-amber-700 text-xs dark:text-amber-400">Missing</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {issueOnly.length === 0 ? (
                                  <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-800 dark:text-emerald-300">
                                    Clean
                                  </Badge>
                                ) : (
                                  issueOnly.map((f) => (
                                    <Badge
                                      key={f.id}
                                      variant="secondary"
                                      className={cn("text-[10px] font-normal", flagToneClass(f.tone))}
                                    >
                                      {f.label}
                                    </Badge>
                                  ))
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Link
                                to={`/listing/${encodeURIComponent(l.id)}`}
                                className="text-xs text-primary-text font-medium hover:underline"
                              >
                                Open
                              </Link>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
