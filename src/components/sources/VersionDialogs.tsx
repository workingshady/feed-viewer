import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { liveVersionOf, type SourceDTO, type VersionDTO } from "@/lib/sourcesApi";
import { diffCounts, diffListings } from "@/lib/versionDiff";
import { useApplyVersion, useDeleteSource, useDeleteVersion, useVersionListings } from "@/hooks/useSources";
import { DiffBadges } from "./VersionRow";

type Target = { source: SourceDTO; version: VersionDTO } | null;

export function ApplyVersionDialog({ target, onClose }: { target: Target; onClose: () => void }) {
  const live = target ? liveVersionOf(target.source) : null;
  const liveListings = useVersionListings(target ? live : null);
  const nextListings = useVersionListings(target?.version ?? null);
  const apply = useApplyVersion();
  const loading = (!!live && liveListings.isLoading) || nextListings.isLoading;
  const counts =
    target && nextListings.data ? diffCounts(diffListings(liveListings.data ?? [], nextListings.data)) : null;

  return (
    <AlertDialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Apply v{target?.version.number} to {target?.source.name}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                Every page will show the listings from this version{live ? ` instead of the live v${live.number}` : ""}. You can
                switch back at any time.
              </p>
              {loading ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Comparing with the live version…
                </p>
              ) : counts ? (
                <p className="flex items-center gap-2">
                  Change on the site: <DiffBadges {...counts} />
                </p>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={apply.isPending}
            onClick={() => target && apply.mutate(target, { onSettled: onClose })}
          >
            Apply v{target?.version.number}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteVersionDialog({ target, onClose }: { target: Target; onClose: () => void }) {
  const del = useDeleteVersion();
  return (
    <AlertDialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete v{target?.version.number}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the uploaded file ({target?.version.fileName}) and its {target?.version.listingCount.toLocaleString()}{" "}
            parsed listings. It cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={del.isPending}
            onClick={() => target && del.mutate(target, { onSettled: onClose })}
          >
            Delete version
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteSourceDialog({
  source,
  onClose,
  onDeleted,
}: {
  source: SourceDTO | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [typed, setTyped] = useState("");
  const del = useDeleteSource();
  const matches = !!source && typed.trim() === source.name;
  const close = () => {
    setTyped("");
    onClose();
  };
  return (
    <AlertDialog open={!!source} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {source?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Deletes {source?.versions.length} version{source?.versions.length === 1 ? "" : "s"} and their files. Listings from this
            source disappear from every page. It cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-source-name">Type the source name to confirm</Label>
          <Input id="confirm-source-name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={!matches || del.isPending}
            onClick={() =>
              source &&
              del.mutate(
                { source },
                {
                  onSuccess: onDeleted,
                  onSettled: close,
                },
              )
            }
          >
            Delete source
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
