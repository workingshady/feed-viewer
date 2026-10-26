import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, Building2, Check, Mail, MapPin, Phone } from "lucide-react";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPriceCompact } from "@/lib/displayPrice";
import type { Listing } from "@/lib/types";

export type AgentSummary = {
  name: string;
  photo: string;
  phone: string;
  email: string;
  /** Broker licence (RERA BRN), agent id and info line, when the feed provides them. */
  licenseNo: string;
  agentId: string;
  info: string;
  count: number;
  sale: number;
  rent: number;
  medianSale: number | null;
  topCommunities: string[];
  /** Listings where the phone / email is missing for this agent. */
  missingPhone: number;
  missingEmail: number;
  /** The "agent" is actually the agency's own account (name matches an agency). */
  isAgencyAccount: boolean;
  /** Source (agency) most of this agent's listings come from; "" when unknown. */
  agency: string;
};

const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Groups listings by agent (by email, then phone, then name) with per-agent stats. */
export function summarizeAgents(listings: Listing[], agencyNames: string[] = []): AgentSummary[] {
  const agencies = new Set(agencyNames.map((n) => n.trim().toLowerCase()));
  const map = new Map<
    string,
    AgentSummary & { _sale: number[]; _comm: Map<string, number>; _agency: Map<string, number> }
  >();
  for (const l of listings) {
    const name = l.agent?.name?.trim();
    if (!name) continue;
    const key = l.agent.email?.trim().toLowerCase() || l.agent.phone?.replace(/\D+/g, "") || name.toLowerCase();
    let a = map.get(key);
    if (!a) {
      a = {
        name,
        photo: "",
        phone: "",
        email: "",
        licenseNo: "",
        agentId: "",
        info: "",
        count: 0,
        sale: 0,
        rent: 0,
        medianSale: null,
        topCommunities: [],
        missingPhone: 0,
        missingEmail: 0,
        isAgencyAccount: agencies.has(name.toLowerCase()),
        agency: "",
        _sale: [],
        _comm: new Map(),
        _agency: new Map(),
      };
      map.set(key, a);
    }
    a.count++;
    if (l.purpose === "sale") {
      a.sale++;
      if (l.price > 0) a._sale.push(l.price);
    } else if (l.purpose === "rent") a.rent++;
    a.photo ||= l.agent.photo ?? "";
    a.phone ||= l.agent.phone ?? "";
    a.email ||= l.agent.email ?? "";
    a.licenseNo ||= l.agent.licenseNo?.trim() ?? "";
    a.agentId ||= l.agent.id?.trim() ?? "";
    a.info ||= l.agent.info?.trim() ?? "";
    if (!l.agent.phone?.trim()) a.missingPhone++;
    if (!l.agent.email?.trim()) a.missingEmail++;
    const c = l.community?.trim();
    if (c) a._comm.set(c, (a._comm.get(c) ?? 0) + 1);
    const src = l.sourceAgency?.trim();
    if (src) a._agency.set(src, (a._agency.get(src) ?? 0) + 1);
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((x, y) => y[1] - x[1]);
  return [...map.values()].map(({ _sale, _comm, _agency, ...a }) => ({
    ...a,
    agency: top(_agency)[0]?.[0] ?? "",
    medianSale: median(_sale),
    topCommunities: top(_comm).slice(0, 3).map(([c]) => c),
  }));
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/60 px-2.5 py-1.5 ring-1 ring-inset ring-border/60">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="truncate font-heading text-sm font-bold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function ContactState({ icon: Icon, missing, label }: { icon: typeof Phone; missing: number; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        missing
          ? "bg-warning/10 text-warning ring-warning/25"
          : "bg-success/10 text-success ring-success/20",
      )}
      title={missing ? `${missing} listing${missing === 1 ? "" : "s"} without ${label}` : `${label} on every listing`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {missing ? `${missing} no ${label}` : label}
      {!missing && <Check className="h-3 w-3" aria-hidden />}
    </span>
  );
}

/**
 * Agent card: photo, identity (licence, agency), inventory split and contact completeness.
 * Pass `showAgency={false}` inside an agency page, where the agency is already the context.
 */
export function AgentCard({
  agent,
  href,
  showAgency = true,
}: {
  agent: AgentSummary;
  href: string;
  showAgency?: boolean;
}) {
  return (
    <Link
      to={href}
      className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="flex h-full flex-col gap-3 rounded-2xl p-4 shadow-[var(--shadow-card)] transition-[border-color,box-shadow,transform] duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/35 group-hover:shadow-[var(--shadow-card-hover)]">
        <div className="flex items-start gap-3.5">
          <PersonAvatar src={agent.photo} name={agent.name} shape="rounded" className="h-16 w-16 text-base" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate font-heading text-[15px] font-bold leading-tight text-foreground" title={agent.name}>
                {agent.name}
              </h3>
              <span
                className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-primary-text ring-1 ring-inset ring-primary/20"
                title={`${agent.count} listings`}
              >
                {agent.count.toLocaleString()}
              </span>
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {agent.isAgencyAccount && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning ring-1 ring-inset ring-warning/25">
                  <Building2 className="h-3 w-3" aria-hidden /> Agency account
                </span>
              )}
              {agent.licenseNo && (
                <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                  <BadgeCheck className="h-3 w-3 text-primary-text" aria-hidden /> BRN {agent.licenseNo}
                </span>
              )}
              {showAgency && agent.agency && !agent.isAgencyAccount && (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <Building2 className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{agent.agency}</span>
                </span>
              )}
            </div>
            {agent.topCommunities.length > 0 && (
              <p className="mt-1.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground" title={agent.topCommunities.join(" · ")}>
                <MapPin className="h-3 w-3 shrink-0 text-primary-text/80" aria-hidden />
                <span className="truncate">{agent.topCommunities.join(" · ")}</span>
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Sale" value={agent.sale.toLocaleString()} />
          <Stat label="Rent" value={agent.rent.toLocaleString()} />
          <Stat label="Median sale" value={agent.medianSale ? formatPriceCompact(agent.medianSale) : "—"} />
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/70 pt-3">
          <div className="flex flex-wrap gap-1.5">
            <ContactState icon={Phone} missing={agent.missingPhone} label="phone" />
            <ContactState icon={Mail} missing={agent.missingEmail} label="email" />
          </div>
          <ArrowRight
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary-text"
            aria-hidden
          />
        </div>
      </Card>
    </Link>
  );
}

/** Shows the first `pageSize` items with a "Show more" button. */
export function usePaged<T>(items: T[], pageSize = 30) {
  const [shown, setShown] = useState(pageSize);
  const more = items.length > shown && (
    <div className="mt-6 text-center">
      <Button variant="outline" onClick={() => setShown((n) => n + pageSize)}>
        Show {Math.min(pageSize, items.length - shown)} more of {items.length - shown}
      </Button>
    </div>
  );
  return { visible: items.slice(0, shown), more, reset: () => setShown(pageSize) };
}
