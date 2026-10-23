import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Link2, Loader2, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyLinkField } from "@/components/CopyLinkField";
import { createShare, listShares, revokeShare, shareUrl } from "@/lib/accessApi";
import { timeAgo } from "@/components/sources/format";
import { useAuth } from "@/providers/AuthProvider";
import { hasRole } from "@/lib/roles";

const EXPIRY: { value: string; label: string; days: 1 | 7 | 30 | 90 | null }[] = [
  { value: "1", label: "1 day", days: 1 },
  { value: "7", label: "7 days", days: 7 },
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "never", label: "Never", days: null },
];

/**
 * Create and manage read-only public links to one listing or a source's live listings. Recipients
 * need no account; links can expire and be revoked at any time.
 */
export function ShareDialog({
  kind,
  sourceId,
  listingRef,
  label,
  triggerLabel = "Share",
  size = "sm",
}: {
  kind: "listing" | "source";
  sourceId: string;
  listingRef?: string;
  label: string;
  triggerLabel?: string;
  size?: "sm" | "default";
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expiry, setExpiry] = useState("30");
  const [created, setCreated] = useState<string | null>(null);
  const key = ["shares", sourceId, listingRef ?? null];
  const shares = useQuery({
    queryKey: key,
    queryFn: () => listShares({ sourceId, listingRef }),
    enabled: open,
  });
  const create = useMutation({
    mutationFn: () =>
      createShare({ kind, sourceId, listingRef, label, expiresInDays: EXPIRY.find((e) => e.value === expiry)!.days }),
    onSuccess: (r) => {
      setCreated(shareUrl(r.token));
      void qc.invalidateQueries({ queryKey: ["shares"] });
    },
    onError: () => toast.error("Could not create the link"),
  });
  const revoke = useMutation({
    mutationFn: revokeShare,
    onSuccess: () => {
      toast.success("Link revoked — it stops working immediately");
      void qc.invalidateQueries({ queryKey: ["shares"] });
    },
  });

  if (!hasRole(user?.role, "editor")) return null;
  const relevant = (shares.data ?? []).filter((s) => s.kind === kind);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setCreated(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size={size}>
          <Share2 className="mr-1.5 h-4 w-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share {kind === "listing" ? "this listing" : `${label}'s listings`}</DialogTitle>
          <DialogDescription>
            Anyone with the link can view {kind === "listing" ? "this listing" : "the live listings of this source"} — read-only, no
            account needed. Quality reports, versions and settings stay private.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <CopyLinkField url={created} label="Share link" />
        ) : (
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="share-expiry">Link expires after</Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger id="share-expiry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Link2 className="mr-1.5 h-4 w-4" />}
              Create link
            </Button>
          </div>
        )}

        <section className="space-y-2" aria-labelledby="active-links">
          <h3 id="active-links" className="text-sm font-semibold">
            Active links
          </h3>
          {shares.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : relevant.length === 0 ? (
            <p className="text-xs text-muted-foreground">None yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border text-xs">
              {relevant.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">Created {timeAgo(s.createdAt)}</div>
                    <div className="text-muted-foreground">
                      {s.expiresAt ? `Expires ${timeAgo(s.expiresAt)}` : "Never expires"} ·{" "}
                      <Eye className="inline h-3 w-3" aria-hidden /> {s.viewCount} views
                      {s.lastViewedAt ? `, last ${timeAgo(s.lastViewedAt)}` : ""}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke.mutate(s.id)}
                    disabled={revoke.isPending}
                    aria-label="Revoke link"
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5 text-destructive-text" /> Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
