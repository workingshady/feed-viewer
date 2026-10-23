import { AgentPhoto } from "@/components/AgentPhoto";
import AppHeader from "@/components/AppHeader";
import { HomeHeroDeck } from "@/components/HomeHeroDeck";
import { HomeSectionNav, type HomeSectionNavActiveInfo, type HomeSectionNavLink } from "@/components/HomeSectionNav";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { trackHomeEvent } from "@/lib/homeAnalytics";
import { FALLBACK_IMAGES, formatListingPriceShort, pickFeaturedListing } from "@/lib/homeFeatured";
import { normalizeSectionQueryParam, slugToSectionId } from "@/lib/homeSectionUrl";
import { HOME_AGENCIES_TEASER } from "@/lib/agencyDirectoryCopy";
import { liveVersionOf } from "@/lib/sourcesApi";
import { hasRole } from "@/lib/roles";
import { useAuth } from "@/providers/AuthProvider";
import { Landing } from "@/components/landing/Landing";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppData } from "@/providers/DataProvider";
import type { LucideIcon } from "lucide-react";
import {
    AlertTriangle,
    ArrowRight,
    ArrowUpRight,
    Building2,
    Calendar,
    CheckCircle2,
    ChevronDown,
    ClipboardList,
    Cpu,
    Database,
    Download,
    FileCode2,
    GitCompare,
    Keyboard,
    Layers,
    LayoutGrid,
    ListTree,
    Mail,
    Map as MapIcon,
    PieChart,
    Phone,
    Play,
    ShieldCheck,
    Upload,
    User,
    Users,
} from "lucide-react";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

/** Cap rows in the home preview table (scrollable body). */
const HOME_LISTINGS_TABLE_MAX = 80;

const workflowSlides = [
  {
    title: "Drop your XML",
    caption: "Strict parsing with clear errors and a browsable tree.",
    img: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200&q=80",
  },
  {
    title: "Map & validate",
    caption: "Presets and custom paths — see every field before you publish.",
    img: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80",
  },
  {
    title: "Browse like a portal",
    caption: "Listings, maps, compare, and export — all in one workspace.",
    img: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1200&q=80",
  },
];

const BUILT_FOR_ROWS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Cpu,
    title: "Integrators & engineers",
    body: "Strict XML parsing, diff history, and a clear path from raw feed to normalized listing records.",
  },
  {
    icon: Building2,
    title: "Agencies & brokerages",
    body: "Browse inventory like a portal, switch feeds per brand, and validate data before it reaches your site.",
  },
  {
    icon: ShieldCheck,
    title: "QA & data analysts",
    body: "Validation dashboards, feed compare, and duplicate signals so issues surface before production.",
  },
];

