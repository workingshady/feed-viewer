import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Check,
  Download,
  FileUp,
  GitCompare,
  History,
  LayoutGrid,
  Map,
  Share2,
  ShieldCheck,
  Sparkles,
  Undo2,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandLogo";
import { useSignupStatus } from "@/hooks/useSignupStatus";
import { QUALITY_CHECKS } from "@/lib/versionStats";

const STEPS = [
  { icon: FileUp, title: "Upload", text: "Drop one or more agency XML feeds. They are read in your browser and matched to their agency." },
  { icon: GitCompare, title: "Review", text: "See added, removed and changed listings against what is live, plus a quality score, before anything changes." },
  { icon: Undo2, title: "Apply or roll back", text: "Make any version live in one click. Every page follows. Switch back just as fast." },
];

const FEATURES = [
  { icon: History, title: "Version history per agency", text: "Every upload is kept as a numbered version with notes, pins and automatic clean-up of old ones." },
  { icon: ShieldCheck, title: "Safety rule", text: "A version that suddenly loses more than 30% of the live listings is held for review instead of going live." },
  { icon: Sparkles, title: "Listing quality score", text: "Photos, permit numbers, map points, descriptions and contacts checked per version — with a CSV of what to fix." },
  { icon: GitCompare, title: "Compare any two versions", text: "Field-by-field changes for every listing that moved, priced up or disappeared." },
  { icon: Map, title: "Explore the live data", text: "Listings grid, map, agencies, agents, duplicates across agencies and field-level quality." },
  { icon: LayoutGrid, title: "Field mapping", text: "Map unusual XML layouts to listing fields per agency, then re-parse the live file with one click." },
  { icon: BarChart3, title: "Dashboards", text: "Workspace, agent and admin dashboards: inventory over time, price and bedroom mix, quality bands, workload per agent." },
  { icon: Download, title: "Reports & exports", text: "Every chart doubles as a table and a CSV. Per-version reports cover feed checks, changes and agents as JSON." },
  { icon: Share2, title: "Read-only share links", text: "Share one listing or a whole source with people who have no account. Links expire and can be revoked." },
];

/** Static product preview: the Sources page version timeline, drawn with real UI tokens. */
const DASHBOARDS = [
  { title: "Workspace", text: "Listings per version, recent changes, live inventory by source, market and quality mix.", bars: [38, 62, 54, 80, 71, 92] },
  { title: "Agents", text: "Top agents by sale and rent, workload spread, how concentrated each agency is.", bars: [95, 52, 34, 22, 15, 9] },
  { title: "Admin", text: "Daily activity, sign-ins, storage per source, users by role and system health.", bars: [12, 30, 18, 44, 26, 58] },
];

