import { useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  adminDeleteUser,
  adminUpdateUserRole,
  fetchAdminAudit,
  fetchAdminUsers,
  type AdminAuditEvent,
} from "@/lib/adminApi";
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

function describeEvent(e: AdminAuditEvent): string {
  const target = e.targetType ? ` ${e.targetType}${e.targetId ? ` ${e.targetId}` : ""}` : "";
  return `${e.action}${target}`;
}

const AdminPage = () => {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const users = useQuery({ queryKey: ["admin-users"], queryFn: fetchAdminUsers });
  const audit = useInfiniteQuery({
    queryKey: ["admin-audit"],
    queryFn: ({ pageParam }) => fetchAdminAudit(pageParam, 50),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ["admin-users"] });
    void qc.invalidateQueries({ queryKey: ["admin-audit"] });
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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Administration</h1>
        {error ? (
          <p role="alert" className="text-sm text-destructive-text">
            {error}
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
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
                    <TableHead className="w-24" />
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
                      <TableCell className="text-right">
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

        <Card>
          <CardHeader>
            <CardTitle>Audit log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {audit.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
            {audit.error ? <p className="text-sm text-destructive-text">Could not load the audit log.</p> : null}
            {audit.data && events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events yet.</p>
            ) : null}
            <ul className="divide-y divide-border text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{e.user?.username ?? "system"}</span>{" "}
                    <span className="text-foreground/80">{describeEvent(e)}</span>
                  </span>
                  <time className="text-xs text-muted-foreground" dateTime={e.createdAt}>
                    {new Date(e.createdAt).toLocaleString()}
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