export default function Index() {
  const { listings, scope, listingsByAgency, sources, isLoading, selectedSource, selectedLiveVersion } = useAppData();
  const { user, isLoading: authLoading } = useAuth();
  const agency = selectedSource?.agencyInfo ?? null;
  const versionCount = useMemo(() => sources.reduce((n, src) => n + src.versions.length, 0), [sources]);
  /** Timestamp of the newest live version in scope. */
  const importTime = useMemo(() => {
    const lives = (selectedSource ? [selectedSource] : sources)
      .map((src) => liveVersionOf(src)?.createdAt)
      .filter((x): x is string => Boolean(x));
    return lives.sort().at(-1) ?? selectedLiveVersion?.createdAt ?? null;
  }, [sources, selectedSource, selectedLiveVersion]);
  const hasData = listings.length > 0;
  const [workflowIdx, setWorkflowIdx] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const wfFlags = useMemo(
    () => ({
      mapping: sources.some((src) => Boolean(src.mapping)),
      validation: sources.some((src) => Boolean(liveVersionOf(src)?.stats)),
    }),
    [sources],
  );
  const sectionUrlTimerRef = useRef<number | null>(null);
  /** When true, `?section=` was updated by scroll-spy — do not call scrollIntoView again. */
  const sectionUrlFromScrollSpyRef = useRef(false);
  const sectionUrlSyncEnabledRef = useRef(
    typeof window !== "undefined" &&
      Boolean(normalizeSectionQueryParam(new URLSearchParams(window.location.search).get("section"))),
  );
  const [powerToolsOpen, setPowerToolsOpen] = useState(false);

  useEffect(() => {
    if (normalizeSectionQueryParam(searchParams.get("section"))) {
      sectionUrlSyncEnabledRef.current = true;
    }
  }, [searchParams]);

  useEffect(() => {
    trackHomeEvent("home_view", { has_listings: hasData });
  }, [hasData]);

  useEffect(() => {
    const raw = searchParams.get("section");
    const slug = normalizeSectionQueryParam(raw);
    if (!slug) return;
    if (sectionUrlFromScrollSpyRef.current) {
      sectionUrlFromScrollSpyRef.current = false;
      return;
    }
    const id = slugToSectionId(slug);
    const prefersReduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: prefersReduced ? "auto" : "smooth",
        block: "start",
      });
    }, 50);
    return () => window.clearTimeout(t);
  }, [searchParams, hasData]);

  const onSectionNavActive = useCallback(
    (info: HomeSectionNavActiveInfo) => {
      if (!info.slug || !sectionUrlSyncEnabledRef.current) return;
      if (sectionUrlTimerRef.current) window.clearTimeout(sectionUrlTimerRef.current);
      sectionUrlTimerRef.current = window.setTimeout(() => {
        startTransition(() => {
          setSearchParams(
            (prev) => {
              if (prev.get("section") === info.slug) return prev;
              sectionUrlFromScrollSpyRef.current = true;
              const next = new URLSearchParams(prev);
              next.set("section", info.slug!);
              return next;
            },
            { replace: true },
          );
        });
      }, 650);
    },
    [setSearchParams],
  );

  const homeJumpLinks = useMemo((): HomeSectionNavLink[] => {
    const base: HomeSectionNavLink[] = [
      { href: "#section-capabilities", label: "Capabilities", hint: "Product tools — import, XML field mapping, validate, browse" },
      { href: "#section-audiences", label: "Audience", hint: "Who it's for — integrators, agencies, QA" },
      { href: "#section-workflow", label: "Workflow", hint: "From XML to portal-ready listings" },
      { href: "#section-quality", label: "Quality", hint: "Precision and validation" },
      { href: "#section-preview", label: "Preview", hint: "Listing table and browse strip" },
      ...(hasData
        ? [{ href: "#section-workspace", label: "Workspace", hint: "Live counts and shortcuts" } satisfies HomeSectionNavLink]
        : []),
      { href: "#section-network", label: "Network", hint: "Agents and agencies from your feeds" },
      { href: "#section-cta", label: "Start", hint: "Get started — import or browse" },
    ];
    return base;
  }, [hasData]);

  const featured = useMemo(() => pickFeaturedListing(listings), [listings]);
  const wideImageUrl =
    listings.find((l, i) => i > 0 && l?.images?.[0])?.images?.[0] ??
    featured?.images?.[0] ??
    FALLBACK_IMAGES.wide;
  const ctaImageUrl = featured?.images?.[1] ?? featured?.images?.[0] ?? FALLBACK_IMAGES.cta;

  const qualityCircles = useMemo(() => {
    const urls: string[] = [];
    for (const l of listings) {
      for (const u of l.images ?? []) {
        if (urls.length >= 3) break;
        urls.push(u);
      }
      if (urls.length >= 3) break;
    }
    while (urls.length < 3) urls.push(FALLBACK_IMAGES.quality[urls.length]!);
    return urls.slice(0, 3);
  }, [listings]);

  const workflowSlidesLive = useMemo(() => {
    const imgs = listings
      .filter((l) => l?.images?.[0])
      .slice(0, 3)
      .map((l) => l.images![0]!);
    return workflowSlides.map((slide, i) => ({
      ...slide,
      img: imgs[i] ?? slide.img,
    }));
  }, [listings]);

  const tableRows = useMemo(() => {
    if (listings.length > 0) {
      return listings.slice(0, HOME_LISTINGS_TABLE_MAX).map((l) => ({
        id: l.id,
        ref: l.reference || l.id.slice(0, 12),
        type: l.propertyType || "—",
        beds: l.beds > 0 ? String(l.beds) : "—",
        price: formatListingPriceShort(l),
        location: l.community || l.city || l.address || "—",
      }));
    }
    return [];
  }, [listings]);

  const missingImages = listings.filter((l) => !(l.images?.length ?? 0)).length;
  const missingPrice = listings.filter((l) => !l.price).length;
  const agentsCount = new Set(listings.map((l) => (l.agent?.name || "").trim()).filter(Boolean)).size;
  const agenciesCount = listingsByAgency.size;

  const agentToAgency = useMemo(() => {
    const m = new Map<string, string>();
    for (const [agencyName, arr] of listingsByAgency) {
      for (const l of arr) {
        const n = (l.agent?.name || "").trim();
        if (n && !m.has(n)) m.set(n, agencyName);
      }
    }
    return m;
  }, [listingsByAgency]);

  const homeAgents = useMemo(() => {
    const byName = new Map<string, { name: string; count: number; photo: string; email: string; phone: string }>();
    for (const l of listings) {
      const name = (l.agent?.name || "").trim();
      if (!name) continue;
      const cur = byName.get(name);
      if (!cur) {
        byName.set(name, {
          name,
          count: 1,
          photo: l.agent?.photo || "",
          email: l.agent?.email || "",
          phone: l.agent?.phone || "",
        });
      } else {
        cur.count += 1;
        if (!cur.photo && l.agent?.photo) cur.photo = l.agent.photo;
        if (!cur.email && l.agent?.email) cur.email = l.agent.email;
        if (!cur.phone && l.agent?.phone) cur.phone = l.agent.phone;
      }
    }
    return Array.from(byName.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [listings]);

  const homeAgencies = useMemo(() => {
    type Row = {
      name: string;
      listingsCount: number;
      logo?: string;
      email?: string;
      phone?: string;
      website?: string;
      lastImportedAt: string | null;
    };
    const map = new Map<string, Row>();
    for (const [name, arr] of listingsByAgency) {
      if (!name.trim()) continue;
      const src = sources.find((x) => x.name === name);
      const info = src?.agencyInfo;
      map.set(name, {
        name,
        listingsCount: arr.length,
        logo: info?.logo,
        email: info?.email,
        phone: info?.phone,
        website: info?.website,
        lastImportedAt: src ? (liveVersionOf(src)?.createdAt ?? null) : null,
      });
    }

    return Array.from(map.values())
      .sort((a, b) => b.listingsCount - a.listingsCount)
      .slice(0, 6);
  }, [listingsByAgency, sources]);

  // Signed-out visitors get the public landing page; the dashboard below needs an account.
  if (!authLoading && !user) return <Landing />;

  if (isLoading && !hasData) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <AppHeader />
        <main className="pt-[calc(5rem+env(safe-area-inset-top,0px))] px-6 py-24 text-center text-white/60">
          <p role="status">Loading feeds...</p>
        </main>
      </div>
    );
  }

  if (sources.length === 0 || !hasData) {
    const isEditor = hasRole(user?.role, "editor");
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <AppHeader />
        <main className="pt-[calc(5rem+env(safe-area-inset-top,0px))] px-6 py-24 text-center">
          <div className="mx-auto max-w-md space-y-4">
            <h1 className="font-heading font-semibold text-3xl text-white">No feeds yet</h1>
            <p className="text-white/65">
              {sources.length === 0 ? "Upload an agency XML feed to start." : "No live listings in the current scope yet."}
            </p>
            {isEditor ? (
              <Button asChild className="bg-brand-amber hover:bg-brand-amber/90 text-[#0f0f0f] font-semibold rounded-full h-11 px-8 border-0">
                <Link to="/sources">Go to Sources</Link>
              </Button>
            ) : (
              <p className="text-white/50 text-sm">Ask an editor to upload a feed.</p>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AppHeader />
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[300] -translate-y-24 rounded-lg bg-brand-amber px-4 py-2 text-sm font-semibold text-[#0f0f0f] shadow-lg opacity-0 transition-all duration-200 focus:pointer-events-auto focus:translate-y-16 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-white pointer-events-none"
        onClick={(e) => {
          e.preventDefault();
          const el = document.getElementById("main-content");
          if (!el) return;
          el.focus({ preventScroll: true });
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      >
        Skip to main content
      </a>

      <main
        id="main-content"
        tabIndex={-1}
        className="outline-none pt-[calc(5rem+env(safe-area-inset-top,0px))]"
      >
      {/* ── HERO: full-bleed intro; section nav follows below ── */}
      <section
        aria-label="Introduction"
        className="relative overflow-hidden bg-primary min-h-[min(100vh,920px)] flex flex-col text-primary-foreground pt-6 sm:pt-8"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              0deg, transparent, transparent 47px, rgba(255,255,255,0.55) 47px, rgba(255,255,255,0.55) 48px
            ), repeating-linear-gradient(
              90deg, transparent, transparent 47px, rgba(255,255,255,0.55) 47px, rgba(255,255,255,0.55) 48px
            )`,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -right-40 w-[560px] h-[560px] rounded-full opacity-[0.18]"
          style={{ background: "radial-gradient(circle, #E09B6B 0%, transparent 70%)" }}
        />

        <div className="max-w-[1320px] mx-auto px-6 flex-1 flex flex-col lg:flex-row items-center gap-12 lg:gap-16 pb-16 lg:pb-24 pt-8 lg:pt-12">
          <div className="flex-1 flex flex-col justify-center w-full">
            <div className="inline-flex items-center gap-2 self-start mb-8 px-4 py-1.5 rounded-full border border-white/20 bg-white/10 text-[11px] font-semibold tracking-[0.2em] text-primary-foreground/85 uppercase font-body">
              <FileCode2 className="w-3.5 h-3.5" />
              XML property feed viewer
            </div>

            <h1 className="font-heading font-semibold text-[clamp(2rem,5.5vw,4.25rem)] leading-[1.02] tracking-tight text-primary-foreground mb-6 max-w-[640px] uppercase">
              Experience the{" "}
              <span className="text-brand-amber">epitome</span>
              <br />
              of feed clarity
            </h1>

            <p className="text-primary-foreground/78 text-base leading-relaxed mb-10 max-w-[480px] font-body">
              Import any real estate XML feed and see listings as a modern property portal. Map fields, inspect data quality, and compare exports — built for agencies and integrators.
            </p>

            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="bg-brand-amber hover:bg-brand-amber/90 text-[#0f0f0f] font-semibold rounded-full h-12 px-8 text-sm shadow-xl border-0"
              >
                <Link
                  to="/sources"
                  onClick={() => trackHomeEvent("home_hero_import_click")}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Go to Sources
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="border border-white/35 text-primary-foreground hover:bg-white/10 hover:border-white/50 rounded-full h-12 px-8 text-sm bg-transparent"
              >
                <Link
                  to="/listings"
                  onClick={() => trackHomeEvent("home_hero_browse_click")}
                >
                  <LayoutGrid className="w-4 h-4 mr-2" />
                  Browse listings
                </Link>
              </Button>
            </div>

            <div className="mt-12 flex flex-wrap gap-10 border-t border-white/15 pt-10">
              {[
                { label: "Sources", value: `${sources.length}` },
                { label: "Agencies indexed", value: hasData ? `${agenciesCount}` : "—" },
                { label: "Listings parsed", value: hasData ? `${listings.length.toLocaleString()}` : "—" },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-2xl font-heading font-semibold text-primary-foreground tracking-tight">{s.value}</div>
                  <div className="text-[11px] text-primary-foreground/60 mt-1 uppercase tracking-widest font-body">{s.label}</div>
                </div>
              ))}
            </div>
            {importTime && (
              <p className="mt-4 text-[11px] text-primary-foreground/50 font-body uppercase tracking-wider">
                Last feed update{" "}
                <time dateTime={importTime}>{new Date(importTime).toLocaleString()}</time>
              </p>
            )}
          </div>

          <div className="relative lg:flex-[0_0_400px] w-full max-w-[420px] lg:max-w-none self-end lg:self-center">
            <div className="hidden lg:flex absolute -left-8 -top-2 z-10 w-[104px] h-[104px] items-center justify-center pointer-events-none animate-hero-star-float motion-reduce:animate-none">
              <svg
                viewBox="0 0 104 104"
                className="w-[104px] h-[104px] animate-[spin_22s_linear_infinite] motion-reduce:animate-none"
              >
                <defs>
                  <path id="fv-circle" d="M 52,52 m -38,0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0" />
                </defs>
                <text className="fill-white/45 text-[8px] tracking-[0.32em] font-semibold uppercase font-body">
                  <textPath href="#fv-circle">FEEDVIEW • XML • INSPECT • MAP • </textPath>
                </text>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-11 h-11 rounded-full border border-white/35 bg-white/5 backdrop-blur-sm flex items-center justify-center">
                  <span className="text-primary-foreground text-lg leading-none">✦</span>
                </div>
              </div>
            </div>

            <HomeHeroDeck
              listings={listings}
              deckVersion={`${listings.length}-${importTime ?? ""}`}
            />
          </div>
        </div>

        {/* Sharp edge into black */}
        <div className="h-0 w-full border-t-2 border-[#0a0a0a] shadow-[0_1px_0_0_rgba(255,255,255,0.06)]" />
      </section>

      <HomeSectionNav links={homeJumpLinks} onActiveChange={onSectionNavActive} />

      {/* ── ABOUT (dark + soft green wash from hero) ── */}
      <section
        aria-labelledby="section-about-heading"
        className="bg-gradient-to-b from-primary/[0.14] via-[#0b100e] to-[#0a0a0a] text-white border-b border-white/[0.06]"
      >
        <div className="max-w-[1320px] mx-auto px-6 py-20 lg:py-28">
          <p className="text-[11px] uppercase tracking-[0.35em] text-brand-slate mb-4 font-body">About Feed Viewer Pro</p>
          <h2
            id="section-about-heading"
            className="font-heading font-semibold text-3xl sm:text-4xl lg:text-5xl leading-[1.1] tracking-tight max-w-4xl mb-14"
          >
            <span className="text-white/38">Luxury</span> tooling for{" "}
            <span className="text-white">XML feeds</span>
            <br className="hidden sm:block" />
            <span className="text-white/38">A decade</span> of clarity —{" "}
            <span className="text-white">in minutes</span>.
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-16">
            {[
              { k: `${sources.length}`, l: "Sources", sub: "Agency feeds" },
              { k: hasData ? `${listings.length}` : "0", l: "Listings", sub: hasData ? "In your workspace" : "Import to populate" },
              { k: hasData ? `${agenciesCount}` : "—", l: "Agencies", sub: "Indexed from feeds" },
              { k: hasData ? `${versionCount}` : "—", l: "Feed versions", sub: "Uploaded history" },
            ].map((row) => (
              <div key={row.l}>
                <div className="text-4xl sm:text-5xl font-heading font-semibold text-brand-mist tracking-tight">{row.k}</div>
                <div className="text-sm font-semibold text-white mt-2">{row.l}</div>
                <div className="text-xs text-white/45 mt-1 font-body">{row.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CAPABILITIES ── */}
      <section
        id="section-capabilities"
        aria-labelledby="section-capabilities-heading"
        className="scroll-mt-36 bg-gradient-to-b from-[#0a0a0a] via-[#0b1210] to-[#0a0a0a] py-16 lg:py-24 border-b border-white/[0.06]"
      >
        <div className="max-w-[1320px] mx-auto px-6">
          <div className="mb-12">
            <p className="text-[11px] text-brand-slate uppercase tracking-[0.3em] font-semibold mb-2 font-body">Product</p>
            <h2 id="section-capabilities-heading" className="font-heading font-semibold text-white text-2xl md:text-3xl tracking-tight max-w-2xl">
              Capabilities for <span className="text-white/40">every</span> stage of the feed lifecycle — from{" "}
              <span className="text-brand-amber">import</span> to publish.
            </h2>
            <p className="mt-4 text-sm text-white/50 font-body max-w-2xl leading-relaxed">
              One workspace for parsing, XML field mapping, validation, and browsing. Use it to onboard new XML formats, audit partner feeds, or
              sanity-check exports before they hit your production stack.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: Upload,
                title: "Import & parse",
                desc: "Drag & drop or paste XML. Strict mode with detailed parse results and diff history.",
                link: "/sources",
                accent: false,
              },
              {
                icon: LayoutGrid,
                title: "Browse & search",
                desc: "Filter by price, beds, type, community. Map view and export included.",
                link: "/listings",
                accent: false,
              },
              {
                icon: MapIcon,
                title: "XML field mapping",
                desc: "Map XML paths to listing fields (not the geographic map). Presets, custom paths, full coverage.",
                link: "/field-mapping",
                accent: true,
              },
              {
                icon: ClipboardList,
                title: "Import validation",
                desc: "Conflicts, parser messages, duplicate IDs, and feed health.",
                link: "/validation",
                accent: false,
              },
              {
                icon: GitCompare,
                title: "Compare listings",
                desc: "Add up to four properties, open side-by-side compare.",
                link: "/compare",
                accent: false,
              },
              {
                icon: Building2,
                title: "Agency explorer",
                desc: "Browse by agency, switch active feed, inspect agents.",
                link: "/agencies",
                accent: false,
              },
              {
                icon: Database,
                title: "Listing table",
                desc: "Spreadsheet-style view of stored listings for exports and bulk review.",
                link: "/database",
                accent: false,
              },
            ].map((f) => (
              <Link
                key={f.link}
                to={f.link}
                className={cn(
                  "group relative rounded-2xl p-6 border transition-all duration-300 flex flex-col gap-4 overflow-hidden",
                  f.accent
                    ? "bg-primary border-primary/50 hover:shadow-[0_20px_50px_-20px_rgba(29,71,52,0.8)]"
                    : "bg-white/[0.04] border-white/[0.08] hover:border-brand-amber/30 hover:bg-white/[0.06]",
                )}
              >
                {f.accent && (
                  <div
                    aria-hidden
                    className="absolute inset-0 opacity-[0.12] pointer-events-none"
                    style={{ backgroundImage: "radial-gradient(circle at 70% 20%, #E09B6B 0%, transparent 60%)" }}
                  />
                )}
                <div
                  className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 relative",
                    f.accent ? "bg-white/15" : "bg-primary/20",
                  )}
                >
                  <f.icon className={cn("w-5 h-5", f.accent ? "text-white" : "text-brand-amber")} aria-hidden />
                </div>
                <div className="relative">
                  <h3 className="font-heading font-semibold text-base mb-1.5 tracking-tight text-white">{f.title}</h3>
                  <p className={cn("text-sm leading-relaxed font-body", f.accent ? "text-white/75" : "text-white/55")}>{f.desc}</p>
                </div>
                <div className="mt-auto flex items-center gap-1.5 text-sm font-semibold transition-all group-hover:gap-2.5 relative text-brand-amber">
                  Open {f.title}
                  <div
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center transition-all",
                      f.accent ? "bg-brand-amber text-[#0f0f0f]" : "bg-brand-amber/20 text-brand-amber",
                    )}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <Collapsible
            open={powerToolsOpen}
            onOpenChange={setPowerToolsOpen}
            className="mt-10 rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full min-h-[3rem] items-center justify-between gap-3 px-5 py-4 text-left text-sm font-semibold text-white hover:bg-white/[0.04] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-amber/50"
              >
                <span className="font-body text-white/90">Power tools — compare &amp; audit feeds</span>
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 text-white/50 transition-transform duration-200", powerToolsOpen && "rotate-180")}
                  aria-hidden
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="grid sm:grid-cols-2 gap-4 px-5 pb-5 pt-1 border-t border-white/[0.06]">
                <Link
                  to="/feed-compare"
                  className="group rounded-xl border border-white/[0.1] bg-white/[0.03] p-5 flex flex-col gap-2 hover:border-brand-amber/30 transition-colors"
                >
                  <div className="flex items-center gap-2 text-brand-amber">
                    <GitCompare className="w-4 h-4" aria-hidden />
                    <span className="font-heading font-semibold text-white text-sm">Feed compare</span>
                  </div>
                  <p className="text-xs text-white/50 font-body leading-relaxed">
                    Diff two imports or sessions and spot structural changes.
                  </p>
                  <span className="text-xs font-semibold text-brand-amber inline-flex items-center gap-1 mt-1">
                    Open <ArrowUpRight className="w-3 h-3" aria-hidden />
                  </span>
                </Link>
                <Link
                  to="/cross-agency-dupes"
                  className="group rounded-xl border border-white/[0.1] bg-white/[0.03] p-5 flex flex-col gap-2 hover:border-brand-amber/30 transition-colors"
                >
                  <div className="flex items-center gap-2 text-brand-amber">
                    <Layers className="w-4 h-4" aria-hidden />
                    <span className="font-heading font-semibold text-white text-sm">Cross-agency duplicates</span>
                  </div>
                  <p className="text-xs text-white/50 font-body leading-relaxed">
                    Find listings that appear across more than one feed or brand.
                  </p>
                  <span className="text-xs font-semibold text-brand-amber inline-flex items-center gap-1 mt-1">
                    Open <ArrowUpRight className="w-3 h-3" aria-hidden />
                  </span>
                </Link>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </section>

      {/* ── WHO IT'S FOR ── */}
      <section
        id="section-audiences"
        aria-labelledby="section-audiences-heading"
        className="scroll-mt-36 bg-[#0a0a0a] text-white border-b border-white/[0.06] py-16 lg:py-20"
      >
        <div className="max-w-[1320px] mx-auto px-6">
          <p className="text-[11px] uppercase tracking-[0.35em] text-brand-slate mb-3 font-body">Who it&apos;s for</p>
          <h2 id="section-audiences-heading" className="font-heading font-semibold text-2xl sm:text-3xl tracking-tight text-white max-w-3xl mb-4">
            Built for teams who own listing data end to end
          </h2>
          <p className="text-sm text-white/55 font-body max-w-2xl mb-12 leading-relaxed">
            Whether you integrate feeds for clients or review them in-house, Feed Viewer Pro keeps structure, coverage, and quality visible —
            without standing up a separate staging portal.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {BUILT_FOR_ROWS.map((row) => (
              <div
                key={row.title}
                className="rounded-2xl border border-white/[0.1] bg-white/[0.03] p-6 flex flex-col gap-4 hover:border-brand-amber/25 transition-colors"
              >
                <div className="w-11 h-11 rounded-xl bg-primary/25 flex items-center justify-center">
                  <row.icon className="w-5 h-5 text-brand-amber" aria-hidden />
                </div>
                <h3 className="font-heading font-semibold text-lg text-white">{row.title}</h3>
                <p className="text-sm text-white/55 font-body leading-relaxed flex-1">{row.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WORKFLOW ── */}
      <section
        id="section-workflow"
        aria-labelledby="section-workflow-heading"
        className="scroll-mt-36 bg-[#0a0a0a] text-white border-b border-white/[0.06]"
      >
        <div className="max-w-[1320px] mx-auto px-6 py-16 lg:py-24 flex flex-col lg:flex-row gap-12 lg:gap-20 items-center">
          <div className="flex-1 order-2 lg:order-1 w-full">
            <p className="text-[11px] uppercase tracking-[0.35em] text-white/45 mb-3 font-body">The workflow</p>
            <h2 id="section-workflow-heading" className="font-heading font-semibold text-3xl sm:text-4xl tracking-tight mb-4">
              From raw XML to <span className="text-brand-amber">portal-ready</span> listings
            </h2>
            <p className="text-white/70 text-sm leading-relaxed mb-6 max-w-md font-body">
              Step through import, XML field mapping, and validation without leaving the app. Built for teams who ship feeds weekly.
            </p>
            <ul
              className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 list-none p-0 m-0"
              aria-label="Workflow progress"
            >
              {(
                [
                  {
                    title: "Import XML",
                    done: hasData,
                    cap: "Parse & load listings",
                    to: "/sources",
                  },
                  {
                    title: "Map XML fields",
                    done: wfFlags.mapping,
                    cap: "XML paths to listing columns",
                    to: "/field-mapping",
                  },
                  {
                    title: "Validate",
                    done: wfFlags.validation,
                    cap: "Quality & conflicts",
                    to: "/validation",
                  },
                ] as const
              ).map((step) => (
                <li key={step.title}>
                  <Link
                    to={step.to}
                    className={cn(
                      "flex h-full flex-col gap-1 rounded-xl border p-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-amber/50",
                      step.done
                        ? "border-emerald-500/35 bg-emerald-500/[0.06]"
                        : "border-white/[0.1] bg-white/[0.03] hover:border-brand-amber/25",
                    )}
                  >
                    <span className="flex items-center gap-2 text-xs font-semibold text-white font-heading">
                      {step.done ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden />
                      ) : (
                        <span className="flex h-4 w-4 shrink-0 rounded-full border border-white/30" aria-hidden />
                      )}
                      {step.title}
                    </span>
                    <span className="text-[11px] text-white/45 font-body leading-snug pl-6">{step.cap}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div role="tablist" aria-label="Workflow steps" className="flex gap-2 flex-wrap">
              {workflowSlidesLive.map((slide, i) => (
                <button
                  key={slide.title}
                  type="button"
                  role="tab"
                  aria-selected={workflowIdx === i}
                  aria-controls="workflow-panel"
                  id={`workflow-tab-${i}`}
                  onClick={() => setWorkflowIdx(i)}
                  className={cn(
                    "h-2 rounded-full transition-all duration-300 min-w-[8px]",
                    workflowIdx === i ? "w-8 bg-brand-amber" : "w-2 bg-white/25 hover:bg-white/40",
                  )}
                  aria-label={`Step ${i + 1}: ${slide.title}`}
                />
              ))}
            </div>
            <div id="workflow-panel" role="tabpanel" aria-labelledby={`workflow-tab-${workflowIdx}`} className="mt-6">
              <p className="text-sm font-heading font-semibold text-white">{workflowSlidesLive[workflowIdx]?.title}</p>
              <p className="text-xs text-white/55 mt-1 font-body">{workflowSlidesLive[workflowIdx]?.caption}</p>
            </div>
          </div>
          <div className="flex-1 order-1 lg:order-2 w-full max-w-xl">
            <div className="relative rounded-[2rem] overflow-hidden aspect-[4/3] border border-white/12 shadow-2xl ring-1 ring-primary/15">
              {(() => {
                const slide = workflowSlidesLive[workflowIdx] ?? workflowSlidesLive[0]!;
                return (
                  <img
                    src={slide.img}
                    alt={`${slide.title}: ${slide.caption}`}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                );
              })()}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" aria-hidden />
            </div>
          </div>
        </div>
      </section>

      {/* ── QUALITY ── */}
      <section
        id="section-quality"
        aria-labelledby="section-quality-heading"
        className="scroll-mt-36 bg-primary text-primary-foreground border-t border-black/10 border-b-2 border-[#0a0a0a]"
      >
        <div className="max-w-[1320px] mx-auto px-6 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-center">
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-primary-foreground/50 mb-3 font-body">Our quality</p>
              <h2 id="section-quality-heading" className="font-heading font-semibold text-3xl sm:text-4xl tracking-tight mb-6">
                Precision for <span className="text-white/40">every</span> field.
              </h2>
              <p className="text-primary-foreground/75 text-sm leading-relaxed font-body max-w-md">
                Overlapping datasets, diff history, and validation that surfaces what matters before your users see it.
              </p>
            </div>
            <div
              className="relative isolate z-0 flex h-[320px] w-full items-center justify-center"
              aria-hidden
            >
              {/* z-[1–3] are scoped by isolate — avoids stacking above sticky section nav */}
              <div className="absolute w-44 h-44 sm:h-52 sm:w-52 rounded-full border-4 border-white/20 overflow-hidden shadow-xl -translate-x-10 z-[1]">
                <img
                  src={qualityCircles[0]}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              </div>
              <div className="absolute w-44 h-44 sm:h-52 sm:w-52 rounded-full border-4 border-brand-amber/40 overflow-hidden shadow-xl translate-x-10 z-[2]">
                <img
                  src={qualityCircles[1]}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              </div>
              <div className="absolute w-36 h-36 rounded-full border-4 border-white/30 overflow-hidden shadow-xl z-[3]">
                <img
                  src={qualityCircles[2]}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── LISTING PREVIEW (table + visual strip) ── */}
      <section
        id="section-preview"
        aria-labelledby="section-preview-heading"
        className="scroll-mt-36 bg-[#0a0a0a] border-t border-primary/10 border-b border-white/[0.06]"
      >
        <div className="max-w-[1320px] mx-auto px-6 py-16">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <p className="text-[11px] text-brand-slate uppercase tracking-[0.3em] font-semibold mb-2 font-body">
                {hasData ? "Live rows from your feeds" : ""}
              </p>
              <h2 id="section-preview-heading" className="text-white font-heading font-semibold text-xl sm:text-2xl tracking-tight max-w-2xl">
                {hasData ? "Listing preview — open any row for the full detail page" : ""}
              </h2>
              <p className="mt-2 text-sm text-white/45 font-body max-w-xl">
                {hasData
                  ? "Scroll the table on long imports. Reference, type, beds, price, and location update from your active workspace data."
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {hasData && (
                <Button
                  asChild
                  size="sm"
                  className="bg-brand-amber hover:bg-brand-amber/90 text-[#0f0f0f] rounded-full h-10 px-6 text-xs font-semibold gap-1.5 border-0 shadow-lg"
                >
                  <Link to="/listings">
                    <LayoutGrid className="w-3.5 h-3.5" aria-hidden />
                    View all listings
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                  </Link>
                </Button>
              )}
              <Button
                asChild
                size="sm"
                variant={hasData ? "ghost" : "default"}
                className={
                  hasData
                    ? "rounded-full h-10 px-6 text-xs font-semibold gap-1.5 border border-white/20 text-white hover:bg-white/10 bg-transparent"
                    : "bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-10 px-6 text-xs font-semibold gap-1.5 shadow-lg border-0"
                }
              >
                <Link to="/sources">
                  <Upload className="w-3.5 h-3.5" aria-hidden />
                  Manage sources
                </Link>
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] overflow-hidden bg-white/[0.03] flex flex-col">
            <div className="overflow-x-auto">
              <div className={cn("min-w-[520px]", hasData && "max-h-[min(22rem,55vh)] overflow-y-auto overscroll-y-contain")}>
                <table className="w-full text-left text-sm text-white/70 font-body">
                  <caption className="sr-only">
                    {hasData ? "Preview of imported listings with links to each listing" : ""}
                  </caption>
                  <thead className="sticky top-0 z-[1] bg-white/[0.08] backdrop-blur-sm border-b border-white/[0.08]">
                    <tr>
                      {(["Ref", "Type", "Beds", "Price", "Location"] as const).map((col) => (
                        <th
                          key={col}
                          scope="col"
                          className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-white/45 font-body"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {tableRows.map((row) => (
                        <tr
                          key={row.id}
                          className="hover:bg-white/[0.04] transition-colors"
                          title={`${row.ref} · ${row.type} · ${row.beds} beds · ${row.price} · ${row.location}`}
                        >
                          <td className="px-5 py-3.5 align-middle">
                            <Link
                              to={`/listing/${encodeURIComponent(row.id)}`}
                              className="font-mono text-brand-amber/90 text-xs truncate block max-w-[10rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-amber/50 rounded"
                            >
                              {row.ref}
                            </Link>
                          </td>
                          <td className="px-5 py-3.5 align-middle truncate max-w-[8rem]">{row.type}</td>
                          <td className="px-5 py-3.5 align-middle">{row.beds}</td>
                          <td className="px-5 py-3.5 align-middle font-semibold text-white truncate max-w-[10rem]">{row.price}</td>
                          <td className="px-5 py-3.5 align-middle text-white/55 truncate max-w-[12rem]">
                            <Link
                              to={`/listing/${encodeURIComponent(row.id)}`}
                              className="hover:text-brand-amber/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-amber/50 rounded"
                            >
                              {row.location}
                            </Link>
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-5 py-3.5 border-t border-white/[0.08] bg-white/[0.02] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-xs text-white/45 flex items-start sm:items-center gap-2 font-body">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-amber shrink-0 mt-0.5 sm:mt-0" aria-hidden />
                {hasData ? (
                  <span>
                    {listings.length > tableRows.length
                      ? `First ${tableRows.length.toLocaleString()} of ${listings.length.toLocaleString()} listings in this preview — use View more listings for the rest.`
                      : `${tableRows.length.toLocaleString()} listing${tableRows.length === 1 ? "" : "s"} in this preview — scroll if needed, or use row links for details.`}
                  </span>
                ) : (
                  <span></span>
                )}
              </div>
              {hasData && (
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  className="shrink-0 self-start sm:self-auto rounded-full h-9 px-4 text-xs font-semibold text-brand-amber hover:text-brand-amber hover:bg-brand-amber/10 border border-brand-amber/35"
                >
                  <Link to="/listings" className="gap-2">
                    View more listings
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                  </Link>
                </Button>
              )}
            </div>
          </div>

          <div className="mt-14">
            <Link
              to={hasData ? "/listings" : "/sources"}
              aria-label={
                hasData
                  ? "Browse every listing in grid or map view — opens listings"
                  : "One import full visibility — opens import"
              }
              className="relative block rounded-[2.5rem] overflow-hidden aspect-[21/9] min-h-[200px] border border-white/[0.08] group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-amber/60"
            >
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                style={{
                  backgroundImage: `url(${wideImageUrl})`,
                }}
                aria-hidden
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-transparent" aria-hidden />
              <div className="absolute inset-0 flex items-center pl-8 sm:pl-14">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-white/55 mb-2 font-body">
                    {hasData ? "From your feed" : "See the workspace"}
                  </p>
                  <p className="text-white font-heading font-semibold text-2xl sm:text-3xl tracking-tight max-w-md">
                    {hasData ? "Browse every listing in grid or map view" : "One import. Full visibility."}
                  </p>
                  <p className="mt-2 text-sm text-white/50 font-body max-w-sm">
                    {hasData ? "Opens the listings browser" : "Opens import to add your first XML feed"}
                  </p>
                </div>
              </div>
              <span
                className="absolute right-8 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center text-white group-hover:bg-white/25 transition-colors pointer-events-none"
                aria-hidden
              >
                <Play className="w-6 h-6 ml-0.5" fill="currentColor" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── LIVE WORKSPACE (conditional) ── */}
      {hasData && (
        <section
          id="section-workspace"
          aria-labelledby="section-workspace-heading"
          className="scroll-mt-36 bg-primary text-primary-foreground border-b border-black/10"
        >
          <div className="max-w-[1320px] mx-auto px-6 py-16 lg:py-20">
            <div className="flex items-center justify-between mb-10 flex-wrap gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-primary-foreground/55 font-body mb-2">Your workspace</p>
                <h2 id="section-workspace-heading" className="font-heading font-semibold text-2xl tracking-tight">
                  {scope.mode === "all" ? "All sources snapshot" : `Source scope: ${scope.agencyName}`}
                </h2>
                <p className="mt-2 text-sm text-primary-foreground/65 font-body max-w-xl">
                  High-level counts and shortcuts to the areas you use most. Numbers reflect the live version of each source in scope.
                </p>
              </div>
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="text-primary-foreground/85 hover:text-primary-foreground border border-white/25 hover:bg-white/10 rounded-full h-9 px-5 text-xs"
              >
                <Link to="/listings">
                  View all listings <ArrowRight className="w-3 h-3 ml-1" aria-hidden />
                </Link>
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
              {[
                { icon: Database, label: "Listings", value: listings.length.toLocaleString(), color: "text-brand-mist" },
                { icon: Users, label: "Agents", value: agentsCount.toLocaleString(), color: "text-brand-mist" },
                { icon: Building2, label: "Agency", value: agency?.name || "N/A", color: "text-brand-amber", small: true },
                {
                  icon: MapIcon,
                  label: "Last feed update",
                  value: importTime ? new Date(importTime).toLocaleDateString() : "Never",
                  color: "text-brand-mist",
                  small: true,
                },
                {
                  icon: AlertTriangle,
                  label: "Warnings",
                  value: missingImages === 0 && missingPrice === 0 ? "All clean ✓" : `${missingImages + missingPrice} issues`,
                  color: missingImages + missingPrice > 0 ? "text-yellow-300" : "text-emerald-300",
                  small: true,
                },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl p-5 border border-white/15 bg-black/15 backdrop-blur-sm flex flex-col gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                      <s.icon className={cn("w-4 h-4", s.color)} aria-hidden />
                    </div>
                    <span className="text-[11px] text-primary-foreground/65 uppercase tracking-wider font-body">{s.label}</span>
                  </div>
                  <div className={cn("font-heading font-semibold text-white", s.small ? "text-base" : "text-3xl", "leading-tight truncate")}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {[
                { to: "/listings", icon: Layers, label: "Datasets", sub: `${agenciesCount} agencies · ${versionCount} versions` },
                { to: "/agencies", icon: Building2, label: "Agencies", sub: "Switch feeds & compare quality", amber: true },
                { to: "/sources", icon: Upload, label: "Sources", sub: "Agency feeds, versions and quality" },
                { to: "/validation", icon: ClipboardList, label: "Validation", sub: "Conflicts, diffs, feed health" },
                { to: "/compare", icon: GitCompare, label: "Compare", sub: "2–4 listings side by side", amber: true },
                {
                  to: "/workspace-insights",
                  icon: PieChart,
                  label: "Insights",
                  sub: "Workspace KPIs, charts & playbook",
                  amber: true,
                },
                {
                  to: "/export-hub",
                  icon: Download,
                  label: "Export hub",
                  sub: "CSV, compares, workspace sync",
                  amber: true,
                },
                { to: "/shortcuts", icon: Keyboard, label: "Shortcuts", sub: "Palette keys & navigation tips" },
                { to: "/sitemap", icon: ListTree, label: "Site map", sub: "Every route in one page" },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="group rounded-2xl p-4 border border-white/12 bg-black/10 hover:bg-black/25 hover:border-white/25 transition-all duration-200 flex items-center gap-3"
                >
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                      item.amber ? "bg-brand-amber/20" : "bg-white/10",
                    )}
                  >
                    <item.icon className={cn("w-4 h-4", item.amber ? "text-brand-amber" : "text-brand-mist")} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{item.label}</div>
                    <div className="text-[11px] text-primary-foreground/60 truncate font-body">{item.sub}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── AGENTS & BRANDS ── */}
      <section
        id="section-network"
        aria-labelledby="section-network-heading"
        className="scroll-mt-36 bg-gradient-to-b from-[#0a0a0a] to-[#0b1210] border-b border-white/[0.06]"
      >
        <div className="max-w-[1320px] mx-auto px-6 py-16 lg:py-20 text-white">
          <p className="text-[11px] uppercase tracking-[0.35em] text-brand-slate mb-3 font-body">Network</p>
          <h2 id="section-network-heading" className="font-heading font-semibold text-2xl sm:text-3xl tracking-tight text-white max-w-2xl mb-12">
            Agents and agencies from your feeds
          </h2>

          <div className="space-y-16">
            <div aria-labelledby="section-agents-heading">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                <div>
                  <h3 id="section-agents-heading" className="font-heading font-semibold text-xl text-white">
                    Agents
                  </h3>
                  <p className="mt-2 text-sm text-white/55 font-body max-w-lg">
                    {hasData
                      ? "Photos and contact fields parsed from XML — open an agent to see their inventory."
                      : "After import, agent cards fill with names, photos, phone, and email from your XML."}
                  </p>
                </div>
                <Button
                  asChild
                  variant="ghost"
                  className="border border-white/20 text-white hover:bg-white/10 rounded-full h-10 px-5 text-xs shrink-0"
                >
                  <Link to="/agents" className="gap-2">
                    <Users className="w-4 h-4" aria-hidden />
                    All agents
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                  </Link>
                </Button>
              </div>

              {hasData && homeAgents.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.1] bg-white/[0.03] p-10 text-center max-w-lg mx-auto">
                  <Users className="w-10 h-10 mx-auto text-white/25 mb-3" aria-hidden />
                  <p className="text-white/70 font-body text-sm mb-4">
                    No agent names in your listings. Map agent fields in your XML to see cards here.
                  </p>
                  <Button asChild variant="ghost" className="border border-white/20 text-white hover:bg-white/10 rounded-full">
                    <Link to="/field-mapping">Open XML field mapping</Link>
                  </Button>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {homeAgents.map((a) => {
                    const agName = hasData ? agentToAgency.get(a.name) : undefined;
                    const href =
                      hasData && agName
                        ? `/agencies/${encodeURIComponent(agName)}/agents/${encodeURIComponent(a.name)}`
                        : hasData
                          ? `/agents/${encodeURIComponent(a.name)}`
                          : "/agents";
                    return (
                      <Link
                        key={a.name}
                        to={href}
                        aria-label={`${a.name}, ${a.count} listings${agName ? `, ${agName}` : ""}`}
                        className={cn(
                          "group rounded-2xl border border-white/[0.1] bg-white/[0.04] p-5 sm:p-6 transition-colors",
                          "hover:border-brand-amber/35 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-amber/50",
                        )}
                      >
                        <div className="flex items-start gap-3 sm:gap-4">
                          <div className="relative shrink-0 overflow-visible pr-1 pb-1">
                            {"photo" in a && a.photo ? (
                              <AgentPhoto variant="tile" src={a.photo} alt="" />
                            ) : (
                              <div className="w-16 h-16 rounded-2xl bg-white/[0.08] ring-2 ring-white/15 flex items-center justify-center">
                                <User className="w-7 h-7 text-white/35" aria-hidden />
                              </div>
                            )}
                            <span className="absolute bottom-0 right-0 z-[1] max-w-[calc(100%+4px)] text-[10px] font-bold tabular-nums px-2 py-0.5 rounded-full bg-brand-amber text-[#0f0f0f] shadow whitespace-nowrap">
                              {a.count} listings
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-heading font-semibold text-lg text-white truncate group-hover:text-brand-amber transition-colors">
                              {a.name}
                            </div>
                            {hasData && agName && (
                              <div className="text-xs text-white/45 mt-1 flex items-center gap-1.5 font-body">
                                <Building2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                <span className="truncate">{agName}</span>
                              </div>
                            )}
                            <div className="mt-3 flex flex-col gap-1.5 text-xs text-white/50 font-body">
                              {a.phone ? (
                                <span className="inline-flex items-center gap-2 min-w-0">
                                  <Phone className="w-3.5 h-3.5 shrink-0 text-brand-amber/80" aria-hidden />
                                  <span className="truncate">{a.phone}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-2 text-white/35">
                                  <Phone className="w-3.5 h-3.5" aria-hidden />
                                  No phone in feed
                                </span>
                              )}
                              {a.email ? (
                                <span className="inline-flex items-center gap-2 min-w-0">
                                  <Mail className="w-3.5 h-3.5 shrink-0 text-brand-amber/80" aria-hidden />
                                  <span className="truncate">{a.email}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-2 text-white/35">
                                  <Mail className="w-3.5 h-3.5" aria-hidden />
                                  No email in feed
                                </span>
                              )}
                            </div>
                          </div>
                          <ArrowUpRight className="w-5 h-5 text-white/25 group-hover:text-brand-amber shrink-0 mt-1 transition-colors" aria-hidden />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-white/[0.08] pt-16" aria-labelledby="section-agencies-heading">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                <div>
                  <h3 id="section-agencies-heading" className="font-heading font-semibold text-xl text-white">
                    Agencies
                  </h3>
                  <p className="mt-2 text-sm text-white/55 font-body max-w-lg">
                    {hasData ? HOME_AGENCIES_TEASER : "Import XML to index one or more agencies and switch between them anytime."}
                  </p>
                </div>
                <Button
                  asChild
                  className="bg-brand-amber hover:bg-brand-amber/90 text-[#0f0f0f] font-semibold rounded-full h-10 px-6 text-xs border-0 shrink-0"
                >
                  <Link to="/agencies" className="gap-2">
                    <Building2 className="w-4 h-4" aria-hidden />
                    All agencies
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                  </Link>
                </Button>
              </div>

              {hasData && homeAgencies.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.1] bg-white/[0.03] p-10 text-center max-w-lg mx-auto">
                  <Building2 className="w-10 h-10 mx-auto text-white/25 mb-3" aria-hidden />
                  <p className="text-white/70 font-body text-sm mb-4">
                    No agencies indexed yet. Import an XML feed with agency metadata to populate this section.
                  </p>
                  <Button asChild className="bg-brand-amber hover:bg-brand-amber/90 text-[#0f0f0f] font-semibold rounded-full border-0">
                    <Link to="/sources">Go to Sources</Link>
                  </Button>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {homeAgencies.map((row) => (
                    <Link
                      key={row.name}
                      to={`/agencies/${encodeURIComponent(row.name)}`}
                      aria-label={`${row.name}, ${row.listingsCount.toLocaleString()} listings`}
                      className={cn(
                        "group rounded-2xl border border-white/[0.1] bg-white/[0.04] p-5 sm:p-6 transition-colors",
                        "hover:border-brand-amber/35 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-amber/50",
                      )}
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-white/[0.06] ring-2 ring-white/15 overflow-hidden flex items-center justify-center shrink-0">
                          {row.logo ? (
                            <img src={row.logo} alt={`${row.name} logo`} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <Building2 className="w-7 h-7 text-white/35" aria-hidden />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-heading font-semibold text-lg text-white leading-snug group-hover:text-brand-amber transition-colors">
                            {row.name}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/50 font-body">
                            <span className="inline-flex items-center gap-1.5 tabular-nums">
                              <LayoutGrid className="w-3.5 h-3.5 text-brand-amber/80" aria-hidden />
                              {row.listingsCount.toLocaleString()} listings
                            </span>
                            {row.lastImportedAt && (
                              <span className="inline-flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-white/35" aria-hidden />
                                {new Date(row.lastImportedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {(row.website || row.email || row.phone) && (
                            <div className="mt-3 space-y-1 text-xs text-white/45 font-body truncate">
                              {row.website && <div className="truncate">{row.website}</div>}
                              {!row.website && row.email && <div className="truncate">{row.email}</div>}
                              {!row.website && !row.email && row.phone && <div className="truncate">{row.phone}</div>}
                            </div>
                          )}
                        </div>
                        <ArrowUpRight className="w-5 h-5 text-white/25 group-hover:text-brand-amber shrink-0 mt-1 transition-colors" aria-hidden />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── CLOSING CTA (brand green) ── */}
      <section
        id="section-cta"
        aria-labelledby="section-cta-heading"
        className="scroll-mt-36 bg-primary text-primary-foreground border-t border-black/10"
      >
        <div className="max-w-[1320px] mx-auto px-6 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-primary-foreground/55 mb-3 font-body">Let&apos;s combine strengths</p>
              <h2 id="section-cta-heading" className="font-heading font-semibold text-3xl sm:text-4xl text-white tracking-tight mb-6">
                Ship feeds your team can trust.
              </h2>
              <p className="text-primary-foreground/75 text-sm leading-relaxed mb-8 max-w-md font-body">
                Bring your XML, invite your analysts, and use Feed Viewer Pro as the single place to review listing data before it hits production.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  asChild
                  size="lg"
                  className="bg-brand-amber hover:bg-brand-amber/90 text-[#0f0f0f] font-semibold rounded-full h-12 px-8 border-0"
                >
                  <Link to="/signup" onClick={() => trackHomeEvent("home_cta_signup_click")}>
                    Create account
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full h-12 px-8 border-white/30 text-white hover:bg-white/10 bg-transparent"
                >
                  <Link to="/sources" onClick={() => trackHomeEvent("home_cta_import_click")}>
                    Go to Sources
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full h-12 px-8 border-white/30 text-white hover:bg-white/10 bg-transparent"
                >
                  <Link to="/listings" onClick={() => trackHomeEvent("home_cta_browse_click")}>
                    Browse listings
                  </Link>
                </Button>
              </div>
            </div>
            <Link
              to={featured ? `/listing/${encodeURIComponent(featured.id)}` : "/listings"}
              aria-label={
                featured
                  ? `Open featured listing: ${featured.title || featured.reference || "property"}`
                  : "Browse listings"
              }
              className="relative block rounded-[2rem] overflow-hidden aspect-[4/3] border border-white/20 shadow-lg ring-1 ring-black/20 group/cta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-amber/50"
            >
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover/cta:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover/cta:scale-100"
                style={{
                  backgroundImage: `url(${ctaImageUrl})`,
                }}
                aria-hidden
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-black/70 via-transparent to-transparent" />
              <div className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-brand-amber flex items-center justify-center shadow-lg opacity-0 group-hover/cta:opacity-100 transition-opacity">
                <ArrowUpRight className="w-4 h-4 text-[#0f0f0f]" />
              </div>
            </Link>
          </div>
        </div>
      </section>
      </main>
    </div>
  );
}