function ProductPreview() {
  const rows = [
    { v: 3, live: true, file: "white-and-co-oct.xml", count: "3,141", diff: ["+42", "−18", "~96"], score: 86 },
    { v: 2, live: false, file: "white-and-co-sep.xml", count: "3,117", diff: ["+12", "−30", "~51"], score: 83 },
    { v: 1, live: false, file: "white-and-co-aug.xml", count: "3,135", diff: ["+3,135", "−0", "~0"], score: 79 },
  ];
  return (
    <div
      aria-hidden
      className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#111312] p-4 shadow-[0_30px_80px_-20px_rgba(29,71,52,0.55)]"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-success" />
        <span className="text-sm font-semibold text-white">White &amp; Co Real Estate</span>
        <span className="ml-auto font-mono text-xs text-white/50">Quality 86/100</span>
      </div>
      <ol className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.v}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-xs ${r.live ? "border-[#7FD8A9]/60 bg-[#7FD8A9]/5" : "border-white/10"}`}
          >
            <span className="font-mono font-bold text-white">v{r.v}</span>
            {r.live && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#7FD8A9] px-2 py-0.5 text-[10px] font-semibold text-[#0b1f16]">
                <Check className="h-3 w-3" /> Live
              </span>
            )}
            <span className="hidden min-w-0 flex-1 truncate text-white/55 sm:block">{r.file}</span>
            <span className="ml-auto font-mono text-white/70">{r.count}</span>
            <span className="flex gap-1 font-mono">
              <span className="rounded bg-success/15 px-1.5 text-success">{r.diff[0]}</span>
              <span className="rounded bg-destructive/15 px-1.5 text-destructive-text">{r.diff[1]}</span>
              <span className="rounded bg-warning/15 px-1.5 text-warning">{r.diff[2]}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2">
        {QUALITY_CHECKS.slice(0, 4).map((c, i) => {
          const value = [91, 97, 74, 88][i];
          return (
            <div key={c.key} className="space-y-1">
              <div className="flex justify-between text-[11px] text-white/55">
                <span>{c.label}</span>
                <span className="font-mono">{value}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10">
                <div className="h-1.5 rounded-full bg-[#7FD8A9]" style={{ width: `${value}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Landing() {
  const signupOpen = useSignupStatus().data?.open ?? false;

  const ctas = (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button asChild size="lg" className="h-12 rounded-full bg-[#7FD8A9] px-7 font-semibold text-[#0b1f16] hover:bg-[#7FD8A9]/90">
        <Link to="/login">
          Sign in <ArrowRight className="ml-1.5 h-4 w-4" />
        </Link>
      </Button>
      {signupOpen && (
        <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-white/25 bg-transparent px-7 text-white hover:bg-white/10">
          <Link to="/signup">Create account</Link>
        </Button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <AppHeader />
      <main id="main-content">
        {/* Hero */}
        <section className="relative overflow-hidden pt-[calc(6.5rem+env(safe-area-inset-top,0px))] pb-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_20%,rgba(29,71,52,0.55),transparent_70%)]"
          />
          <div className="container relative grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
            <div className="space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs text-white/70">
                <BrandMark className="h-4 w-4" title="" /> Real-estate XML feeds
              </span>
              <h1 className="font-heading text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Every agency feed.
                <br />
                <span className="text-[#7FD8A9]">Every version.</span> Under control.
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-white/70">
                Upload property feeds, see exactly what changed, check listing quality and choose which version is live —
                with one-click rollback when a feed goes wrong.
              </p>
              {ctas}
              <p className="text-sm text-white/45">Private workspace. Accounts are created by an administrator.</p>
            </div>
            <div className="flex justify-center lg:justify-end">
              <ProductPreview />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section aria-labelledby="how-heading" className="border-t border-white/10 py-20">
          <div className="container space-y-10">
            <div className="max-w-2xl space-y-3">
              <h2 id="how-heading" className="font-heading text-3xl font-bold tracking-tight">
                How it works
              </h2>
              <p className="text-white/65">Three steps, and nothing on the site changes until you say so.</p>
            </div>
            <ol className="grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1D4734] font-mono text-sm font-bold text-[#7FD8A9]">
                      {i + 1}
                    </span>
                    <s.icon className="h-5 w-5 text-[#7FD8A9]" aria-hidden />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{s.title}</h3>
                  <p className="text-sm leading-relaxed text-white/65">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section aria-labelledby="features-heading" className="border-t border-white/10 py-20">
          <div className="container space-y-10">
            <h2 id="features-heading" className="font-heading text-3xl font-bold tracking-tight">
              What you get
            </h2>
            <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <li key={f.title} className="space-y-2">
                  <f.icon className="h-6 w-6 text-[#7FD8A9]" aria-hidden />
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-white/65">{f.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Dashboards */}
        <section aria-labelledby="dash-heading" className="border-t border-white/10 py-20">
          <div className="container space-y-10">
            <div className="max-w-2xl space-y-3">
              <h2 id="dash-heading" className="font-heading text-3xl font-bold tracking-tight">
                A dashboard for every question
              </h2>
              <p className="text-white/65">
                Charts follow the live version of every source, filter by sale or rent, and switch to a table you can download.
              </p>
            </div>
            <ul className="grid gap-4 md:grid-cols-3">
              {DASHBOARDS.map((d) => (
                <li key={d.title} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex h-24 items-end gap-1.5" aria-hidden>
                    {d.bars.map((h, i) => (
                      <span key={i} className="flex-1 rounded-t-[4px] bg-[#7FD8A9]/70" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                  <h3 className="font-semibold">{d.title}</h3>
                  <p className="text-sm leading-relaxed text-white/65">{d.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Quality checks */}
        <section aria-labelledby="quality-heading" className="border-t border-white/10 py-20">
          <div className="container grid gap-10 lg:grid-cols-2">
            <div className="space-y-3">
              <h2 id="quality-heading" className="font-heading text-3xl font-bold tracking-tight">
                Quality, scored the way portals score it
              </h2>
              <p className="text-white/65">
                Every version gets a 0–100 score from the checks portals care about, so weak listings are fixed before buyers see
                them.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {QUALITY_CHECKS.map((c) => (
                <li key={c.key} className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm">
                  <span className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#7FD8A9]" aria-hidden /> {c.label}
                  </span>
                  <span className="font-mono text-white/45">{c.weight} pts</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-white/10 py-20">
          <div className="container flex flex-col items-start gap-6 rounded-3xl border border-white/10 bg-[#1D4734]/30 p-8 md:flex-row md:items-center md:justify-between md:p-12">
            <div className="space-y-2">
              <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">Ready when your feeds are.</h2>
              <p className="text-white/65">Sign in to upload a feed, review it and make it live.</p>
            </div>
            {ctas}
          </div>
        </section>
      </main>
    </div>
  );
}
