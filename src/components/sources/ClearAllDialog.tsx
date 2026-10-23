import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearAllSources, type SourceDTO } from "@/lib/sourcesApi";
import { SOURCES_KEY } from "@/hooks/useSources";
import { formatBytes } from "./format";

const PHRASE = "DELETE ALL";

/** Admin-only: removes every source with all its versions and stored files, after a typed confirmation. */
export function ClearAllButton({ sources, onCleared }: { sources: SourceDTO[]; onCleared?: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const versions = sources.reduce((n, s) => n + s.versions.length, 0);
  const bytes = sources.reduce((n, s) => n + s.versions.reduce((m, v) => m + v.fileBytes, 0), 0);

  async function run() {
    setBusy(true);
    try {
      const r = await clearAllSources();
      toast.success(`Deleted ${r.deletedSources} sources and ${r.deletedVersions} versions.`);
      await qc.invalidateQueries({ queryKey: SOURCES_KEY });
      setOpen(false);
      onCleared?.();
    } catch {
      toast.error("Could not delete everything. Nothing was removed from the list; try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={sources.length === 0}>
        <Trash2 className="mr-1.5 h-4 w-4 text-destructive-text" /> Clear all
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (busy) return;
          setOpen(o);
          if (!o) setTyped("");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete all sources?</DialogTitle>
            <DialogDescription>
              This permanently removes {sources.length} source{sources.length === 1 ? "" : "s"}, {versions} version
              {versions === 1 ? "" : "s"} and {formatBytes(bytes)} of uploaded files. Share links to them stop working. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="clear-all-confirm">
              Type <span className="font-mono font-semibold">{PHRASE}</span> to confirm
            </Label>
            <Input id="clear-all-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={busy} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void run()} disabled={busy || typed.trim() !== PHRASE}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="mr-1.5 h-4 w-4" />}
              Delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
