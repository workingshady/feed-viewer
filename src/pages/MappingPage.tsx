import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { markHomeWorkflowMappingVisited } from "@/lib/homeWorkflowProgress";
import { computeMappingConflicts, computeMissingRequiredFields } from "@/lib/importAnalysis";
import { NoSourceState, SourcePicker } from "@/components/SourcePicker";
import { useMappingPresets } from "@/hooks/usePrefs";
import { useReparseLiveVersion, useUpdateSource, useVersionXml } from "@/hooks/useSources";
import { FieldMapping, ParsedXmlNode, UI_FIELDS } from "@/lib/types";
import { buildXmlTree } from "@/lib/xmlParser";
import { useAppData } from "@/providers/DataProvider";
import { ChevronDown, ChevronRight, Link2, Link2Off, RefreshCw, Save, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "@/components/ui/sonner";

// Auto-map heuristics (by leaf tag name)
const AUTO_MAP: Record<string, string> = {
  'title_en': 'title',
  'title': 'title',
  'description_en': 'description',
  'description': 'description',
  'price': 'price',
  'price_on_application': 'priceOnApplication',
  'payment_method': 'paymentMethod',
  'down_payment_price': 'downPaymentPrice',
  'service_charge': 'serviceCharge',
  'cheques': 'cheques',
  'bedroom': 'beds',
  'bedrooms': 'beds',
  'bathroom': 'baths',
  'bathrooms': 'baths',
  'size': 'area',
  'built_up_area': 'area',
  'bua': 'area',
  'plot_size': 'plotSize',
  'community': 'community',
  'city': 'city',
  'sub_community': 'subCommunity',
  'property_name': 'propertyName',
  'developer': 'developer',
  'build_year': 'buildYear',
  'floor': 'floor',
  'stories': 'stories',
  'view360': 'view360',
  'view_360': 'view360',
  'virtual_tour_url': 'view360',
  'video_tour_url': 'videoTourUrl',
  'video_tour': 'videoTourUrl',
  'tour_video_url': 'videoTourUrl',
  'tour_url': 'videoTourUrl',
  'video_url': 'videoTourUrl',
  'floor_plan': 'floorPlanUrl',
  'floorplan': 'floorPlanUrl',
  'floor_plan_url': 'floorPlanUrl',
  'property_type': 'propertyType',
  'offering_type': 'purpose',
  'reference_number': 'reference',
  'permit_number': 'permitNumber',
  'latitude': 'latitude',
  'longitude': 'longitude',
  'furnished': 'furnished',
  'furnishing': 'furnished',
  'parking': 'parking',
  'completion_status': 'completionStatus',
};

/**
 * Paths the XML parser reads on its own (agent block, geopoints → lat/lng, amenity lists, rent
 * period inside <price>), so they aren't "unmapped" even without a FieldMapping row.
 */
const PARSER_OWNED_PATHS = new Set([
  'property.geopoints',
  'property.private_amenities',
  'property.commercial_amenities',
  'property.features.feature',
]);
function isParserOwnedXmlPath(xmlPath: string): boolean {
  return (
    xmlPath.startsWith('property.agent.') ||
    xmlPath.startsWith('property.price.') ||
    PARSER_OWNED_PATHS.has(xmlPath)
  );
}

function inferAutoMap(xmlPath: string, leafName: string): FieldMapping['uiField'] | '' {
  const fromName = AUTO_MAP[leafName];
  if (fromName) return fromName as FieldMapping['uiField'];

  const p = xmlPath.toLowerCase();
  if (leafName === 'url' && (p.includes('.photo.') || p.includes('.image.'))) return 'images';

  return '';
}

function buildMappingsForLeaves(
  leafPaths: { path: string; name: string }[],
  savedRows: FieldMapping[] | undefined,
  previous: FieldMapping[] | undefined
): FieldMapping[] {
  const savedByPath = new Map((savedRows ?? []).map((m) => [m.xmlPath, m]));
  const prevByPath = new Map((previous ?? []).map((m) => [m.xmlPath, m]));
  return leafPaths.map((lp) => {
    const prev = prevByPath.get(lp.path);
    const saved = savedByPath.get(lp.path);
    const inferred = inferAutoMap(lp.path, lp.name);
    const uiField = (prev?.uiField ?? saved?.uiField ?? inferred) || '';
    return { xmlPath: lp.path, uiField: uiField as FieldMapping['uiField'] };
  });
}

function collectLeafPaths(nodes: ParsedXmlNode[], prefix = ''): { path: string; name: string }[] {
  const result: { path: string; name: string }[] = [];
  for (const node of nodes) {
    const fullPath = prefix ? `${prefix}.${node.name}` : node.name;
    if (node.children.length === 0) {
      result.push({ path: fullPath, name: node.name });
    } else {
      result.push(...collectLeafPaths(node.children, fullPath));
    }
  }
  return result;
}

const TreeNode = ({ node, depth = 0 }: { node: ParsedXmlNode; depth?: number }) => {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        type="button"
        disabled={!hasChildren}
        aria-expanded={hasChildren ? open : undefined}
        onClick={() => hasChildren && setOpen(!open)}
        className={`flex items-center gap-1 py-1 px-2 w-full text-left text-sm hover:bg-accent rounded transition-colors ${
          hasChildren ? "cursor-pointer" : "cursor-default opacity-90"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          open ? <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        ) : (
          <span className="w-3" />
        )}
        <span className="font-mono text-xs text-primary-text">{node.name}</span>
        {node.count > 1 && (
          <span className="text-xs text-muted-foreground ml-1">×{node.count}</span>
        )}
        {!hasChildren ? (
          <span className="text-xs text-muted-foreground ml-2 truncate max-w-[200px]">
            = "{node.value ?? ""}"
          </span>
        ) : null}
      </button>
      {open && hasChildren && node.children.map((child, i) => (
        <TreeNode key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
};

const MappingPage = () => {
  const { sources, selectedSource, selectedLiveVersion, listings } = useAppData();
  const savedConfig = selectedSource?.mapping ?? null;
  const xmlContent = useVersionXml(selectedLiveVersion).data ?? null;
  const updateSource = useUpdateSource();
  const reparse = useReparseLiveVersion();
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    markHomeWorkflowMappingVisited();
  }, []);

  const tree = useMemo(() => xmlContent ? buildXmlTree(xmlContent) : [], [xmlContent]);
  const leafPaths = useMemo(() => {
    if (!tree.length) return [];
    // Get paths under property node
    const propNode = findPropertyNode(tree[0]);
    return propNode ? collectLeafPaths(propNode.children, 'property') : collectLeafPaths(tree);
  }, [tree]);

  const [mappings, setMappings] = useState<FieldMapping[]>([]);

  const [listingNodePath, setListingNodePath] = useState(() => savedConfig?.listingNodePath ?? "property");
  const { presets, save: savePreset, remove: removePreset } = useMappingPresets();
  const [presetName, setPresetName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");

  useEffect(() => {
    if (!savedConfig) return;
    setListingNodePath(savedConfig.listingNodePath || "property");
  }, [savedConfig]);

  useEffect(() => {
    if (!leafPaths.length) {
      setMappings([]);
      return;
    }
    setMappings((prev) => buildMappingsForLeaves(leafPaths, savedConfig?.mappings, prev));
  }, [leafPaths, savedConfig]);

  const [filter, setFilter] = useState("");

  const mappedUiFields = new Set(mappings.filter(m => m.uiField).map(m => m.uiField));
  /** Leaves with no UI target, excluding tags handled as part of <agent> parsing. */
  const unmappedXml = useMemo(
    () => mappings.filter((m) => !m.uiField && !isParserOwnedXmlPath(m.xmlPath)),
    [mappings],
  );
  const missingRequired = useMemo(
    () => computeMissingRequiredFields(mappings, { listings }),
    [mappings, listings],
  );
  const mappingConflicts = useMemo(() => computeMappingConflicts(mappings), [mappings]);
  const conflictUiFields = useMemo(() => new Set(mappingConflicts.map(c => String(c.uiField))), [mappingConflicts]);

  const requiredTotal = UI_FIELDS.filter(f => f.required).length;
  const requiredMapped = UI_FIELDS.filter(f => f.required && mappedUiFields.has(f.key)).length;
  const optionalTotal = UI_FIELDS.filter(f => !f.required).length;
  const optionalMapped = UI_FIELDS.filter(f => !f.required && mappedUiFields.has(f.key)).length;

  const filteredMappings = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return mappings;
    return mappings.filter((m) => {
      const label = m.uiField ? UI_FIELDS.find((f) => f.key === m.uiField)?.label ?? "" : "";
      return (
        m.xmlPath.toLowerCase().includes(q) ||
        String(m.uiField || "").toLowerCase().includes(q) ||
        label.toLowerCase().includes(q)
      );
    });
  }, [mappings, filter]);

  const handleMappingChange = (xmlPath: string, uiField: string) => {
    setJustSaved(false);
    setMappings(prev => prev.map(m => m.xmlPath === xmlPath ? { ...m, uiField: uiField as FieldMapping["uiField"] } : m));
  };

  const applyPresetById = (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    setListingNodePath(p.config.listingNodePath || "property");
    setMappings(p.config.mappings.map((m) => ({ ...m })));
    toast.success(`Loaded preset "${p.name}"`);
  };

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) {
      toast.error("Enter a preset name");
      return;
    }
    savePreset(name, { listingNodePath, mappings });
    setPresetName("");
    toast.success("Preset saved");
  };

  const handleDeleteSelectedPreset = () => {
    if (!selectedPresetId) return;
    removePreset(selectedPresetId);
    setSelectedPresetId("");
    toast.success("Preset removed");
  };

  const handleSave = () => {
    if (!selectedSource) return;
    updateSource.mutate(
      { source: selectedSource, mapping: { listingNodePath: listingNodePath.trim() || "property", mappings } },
      { onSuccess: () => setJustSaved(true) },
    );
  };

  useEffect(() => {
    setJustSaved(false);
  }, [selectedSource?.id]);

  if (!selectedSource || !xmlContent) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="container py-8">
          <SourcePicker className="mb-4" />
          {!selectedSource ? (
            <NoSourceState what="XML field mapping" />
          ) : !selectedLiveVersion ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              This source has no live version yet.{" "}
              <Link to={`/sources?source=${selectedSource.id}`} className="text-primary-text underline">
                Go to Sources
              </Link>
            </p>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading feed XML…</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container py-8">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold font-heading text-foreground">XML field mapping</h1>
              <p className="text-sm text-muted-foreground">Map XML paths and elements to listing fields (not the map view)</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {justSaved ? (
                <Button
                  variant="secondary"
                  disabled={reparse.isPending}
                  onClick={() => reparse.mutate({ source: selectedSource, sources })}
                >
                  <RefreshCw className="w-4 h-4 mr-2" /> Re-parse live version now
                </Button>
              ) : null}
              <Button onClick={handleSave} disabled={updateSource.isPending}>
                <Save className="w-4 h-4 mr-2" /> Save mapping
              </Button>
            </div>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end gap-3 flex-wrap">
            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground block">Load preset</span>
              <Select
                value={selectedPresetId || "_none"}
                onValueChange={(v) => {
                  if (v === "_none") {
                    setSelectedPresetId("");
                    return;
                  }
                  setSelectedPresetId(v);
                  applyPresetById(v);
                }}
              >
                <SelectTrigger className="w-[min(100%,280px)]">
                  <SelectValue placeholder="Choose saved preset…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {presets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2 items-end flex-1">
              <Input
                placeholder="New preset name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                className="max-w-[220px]"
              />
              <Button type="button" variant="secondary" onClick={handleSavePreset}>
                Save as preset
              </Button>
              {selectedPresetId ? (
                <Button type="button" variant="outline" size="icon" onClick={handleDeleteSelectedPreset} title="Delete selected preset">
                  <Trash2 className="w-4 h-4" />
                </Button>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground block">Listing XML node</span>
              <Input
                value={listingNodePath}
                onChange={(e) => {
                  setJustSaved(false);
                  setListingNodePath(e.target.value);
                }}
                className="w-40 font-mono text-sm"
                placeholder="property"
              />
            </div>
          </div>
        </div>

          {(unmappedXml.length + missingRequired.length + mappingConflicts.length > 0) && (
            <p className="text-sm text-muted-foreground mb-4">
              After your next upload, open the{" "}
              <Link to="/validation" className="text-primary-text font-medium underline underline-offset-2">
                validation dashboard
              </Link>{" "}
              to see parser conflicts, duplicate IDs, and listing-level diffs in one place. If you map{" "}
              <span className="font-medium text-foreground">latitude</span> and{" "}
              <span className="font-medium text-foreground">longitude</span>, you can explore pins + outliers in{" "}
              <Link to="/listings/map" className="text-primary-text font-medium underline underline-offset-2">
                Listing locations map
              </Link>
              .
            </p>
          )}
          <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">Required coverage</div>
            <div className="text-lg font-bold text-foreground">{requiredMapped} / {requiredTotal}</div>
            <div className="mt-2 h-2 rounded bg-accent overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${requiredTotal ? Math.round((requiredMapped / requiredTotal) * 100) : 0}%` }}
              />
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">Optional coverage</div>
            <div className="text-lg font-bold text-foreground">{optionalMapped} / {optionalTotal}</div>
            <div className="mt-2 h-2 rounded bg-accent overflow-hidden">
              <div
                className="h-full bg-secondary"
                style={{ width: `${optionalTotal ? Math.round((optionalMapped / optionalTotal) * 100) : 0}%` }}
              />
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">Issues</div>
            <div className="text-lg font-bold text-foreground">
              {unmappedXml.length + missingRequired.length + mappingConflicts.length}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {unmappedXml.length} unmapped • {missingRequired.length} missing required • {mappingConflicts.length} conflicts
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* XML Tree */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-accent/50">
              <h2 className="text-sm font-semibold text-foreground">XML Structure</h2>
            </div>
            <div className="p-2 max-h-[600px] overflow-y-auto">
              {tree.map((node, i) => (
                <TreeNode key={i} node={node} />
              ))}
            </div>
          </div>

          {/* Field Mappings */}
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-accent/50">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-foreground">Field Mappings</h2>
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Search paths / fields…"
                      className="pl-9 h-9"
                    />
                  </div>
                </div>
              </div>
              <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
                {filteredMappings.map((m, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 rounded-lg p-1 ${
                      m.uiField && conflictUiFields.has(String(m.uiField)) ? "bg-destructive/5" : ""
                    }`}
                  >
                    <span className="font-mono text-xs text-foreground bg-accent px-2 py-1 rounded flex-1 truncate">
                      {m.xmlPath}
                    </span>
                    {m.uiField ? (
                      <Link2 className="w-4 h-4 text-success flex-shrink-0" />
                    ) : (
                      <Link2Off className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <Select value={m.uiField || '_none'} onValueChange={v => handleMappingChange(m.xmlPath, v === '_none' ? '' : v)}>
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">— Not mapped —</SelectItem>
                        {UI_FIELDS.map(f => (
                          <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* Status panels */}
            {mappingConflicts.length > 0 && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <Link2Off className="w-4 h-4 text-destructive-text" />
                  Field mapping conflicts ({mappingConflicts.length})
                </h3>
                <div className="space-y-2">
                  {mappingConflicts.map((c) => (
                    <div key={String(c.uiField)} className="text-xs">
                      <div className="font-semibold text-foreground">{UI_FIELDS.find(f => f.key === c.uiField)?.label ?? String(c.uiField)}</div>
                      <div className="font-mono text-muted-foreground break-all">{c.xmlPaths.join("  |  ")}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {unmappedXml.length > 0 && (
              <div className="bg-muted/40 border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                  <Link2Off className="w-4 h-4 text-muted-foreground" />
                  Extra XML tags not mapped ({unmappedXml.length})
                </h3>
                <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
                  Common for locale fields, geo extras, or agency-specific nodes. Map only what you need for listings.
                </p>
                <div className="flex flex-wrap gap-1">
                  {unmappedXml.map((m, i) => (
                    <span key={i} className="font-mono text-xs bg-accent px-2 py-1 rounded text-muted-foreground">
                      {m.xmlPath.split('.').pop()}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {missingRequired.length > 0 && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  Missing Required Fields ({missingRequired.length})
                </h3>
                <div className="flex flex-wrap gap-1">
                  {missingRequired.map((key, i) => (
                    <span key={i} className="text-xs bg-destructive/10 text-destructive-text px-2 py-1 rounded font-medium">
                      {UI_FIELDS.find((f) => f.key === key)?.label ?? String(key)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function findPropertyNode(node: ParsedXmlNode): ParsedXmlNode | null {
  if (node.name === 'property') return node;
  for (const child of node.children) {
    const found = findPropertyNode(child);
    if (found) return found;
  }
  return null;
}

export default MappingPage;
