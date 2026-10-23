import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, KeyRound, Link2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyLinkField } from "@/components/CopyLinkField";
import { createInvite, createResetLink, inviteUrl, listInvites, listShares, revokeInvite, revokeShare } from "@/lib/accessApi";
import { ROLE_DESCRIPTIONS, roleLabel, type AppRole } from "@/lib/roles";
import { timeAgo } from "@/components/sources/format";

/** Invite people with a one-time link; they choose their own username and password. */
export function InviteUserButton() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<AppRole>("viewer");
  const [note, setNote] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => createInvite(role, note.trim() || undefined),
    onSuccess: (r) => {
      setLink(inviteUrl(r.token));
      void qc.invalidateQueries({ queryKey: ["admin-invites"] });
    },
    onError: () => toast.error("Could not create the invite"),
  });
  const close = () => {
    setOpen(false);
    setLink(null);
    setNote("");
  };
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="mr-1.5 h-4 w-4" /> Invite user
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a user</DialogTitle>
            <DialogDescription>
              Send them a one-time link. They pick their own username and password — no password is ever sent. The link works
              once and expires in 7 days.
            </DialogDescription>
          </DialogHeader>
          {link ? (
            <CopyLinkField url={link} label="Invite link" />
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["viewer", "editor", "admin"] as AppRole[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {roleLabel(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-note">Who is it for? (optional)</Label>
                <Input id="invite-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="e.g. Sara from marketing" />
              </div>
              <Button className="w-full" onClick={() => create.mutate()} disabled={create.isPending}>
                <Link2 className="mr-1.5 h-4 w-4" /> Create invite link
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Creates a 24-hour password reset link for a user (signs them out when used). */
export function ResetLinkButton({ userId, username }: { userId: string; username: string }) {
  const [link, setLink] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => createResetLink(userId),
    onSuccess: (r) => setLink(inviteUrl(r.token)),
    onError: () => toast.error("Could not create the reset link"),
  });
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => create.mutate()} disabled={create.isPending} title="Create a password reset link">
        <KeyRound className="h-4 w-4" />
        <span className="sr-only">Reset password for {username}</span>
      </Button>
      <Dialog open={!!link} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password reset link for {username}</DialogTitle>
            <DialogDescription>Valid for 24 hours, once. Using it signs {username} out everywhere.</DialogDescription>
          </DialogHeader>
          {link && <CopyLinkField url={link} label="Reset link" />}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PendingInvitesCard() {
  const qc = useQueryClient();
  const invites = useQuery({ queryKey: ["admin-invites"], queryFn: listInvites });
  const revoke = useMutation({
    mutationFn: revokeInvite,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-invites"] }),
  });
  const pending = invites.data ?? [];
  if (pending.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Pending invites and reset links</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border text-sm">
          {pending.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 truncate">
                {i.kind === "reset" ? "Password reset" : `Invite as ${roleLabel(i.role)}`}
                {i.note ? ` · ${i.note}` : ""}
              </span>
              <span className="text-xs text-muted-foreground">expires {timeAgo(i.expiresAt)}</span>
              <Button variant="ghost" size="sm" onClick={() => revoke.mutate(i.id)} aria-label="Revoke link">
                <Trash2 className="h-4 w-4 text-destructive-text" />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Every active public link, so nothing stays shared by accident. */
export function SharedLinksCard() {
  const qc = useQueryClient();
  const shares = useQuery({ queryKey: ["shares", "all"], queryFn: () => listShares() });
  const revoke = useMutation({
    mutationFn: revokeShare,
    onSuccess: () => {
      toast.success("Link revoked");
      void qc.invalidateQueries({ queryKey: ["shares"] });
    },
  });
  const list = shares.data ?? [];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Shared links</CardTitle>
        <CardDescription>Public, read-only links currently active. Revoking stops a link immediately.</CardDescription>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing is shared right now.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {list.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{s.kind === "listing" ? "Listing" : "All listings"}</span> · {s.label}{" "}
                  <span className="text-muted-foreground">({s.source.name})</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  <Eye className="inline h-3 w-3" aria-hidden /> {s.viewCount} · {s.expiresAt ? `expires ${timeAgo(s.expiresAt)}` : "no expiry"}
                </span>
                <Button variant="ghost" size="sm" onClick={() => revoke.mutate(s.id)} aria-label={`Revoke link to ${s.label}`}>
                  <Trash2 className="h-4 w-4 text-destructive-text" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
