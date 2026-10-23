import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Phone } from "lucide-react";
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
  const map = new Map<string, AgentSummary & { _sale: number[]; _comm: Map<string, number> }>();
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
        _sale: [],
        _comm: new Map(),
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
  }
  return [...map.values()].map(({ _sale, _comm, ...a }) => ({
    ...a,
    medianSale: median(_sale),
    topCommunities: [..._comm.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([c]) => c),
  }));
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

function Avatar({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted font-heading text-sm font-bold text-muted-foreground">
        {initials(name)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-14 w-14 shrink-0 rounded-full object-cover object-top"
    />
  );
}

/** Compact agent row card: avatar, name, areas, inventory and contact completeness. */
export function AgentCard({ agent, href }: { agent: AgentSummary; href: string }) {
  const contactOk = agent.missingPhone === 0 && agent.missingEmail === 0;
  return (
    <Link to={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="flex h-full items-start gap-3 p-4 transition-colors hover:border-primary/40">
        <Avatar src={agent.photo} name={agent.name} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate font-semibold">{agent.name}</span>
            <span className="shrink-0 rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{agent.count}</span>
          </div>
          {agent.isAgencyAccount && <p className="text-xs text-warning">Agency account, not a person</p>}
          {agent.licenseNo && <p className="font-mono text-[11px] text-muted-foreground">BRN {agent.licenseNo}</p>}
          <p className="truncate text-xs text-muted-foreground">{agent.topCommunities.join(" · ") || "—"}</p>
          <p className="text-xs text-muted-foreground">
            {agent.sale} sale · {agent.rent} rent
            {agent.medianSale ? ` · median sale ${formatPriceCompact(agent.medianSale)}` : ""}
          </p>
          <p className={cn("flex items-center gap-2 text-xs", contactOk ? "text-muted-foreground" : "text-warning")}>
            <Phone className="h-3 w-3" aria-hidden /> {agent.missingPhone ? `${agent.missingPhone} without phone` : "phone"}
            <Mail className="h-3 w-3" aria-hidden /> {agent.missingEmail ? `${agent.missingEmail} without email` : "email"}
          </p>
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
