import { useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, AlertTriangle, CheckCircle2, Database, HardDrive, Upload, Users } from "lucide-react";
import {
  adminDeleteUser,
  adminUpdateUserRole,
  fetchAdminAudit,
  fetchAdminStatus,
  fetchAdminUsers,
  type AdminAuditEvent,
  type AdminStatus,
} from "@/lib/adminApi";
import { formatBytes, timeAgo } from "@/components/sources/format";
import { useAppData } from "@/providers/useAppData";
import { AdminCharts } from "@/components/admin/AdminCharts";
import { MatchingModelCard } from "@/components/admin/MatchingModelCard";
import { InviteUserButton, PendingInvitesCard, ResetLinkButton, SharedLinksCard } from "@/components/admin/AccessCards";
import { ApiError } from "@/lib/api";
import { roleLabel, type AppRole } from "@/lib/roles";
import { useAuth } from "@/providers/AuthProvider";

const ROLES: AppRole[] = ["admin", "editor", "viewer"];

function adminErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.message === "last_admin") return "There must be at least one administrator.";
    if (err.message === "cannot_delete_self") return "You can't delete your own account.";
  }
  return "Something went wrong. Please try again.";
}

type Meta = Record<string, unknown>;

/** Plain-language description of an audit event; `sourceName` resolves ids to names. */
function describeEvent(e: AdminAuditEvent, sourceName: (id: unknown) => string | null = () => null): string {
  const m = (e.meta ?? {}) as Meta;
  const of = sourceName(m.sourceId);
  const v = m.number != null ? `v${m.number}${of ? ` of ${of}` : ""}` : "a version";
  switch (e.action) {
    case "version.upload":
      return `uploaded ${v}${m.applied ? " (made live)" : " (held for review)"}${
        Array.isArray(m.pruned) && m.pruned.length ? `; auto-deleted ${m.pruned.map((n) => `v${n}`).join(", ")}` : ""
      }`;
    case "version.apply":
      return `made ${v} live`;
    case "version.delete":
      return `deleted ${v}`;
    case "source.create":
      return `created source "${m.name ?? ""}"`;
    case "source.update":
      return `changed source settings (${Array.isArray(m.fields) ? m.fields.join(", ") : "settings"})`;
    case "source.clear_all":
      return `deleted all sources (${m.sources ?? 0} sources, ${m.versions ?? 0} versions)`;
    case "source.delete":
      return `deleted source "${m.name ?? ""}" with ${m.versions ?? 0} versions`;
    case "auth.register":
      return `created an account (${roleLabel(String(m.role ?? "viewer"))})`;
    case "auth.password_change":
      return "changed their password";
    case "user.role_change":
      return `changed a user's role to ${roleLabel(String(m.role ?? ""))}`;
    case "user.delete":
      return "deleted a user";
    case "invite.create":
      return `created an invite link (${roleLabel(String(m.role ?? "viewer"))})`;
    case "invite.revoke":
      return "revoked an invite link";
    case "user.reset_link":
      return "created a password reset link";
    case "auth.password_reset":
      return "reset their password with a link";
    case "share.create":
      return `shared ${m.kind === "listing" ? "a listing" : "a source's listings"}: ${m.label ?? ""}`;
    case "share.revoke":
      return `revoked a share link: ${m.label ?? ""}`;
    case "client.error":
      return `browser error on ${m.path ?? "a page"}: ${m.message ?? ""}`;
    default:
      return e.action;
  }
}

const AUDIT_FILTERS = [
  { value: "all", label: "All activity", prefix: undefined },
  { value: "version.", label: "Versions", prefix: "version." },
  { value: "source.", label: "Sources", prefix: "source." },
  { value: "user.", label: "User changes", prefix: "user." },
  { value: "share.", label: "Sharing", prefix: "share." },
  { value: "client.error", label: "Browser errors", prefix: "client.error" },
] as const;

function StatusTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const color = tone === "warn" ? "text-warning" : tone === "ok" ? "text-success" : "text-primary-text";
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <Icon className={`h-5 w-5 shrink-0 ${color}`} aria-hidden />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate font-mono text-sm font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function SystemStatus({ status }: { status: AdminStatus }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatusTile icon={Database} label="Database" value={`OK · ${status.dbMs} ms`} tone={status.dbMs < 500 ? "ok" : "warn"} />
        <StatusTile
          icon={status.blobConfigured ? CheckCircle2 : AlertTriangle}
          label="File storage"
          value={status.blobConfigured ? "Connected" : "Not connected"}
          tone={status.blobConfigured ? "ok" : "warn"}
        />
        <StatusTile icon={Upload} label="Uploads (24 h)" value={String(status.last24h.uploads)} />
        <StatusTile
          icon={AlertTriangle}
          label="Browser errors (24 h)"
          value={String(status.last24h.clientErrors)}
          tone={status.last24h.clientErrors > 0 ? "warn" : "ok"}
        />
        <StatusTile icon={Users} label="Users" value={String(status.totals.users)} />
        <StatusTile icon={Activity} label="Sources · versions" value={`${status.totals.sources} · ${status.totals.versions}`} />
        <StatusTile icon={HardDrive} label="Uploaded (original size)" value={formatBytes(status.totals.uploadedBytes)} />
        <StatusTile
          icon={AlertTriangle}
          label="Failed sign-ins (24 h)"
          value={String(status.last24h.failedLogins)}
          tone={status.last24h.failedLogins > 10 ? "warn" : undefined}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {status.environment} · region {status.region}
        {status.commit ? ` · build ${status.commit}` : ""}. Request logs: Vercel → Logs. Page speed: Vercel → Speed Insights.
      </p>
    </div>
  );
}

const AdminPage = () => {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const [auditFilter, setAuditFilter] = useState<(typeof AUDIT_FILTERS)[number]["value"]>("all");
  const prefix = AUDIT_FILTERS.find((f) => f.value === auditFilter)?.prefix;
  const { sources } = useAppData();
  const users = useQuery({ queryKey: ["admin-users"], queryFn: fetchAdminUsers });
  const status = useQuery({ queryKey: ["admin-status"], queryFn: fetchAdminStatus, refetchInterval: 60_000 });
  const audit = useInfiniteQuery({
    queryKey: ["admin-audit", prefix],
    queryFn: ({ pageParam }) => fetchAdminAudit(pageParam, 50, prefix),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ["admin-users"] });
    void qc.invalidateQueries({ queryKey: ["admin-audit"] });
    void qc.invalidateQueries({ queryKey: ["admin-status"] });
    void qc.invalidateQueries({ queryKey: ["admin-activity"] });
  };

  const setRole = useMutation({
    mutationFn: (a: { id: string; role: AppRole }) => adminUpdateUserRole(a.id, a.role),
    onSuccess: () => setError(null),
    onError: (e) => setError(adminErrorMessage(e)),
    onSettled: refreshAll,
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminDeleteUser(id),
    onSuccess: () => setError(null),
    onError: (e) => setError(adminErrorMessage(e)),
    onSettled: refreshAll,
  });

  const events = audit.data?.pages.flatMap((p) => p.events) ?? [];
  const sourceName = (id: unknown) => sources.find((s) => s.id === id)?.name ?? null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container max-w-6xl space-y-6 py-8">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Administration</h1>
          <p className="text-sm text-muted-foreground">System health, user access and everything that changed.</p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive-text">
            {error}
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>System status</CardTitle>
          </CardHeader>
          <CardContent>
            {status.isLoading ? <p className="text-sm text-muted-foreground">Checking…</p> : null}
            {status.error ? <p className="text-sm text-destructive-text">The database is not reachable right now.</p> : null}
            {status.data ? <SystemStatus status={status.data} /> : null}
          </CardContent>
        </Card>

        <AdminCharts sources={sources} users={users.data ?? []} />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>Users</CardTitle>
            <InviteUserButton />
          </CardHeader>
          <CardContent>
            {users.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
            {users.error ? <p className="text-sm text-destructive-text">Could not load users.</p> : null}
            {users.data ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="w-36" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.data.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.username}</TableCell>
                      <TableCell>
                        <Select
                          value={u.role}
                          onValueChange={(role) => setRole.mutate({ id: u.id, role: role as AppRole })}
                        >
                          <SelectTrigger className="w-40" aria-label={`Role for ${u.username}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {roleLabel(r)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="space-x-2 whitespace-nowrap text-right">
                        <ResetLinkButton userId={u.id} username={u.username} />
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={remove.isPending || u.id === me?.id}
                          onClick={() => {
                            if (window.confirm(`Delete user "${u.username}"? This cannot be undone.`)) {
                              remove.mutate(u.id);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>

        <MatchingModelCard />
        <PendingInvitesCard />
        <SharedLinksCard />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>Activity</CardTitle>
            <Select value={auditFilter} onValueChange={(v) => setAuditFilter(v as typeof auditFilter)}>
              <SelectTrigger className="w-48" aria-label="Filter activity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIT_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="space-y-3">
            {audit.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
            {audit.error ? <p className="text-sm text-destructive-text">Could not load the audit log.</p> : null}
            {audit.data && events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing here yet.</p>
            ) : null}
            <ul className="divide-y divide-border text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{e.user?.username ?? "system"}</span>{" "}
                    <span className="text-foreground/80">{describeEvent(e, sourceName)}</span>
                  </span>
                  <time className="text-xs text-muted-foreground" dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString()}>
                    {timeAgo(e.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
            {audit.hasNextPage ? (
              <Button variant="outline" size="sm" disabled={audit.isFetchingNextPage} onClick={() => audit.fetchNextPage()}>
                {audit.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminPage;
